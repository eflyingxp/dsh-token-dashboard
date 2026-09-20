/**
 * data.mjs - reads the live host dsh-usage ledger plus the DSH session logs and
 * shapes them into the documents the TokenDashboard HTTP API serves.
 *
 * Sources:
 *   ~/.dsh/dsh-usage/usage-ledger.json       per-day/provider/model token + cost fold
 *   ~/.dsh/dsh-usage/provider-snapshots.json provider balance / plan quota snapshot
 *   ~/.dsh/sessions/<ws>/<session>/session.v3.jsonl.zstd  per-call usage (hourly view)
 *   ~/.token-dashboard/usage-price-overrides.json          hand-entered unit prices
 *
 * The host ledger only keeps daily buckets, so the hourly view is folded
 * straight from the per-call usage events stored inside the session logs.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const HOME = os.homedir()

export const LEDGER_PATH = path.join(HOME, '.dsh', 'dsh-usage', 'usage-ledger.json')
export const SNAPSHOTS_PATH = path.join(HOME, '.dsh', 'dsh-usage', 'provider-snapshots.json')
export const SESSIONS_DIR = path.join(HOME, '.dsh', 'sessions')
export const OVERRIDES_PATH = path.join(HOME, '.token-dashboard', 'usage-price-overrides.json')

const META = {
  ledgerPath: LEDGER_PATH,
  snapshotsPath: SNAPSHOTS_PATH,
  sessionsDir: SESSIONS_DIR,
  overridesPath: OVERRIDES_PATH
}

export function meta() {
  return META
}

function n(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export function emptyTotals() {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, calls: 0, cost: 0 }
}

export function addTotals(target, source) {
  target.inputTokens += n(source.inputTokens)
  target.outputTokens += n(source.outputTokens)
  target.cacheReadTokens += n(source.cacheReadTokens)
  target.cacheWriteTokens += n(source.cacheWriteTokens)
  target.reasoningTokens += n(source.reasoningTokens)
  target.calls += n(source.calls)
  target.cost += n(source.cost)
  return target
}

export function totalTokens(t) {
  return t.inputTokens + t.outputTokens + t.cacheReadTokens + t.cacheWriteTokens
}

export function pad2(value) {
  return String(value).padStart(2, '0')
}

export function localDayKey(ms) {
  const d = new Date(ms)
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
}

function readJsonSync(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    return null
  }
}

export function readLedger() {
  const doc = readJsonSync(LEDGER_PATH)
  if (!doc || typeof doc !== 'object' || doc.days === null || typeof doc.days !== 'object') return null
  return doc
}

export function readSnapshots() {
  const doc = readJsonSync(SNAPSHOTS_PATH)
  if (!doc || typeof doc !== 'object') return null
  return doc
}

//#region qwen-token-plan-cn live plan probe
// The host dsh-usage plugin ships no balance/plan adapter for the Aliyun
// "token plan" provider, so its snapshot never appears in the file above. The
// token-plan gateway checks the plan quota BEFORE validating the request body,
// and it refuses exhausted plans with a 429 that names the window and its
// reset time. A deliberately empty chat request therefore acts as a free
// probe: 429 => that window is at 100% used with a known reset, any 400 =>
// quota is still available. No tokens are ever billed for the probe.
const CREDENTIALS_PATH = path.join(HOME, '.dsh', '.credentials.yaml')
const QWEN_PROVIDER_ID = 'qwen-token-plan-cn'
const QWEN_PROBE_URL = 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions'
const QWEN_PROBE_MODEL = 'qwen3.8-flash'
const QWEN_PROBE_TTL_MS = 5 * 60 * 1000

let qwenProbe = { at: 0, plan: null, credential: 'none', error: '' }

/** Pull QWEN_TOKEN_PLAN_CN_API_KEY out of the DSH managed credentials document. */
function readQwenKey() {
  if (process.env.QWEN_TOKEN_PLAN_CN_API_KEY) return process.env.QWEN_TOKEN_PLAN_CN_API_KEY
  try {
    const text = fs.readFileSync(CREDENTIALS_PATH, 'utf8')
    const m = text.match(/^\s*QWEN_TOKEN_PLAN_CN_API_KEY:\s*"?([^"\n#]+)"?\s*$/m)
    if (process.env.TKDASH_DEBUG) console.error('readQwenKey match:', m ? m[1].length : 'no', 'textLen:', text.length)
    return m ? m[1].trim() : ''
  } catch (err) {
    if (process.env.TKDASH_DEBUG) console.error('readQwenKey err:', String(err))
    return ''
  }
}

/** "09-21 19:00:00 UTC" (current year) -> epoch ms, or null. */
function parseQwenReset(text) {
  const m = String(text || '').match(/(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const ms = Date.UTC(new Date().getUTCFullYear(), Number(m[1]) - 1, Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]))
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

function qwenWindow(key, name, percent, resetsAt) {
  const w = { key, name, percent }
  if (resetsAt) w.resetsAt = resetsAt
  return w
}

function qwenProbeBody(text) {
  const lower = String(text || '').toLowerCase()
  if (lower.indexOf('quota') === -1 && lower.indexOf('throttl') === -1) return null
  const resetsAt = parseQwenReset(text)
  const m = lower.match(/(1|4|8)?-?\s*(hour|week|7-day|day)/)
  let key = 'week'
  let name = '7 天窗口'
  if (m && m[2] === 'hour') { key = m[1] ? m[1] + 'h' : '5h'; name = (m[1] || 5) + ' 小时窗口' }
  else if (m && m[2] === 'day') { key = 'day'; name = '当日窗口' }
  return { windows: [qwenWindow(key, name, 100, resetsAt)] }
}

async function probeQwenPlan() {
  const now = Date.now()
  if (now - qwenProbe.at < QWEN_PROBE_TTL_MS) return qwenProbe
  const key = readQwenKey()
  const credential = key ? 'env' : 'none'
  let plan = null
  if (key) {
    try {
      const res = await fetch(QWEN_PROBE_URL, {
        method: 'POST',
        headers: { 'authorization': 'Bearer ' + key, 'content-type': 'application/json' },
        body: JSON.stringify({ model: QWEN_PROBE_MODEL, messages: [], max_tokens: 1 }),
        signal: AbortSignal.timeout(15000)
      })
      const body = await res.text()
      if (res.status === 429) plan = qwenProbeBody(body)
      else plan = { windows: [qwenWindow('week', '7 天窗口', 0, null)] }
    } catch (err) {
      return { at: now, plan: null, credential, error: String((err && err.message) || err) + (err && err.cause ? ' / ' + String(err.cause.message || err.cause.code || err.cause) : '') }
    }
  }
  qwenProbe = { at: now, plan, credential, error: '' }
  return qwenProbe
}

/** Snapshot entry merged into the overview document for qwen-token-plan-cn. */
export async function qwenPlanSnapshot() {
  const probe = await probeQwenPlan()
  const entry = {
    provider: QWEN_PROVIDER_ID,
    displayName: 'Qwen Token Plan CN',
    credential: probe.credential,
    supported: true,
    updatedAt: probe.at
  }
  if (probe.plan) entry.plan = { windows: probe.plan.windows, updatedAt: probe.at }
  else entry.error = probe.credential === 'none' ? '未找到 QWEN_TOKEN_PLAN_CN_API_KEY 凭证' : '套餐探测失败: ' + (probe.error || '未知错误')
  return entry
}
//#endregion

export function loadOverrides() {
  const doc = readJsonSync(OVERRIDES_PATH)
  return doc && typeof doc === 'object' && !Array.isArray(doc) ? doc : {}
}

export function saveOverrides(overrides) {
  fs.mkdirSync(path.dirname(OVERRIDES_PATH), { recursive: true })
  fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(overrides, null, 2) + '\n')
}

/** Unit prices in CNY per million tokens; used only to estimate rows the ledger left at zero. */
const DEFAULT_PRICES = {
  'deepseek-flash': { input: 2, output: 8, cacheRead: 0.04, cacheWrite: 2 },
  'deepseek-v4.1-flash-expires-on-0910': { input: 2, output: 8, cacheRead: 0.04, cacheWrite: 2 },
  'deepseek-v4-pro': { input: 9, output: 27, cacheRead: 0.3, cacheWrite: 9 }
}

export function priceFor(model, overrides) {
  const over = (overrides && overrides[model]) || {}
  const base = DEFAULT_PRICES[model] || {}
  const pick = function (key) {
    const v = over[key]
    if (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v))) return Number(v)
    return base[key]
  }
  const price = { input: pick('input'), output: pick('output'), cacheRead: pick('cacheRead'), cacheWrite: pick('cacheWrite') }
  const known = price.input !== undefined || price.output !== undefined || price.cacheRead !== undefined || price.cacheWrite !== undefined
  return known ? price : null
}

export function estimateCost(model, totals, overrides) {
  const price = priceFor(model, overrides)
  if (price === null) return null
  const inputMiss = price.input !== undefined ? price.input : 0
  const cacheRead = price.cacheRead !== undefined ? price.cacheRead : inputMiss
  const cacheWrite = price.cacheWrite !== undefined ? price.cacheWrite : inputMiss
  const output = price.output !== undefined ? price.output : 0
  const spend = (totals.inputTokens * inputMiss + totals.cacheReadTokens * cacheRead + totals.cacheWriteTokens * cacheWrite + totals.outputTokens * output) / 1e6
  return Math.round(spend * 1e6) / 1e6
}

function modelKey(provider, model) {
  return provider + '/' + model
}

function bucket(map, key) {
  let b = map.get(key)
  if (b === undefined) {
    b = emptyTotals()
    map.set(key, b)
  }
  return b
}

function mondayOf(dayKey) {
  const d = new Date(dayKey + 'T12:00:00')
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return localDayKey(d.getTime())
}

function bucketKey(dayKey, dim) {
  if (dim === 'week') return mondayOf(dayKey)
  if (dim === 'month') return dayKey.slice(0, 7)
  return dayKey
}

function bucketStart(dayKey, dim) {
  if (dim === 'week') return mondayOf(dayKey)
  if (dim === 'month') return dayKey.slice(0, 7) + '-01'
  return dayKey
}

function monthsBetween(fromKey, toKey) {
  const out = []
  const from = new Date(fromKey.slice(0, 7) + '-01T12:00:00')
  const to = new Date(toKey.slice(0, 7) + '-01T12:00:00')
  while (from <= to) {
    out.push(from.getFullYear() + '-' + pad2(from.getMonth() + 1))
    from.setMonth(from.getMonth() + 1)
  }
  return out
}

function daysBetween(fromKey, toKey) {
  const out = []
  const from = new Date(fromKey + 'T12:00:00')
  const to = new Date(toKey + 'T12:00:00')
  while (from <= to) {
    out.push(localDayKey(from.getTime()))
    from.setDate(from.getDate() + 1)
  }
  return out
}

function ensureBucket(map, key, start) {
  if (!map.has(key)) map.set(key, { key, start, models: {}, totals: emptyTotals() })
}

/**
 * Range aggregate over the ledger: grand totals, per-day rows, per-model rows
 * and per-provider rows. Ledger costs are authoritative; hand-entered overrides
 * only fill models the ledger left at zero.
 */
export function aggregateRange(days, overrides) {
  const safeDays = Math.max(1, Math.min(3650, Number(days) || 7))
  const cutoff = localDayKey(Date.now() - (safeDays - 1) * 86400000)
  const doc = readLedger()
  const totals = emptyTotals()
  const byDayMap = new Map()
  const byModelMap = new Map()
  const byProviderMap = new Map()
  let entriesTotal = 0
  let firstDay = null
  let lastDay = null

  if (doc) {
    for (const day of Object.keys(doc.days).sort()) {
      if (day < cutoff) continue
      const provs = doc.days[day] || {}
      const dayRow = bucket(byDayMap, day)
      if (firstDay === null) firstDay = day
      lastDay = day
      for (const provider of Object.keys(provs)) {
        const models = provs[provider] || {}
        const provRow = bucket(byProviderMap, provider)
        for (const model of Object.keys(models)) {
          const v = models[model] || {}
          const key = modelKey(provider, model)
          const mb = bucket(byModelMap, key)
          if (mb.provider === undefined) {
            mb.provider = provider
            mb.model = model
          }
          addTotals(dayRow, v)
          addTotals(provRow, v)
          addTotals(mb, v)
          addTotals(totals, v)
          entriesTotal += n(v.calls)
        }
      }
    }
  }

  for (const row of byDayMap.values()) {
    row.ledgerCost = row.cost
    row.estimatedCost = 0
  }
  for (const row of byProviderMap.values()) {
    row.ledgerCost = row.cost
    row.estimatedCost = 0
  }

  if (doc) {
    for (const day of Object.keys(doc.days)) {
      if (day < cutoff) continue
      const dayRow = byDayMap.get(day)
      if (dayRow === undefined) continue
      const provs = doc.days[day] || {}
      for (const provider of Object.keys(provs)) {
        const models = provs[provider] || {}
        const provRow = byProviderMap.get(provider)
        for (const model of Object.keys(models)) {
          const v = models[model] || {}
          if (n(v.cost) > 0) continue
          const estimate = estimateCost(model, v, overrides)
          if (estimate === null) continue
          dayRow.estimatedCost += estimate
          if (provRow) provRow.estimatedCost += estimate
        }
      }
    }
  }

  const byModel = []
  for (const [key, mb] of byModelMap) {
    const price = priceFor(mb.model, overrides)
    const estimate = mb.cost <= 0 && price !== null ? estimateCost(mb.model, mb, overrides) : null
    byModel.push({
      key,
      provider: mb.provider,
      model: mb.model,
      inputTokens: mb.inputTokens,
      outputTokens: mb.outputTokens,
      cacheReadTokens: mb.cacheReadTokens,
      cacheWriteTokens: mb.cacheWriteTokens,
      reasoningTokens: mb.reasoningTokens,
      calls: mb.calls,
      cost: mb.cost,
      ledgerCost: mb.cost,
      estimatedCost: estimate === null ? 0 : estimate,
      effectiveCost: mb.cost > 0 ? mb.cost : (estimate === null ? 0 : estimate),
      priced: price !== null,
      price
    })
  }
  byModel.sort(function (a, b) {
    return (b.effectiveCost - a.effectiveCost) || (totalTokens(b) - totalTokens(a))
  })

  const byDay = []
  for (const [day, dt] of byDayMap) {
    dt.day = day
    byDay.push(dt)
  }
  byDay.sort(function (a, b) {
    return a.day < b.day ? -1 : a.day > b.day ? 1 : 0
  })

  const byProvider = []
  for (const [provider, pt] of byProviderMap) {
    pt.provider = provider
    byProvider.push(pt)
  }
  byProvider.sort(function (a, b) {
    return totalTokens(b) - totalTokens(a)
  })

  let estimatedTotal = 0
  for (const row of byDay) {
    row.cost = row.ledgerCost + row.estimatedCost
    estimatedTotal += row.estimatedCost
  }
  for (const row of byProvider) {
    row.cost = row.ledgerCost + row.estimatedCost
  }
  totals.ledgerCost = totals.cost
  totals.estimatedCost = estimatedTotal
  totals.cost = totals.ledgerCost + estimatedTotal

  return {
    rangeDays: safeDays,
    cutoff,
    firstDay,
    lastDay,
    entriesTotal,
    totals,
    byDay,
    byProvider,
    byModel,
    noPriceModels: byModel.filter(function (row) { return row.effectiveCost <= 0 }).map(function (row) { return row.model })
  }
}

/** Bucketed token series for the trend chart: dim is day | week | month. */
export function ledgerSeries(dim, days, overrides) {
  const safeDays = Math.max(1, Math.min(3650, Number(days) || 7))
  const cutoff = localDayKey(Date.now() - (safeDays - 1) * 86400000)
  const today = localDayKey(Date.now())
  const doc = readLedger()
  const bucketMap = new Map()
  const modelTotals = new Map()

  if (doc) {
    for (const day of Object.keys(doc.days).sort()) {
      if (day < cutoff) continue
      const key = bucketKey(day, dim)
      ensureBucket(bucketMap, key, bucketStart(day, dim))
      const b = bucketMap.get(key)
      const provs = doc.days[day] || {}
      for (const provider of Object.keys(provs)) {
        const models = provs[provider] || {}
        for (const model of Object.keys(models)) {
          const v = models[model] || {}
          const mk = modelKey(provider, model)
          const tokens = totalTokens(v)
          if (tokens <= 0) continue
          b.models[mk] = (b.models[mk] || 0) + tokens
          b.totals.inputTokens += n(v.inputTokens)
          b.totals.outputTokens += n(v.outputTokens)
          b.totals.cacheReadTokens += n(v.cacheReadTokens)
          b.totals.cacheWriteTokens += n(v.cacheWriteTokens)
          b.totals.calls += n(v.calls)
          b.totals.cost += n(v.cost)
          let mt = modelTotals.get(mk)
          if (mt === undefined) {
            mt = { key: mk, provider, model, tokens: 0, cost: 0, calls: 0 }
            modelTotals.set(mk, mt)
          }
          mt.tokens += tokens
          mt.cost += n(v.cost)
          mt.calls += n(v.calls)
        }
      }
    }
  }

  if (dim === 'day') {
    for (const day of daysBetween(cutoff, today)) ensureBucket(bucketMap, day, day)
  } else if (dim === 'month') {
    for (const month of monthsBetween(cutoff, today)) ensureBucket(bucketMap, month, month + '-01')
  } else {
    for (const day of daysBetween(cutoff, today)) {
      ensureBucket(bucketMap, bucketKey(day, dim), bucketStart(day, dim))
    }
  }

  const buckets = Array.from(bucketMap.values()).sort(function (a, b) {
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  }).map(function (b) {
    let tokens = 0
    for (const mk of Object.keys(b.models)) tokens += b.models[mk]
    return { key: b.key, start: b.start, models: b.models, tokens, calls: b.totals.calls, cost: b.totals.cost }
  })

  const models = Array.from(modelTotals.values()).sort(function (a, b) {
    return b.tokens - a.tokens
  })

  return { dim, rangeDays: safeDays, cutoff, buckets, models }
}

function listSessionFiles() {
  const out = []
  let workspaces
  try {
    workspaces = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true })
  } catch (err) {
    return out
  }
  for (const ws of workspaces) {
    if (!ws.isDirectory()) continue
    const wsDir = path.join(SESSIONS_DIR, ws.name)
    let sessions
    try {
      sessions = fs.readdirSync(wsDir, { withFileTypes: true })
    } catch (err) {
      continue
    }
    for (const session of sessions) {
      if (!session.isDirectory()) continue
      const file = path.join(wsDir, session.name, 'session.v3.jsonl.zstd')
      try {
        if (fs.statSync(file).isFile()) out.push(file)
      } catch (err) {
        /* not a stored session */
      }
    }
  }
  return out
}

const callCache = new Map()
let allCalls = []
let callsScannedAt = 0

function extractCalls(text) {
  const calls = []
  let provider = ''
  let model = ''
  const lines = text.split('\n')
  for (const line of lines) {
    if (line.length === 0) continue
    const isContext = line.indexOf('request/context') !== -1
    const isUsage = !isContext && line.indexOf('assistant/message') !== -1 && line.indexOf('"usage"') !== -1
    if (!isContext && !isUsage) continue
    let event
    try {
      event = JSON.parse(line)
    } catch (err) {
      continue
    }
    if (event.type === 'request/context' && event.data) {
      if (event.data.provider) provider = String(event.data.provider)
      if (event.data.model) model = String(event.data.model)
      continue
    }
    if (event.type === 'assistant/message' && event.data && event.data.usage) {
      const u = event.data.usage
      calls.push({
        t: n(event.time),
        p: provider,
        m: model,
        i: n(u.inputTokens),
        o: n(u.outputTokens),
        cr: n(u.cacheReadTokens),
        cw: n(u.cacheWriteTokens)
      })
    }
  }
  return calls
}

export async function getAllCalls(force) {
  const now = Date.now()
  if (!force && callsScannedAt !== 0 && now - callsScannedAt < 15000) return allCalls
  const files = listSessionFiles()
  const seen = new Set(files)
  let changed = false
  for (const file of files) {
    let stat
    try {
      stat = fs.statSync(file)
    } catch (err) {
      continue
    }
    const cached = callCache.get(file)
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) continue
    let calls = []
    try {
      const result = await run('zstd', ['-dc', file], { maxBuffer: 512 * 1024 * 1024, encoding: 'buffer' })
      calls = extractCalls(Buffer.from(result.stdout).toString('utf8'))
    } catch (err) {
      calls = []
    }
    callCache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, calls })
    changed = true
  }
  for (const file of Array.from(callCache.keys())) {
    if (!seen.has(file)) {
      callCache.delete(file)
      changed = true
    }
  }
  callsScannedAt = now
  if (changed) {
    const merged = []
    for (const file of files) {
      const cached = callCache.get(file)
      if (cached) for (const call of cached.calls) merged.push(call)
    }
    merged.sort(function (a, b) { return a.t - b.t })
    allCalls = merged
  }
  return allCalls
}

function localHourIso(ms) {
  const d = new Date(ms)
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':00'
}

/** Hourly per-model token series folded from the session logs. */
export async function hourlySeries(hours) {
  const safeHours = Math.max(1, Math.min(24 * 31, Number(hours) || 72))
  const calls = await getAllCalls(false)
  const nowMs = Date.now()
  const startHour = new Date(nowMs)
  startHour.setMinutes(0, 0, 0)
  startHour.setHours(startHour.getHours() - (safeHours - 1))
  const startMs = startHour.getTime()
  const bucketMap = new Map()
  const modelTotals = new Map()
  let earliest = null

  for (let i = 0; i < safeHours; i += 1) {
    const ms = startMs + i * 3600000
    bucketMap.set(ms, { key: ms, start: localHourIso(ms), models: {}, tokens: 0, calls: 0 })
  }

  for (const call of calls) {
    if (call.t < startMs) continue
    if (earliest === null) earliest = call.t
    const d = new Date(call.t)
    d.setMinutes(0, 0, 0)
    const key = d.getTime()
    let b = bucketMap.get(key)
    if (b === undefined) {
      b = { key, start: localHourIso(key), models: {}, tokens: 0, calls: 0 }
      bucketMap.set(key, b)
    }
    const tokens = call.i + call.o + call.cr + call.cw
    if (tokens <= 0) continue
    const mk = call.p + '/' + call.m
    b.models[mk] = (b.models[mk] || 0) + tokens
    b.tokens += tokens
    b.calls += 1
    let mt = modelTotals.get(mk)
    if (mt === undefined) {
      mt = { key: mk, provider: call.p, model: call.m, tokens: 0, cost: 0, calls: 0 }
      modelTotals.set(mk, mt)
    }
    mt.tokens += tokens
    mt.calls += 1
  }

  const buckets = Array.from(bucketMap.values()).sort(function (a, b) { return a.key - b.key })
  const models = Array.from(modelTotals.values()).sort(function (a, b) { return b.tokens - a.tokens })

  return { dim: 'hour', hours: safeHours, startMs, earliest, buckets, models, source: 'session-logs' }
}
