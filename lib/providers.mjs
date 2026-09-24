/**
 * providers.mjs - self-reliant credential discovery + provider quota probing.
 *
 * DSH 0.1.7-rc.1 migrated `settings.yaml` into the active profile patch
 * (cordis.patch.yml). The host dsh-usage plugin's cross-plugin settings read
 * of the `llm-pi-ai` namespace stopped returning provider profiles after the
 * migration, so its snapshot marks every pi-ai provider `credential: "none"`
 * and the overview loses those cards.
 *
 * This module fills the gap without waiting on the host plugin:
 *   - resolves API keys from process env, ~/.dsh/.credentials.yaml `refs:`
 *     and the apiKeyEnv mapping stored in the profile patches
 *     (~/.dsh/profiles/<name>/cordis.patch.yml, falling back to the legacy
 *     ~/.dsh/settings.yaml layout);
 *   - probes the provider's public balance / plan-quota endpoint directly;
 *   - returns snapshot-shaped entries so the overview renderer needs no
 *     changes beyond splicing them in.
 *
 * Never throws: unresolved or failing providers are simply reported.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOME = os.homedir()
const CREDENTIALS_PATH = path.join(HOME, '.dsh', '.credentials.yaml')
const LEGACY_SETTINGS_PATH = path.join(HOME, '.dsh', 'settings.yaml.imported')

const PROBE_TTL_MS = 5 * 60 * 1000
const PROBE_TIMEOUT_MS = 15000

/** Pretty card titles; ids fall back to themselves. */
const DISPLAY_NAMES = {
  'deepseek-official': 'DeepSeek',
  deepseek: 'DeepSeek',
  'moonshotai-cn': 'Moonshot 国内',
  moonshotai: 'Moonshot 国际',
  'kimi-coding': 'Kimi For Coding',
  'zai-coding-cn': 'GLM Coding Plan',
  'zai-coding': 'GLM Coding Plan',
  zai: 'GLM Coding (国际)',
  'minimax-cn': 'MiniMax Coding',
  minimax: 'MiniMax Coding (国际)',
  openrouter: 'OpenRouter',
  siliconflow: '硅基流动',
  'siliconflow-cn': '硅基流动',
  'siliconflow-intl': 'SiliconFlow 国际',
  zenmux: 'ZenMux',
  'opencode-go': 'OpenCode Go',
  'qwen-token-plan-cn': 'Qwen Token Plan CN'
}

/** Conventional env var names used when no profile mapping exists. */
const FALLBACK_ENV = {
  'deepseek-official': 'DEEPSEEK_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  'moonshotai-cn': 'MOONSHOTAI_CN_API_KEY',
  moonshotai: 'MOONSHOTAI_API_KEY',
  'kimi-coding': 'KIMI_CODING_API_KEY',
  'zai-coding-cn': 'ZAI_CODING_CN_API_KEY',
  'zai-coding': 'ZAI_CODING_API_KEY',
  zai: 'ZAI_API_KEY',
  'minimax-cn': 'MINIMAX_CN_API_KEY',
  minimax: 'MINIMAX_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  siliconflow: 'SILICONFLOW_API_KEY',
  'siliconflow-cn': 'SILICONFLOW_CN_API_KEY',
  'siliconflow-intl': 'SILICONFLOW_API_KEY',
  zenmux: 'ZENMUX_API_KEY',
  'opencode-go': 'OPENCODE_GO_API_KEY'
}

function num(value) {
  const n = Number(value)
  return value !== '' && value != null && Number.isFinite(n) ? n : null
}

function toIso(value) {
  if (value == null) return null
  if (/^\d+$/.test(String(value))) {
    const ms = Number(value) < 1e12 ? Number(value) * 1000 : Number(value)
    const d = new Date(ms)
    return isNaN(d.getTime()) ? null : d.toISOString()
  }
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function pctOf(used, limit) {
  const u = num(used)
  const l = num(limit)
  if (u == null || l == null || l <= 0) return null
  return Math.max(0, Math.min(100, u / l * 100))
}

function clampPct(value) {
  const p = num(value)
  return p == null ? null : Math.max(0, Math.min(100, p))
}

//#region credential discovery

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch (err) {
    return ''
  }
}

/** Refs section of ~/.dsh/.credentials.yaml: NAME -> literal value. */
function loadCredentialRefs() {
  const text = readText(CREDENTIALS_PATH)
  const refs = new Map()
  let inRefs = false
  for (const line of text.split('\n')) {
    if (/^refs\s*:/.test(line)) { inRefs = true; continue }
    if (inRefs && /^\S/.test(line)) { inRefs = /^refs\s*:/.test(line); if (!inRefs) continue }
    if (!inRefs) continue
    const m = line.match(/^\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/)
    if (!m) continue
    const value = m[2].trim().replace(/^["']|["']$/g, '')
    if (value) refs.set(m[1], value)
  }
  return refs
}

/**
 * Provider -> apiKeyEnv mapping from the active profile patches
 * (~/.dsh/profiles/<name>/cordis.patch.yml, llm-pi-ai entry) plus the legacy
 * ~/.dsh/settings.yaml.imported document. Both use plain two-space YAML
 * nesting, so a line scan is enough.
 */
function loadProfileApiKeyEnvs() {
  const map = new Map()
  const sources = []
  try {
    for (const entry of fs.readdirSync(path.join(HOME, '.dsh', 'profiles'), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      sources.push(path.join(HOME, '.dsh', 'profiles', entry.name, 'cordis.patch.yml'))
    }
  } catch (err) { /* no profiles dir */ }
  sources.push(LEGACY_SETTINGS_PATH)
  for (const file of sources) {
    const text = readText(file)
    if (!text) continue
    collectPiAiApiKeys(text, map)
  }
  return map
}

/**
 * Scan one YAML document for an llm-pi-ai entry's providers.*.apiKeyEnv.
 * Layout (both shapes share the inner nesting):
 *   patch:   `- id: llm-pi-ai` / `  config:` / `    providers:` / `      <id>:` / `        apiKeyEnv: NAME`
 *   legacy:  `llm-pi-ai:` / `  providers:` / `    <id>:` / `      apiKeyEnv: NAME`
 * A key-only line at exactly providersIndent+2 names a provider; any deeper
 * `apiKeyEnv:` line inside it maps that provider to the env ref name.
 */
function collectPiAiApiKeys(text, map) {
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^(?:-\s+)?id:\s*["']?llm-pi-ai["']?\s*$/.test(lines[i]) && !/^\s*llm-pi-ai\s*:\s*$/.test(lines[i])) continue
    let providersIndent = null
    let currentProvider = null
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j]
      if (!line.trim() || line.trim().startsWith('#')) continue
      const indent = line.match(/^\s*/)[0].length
      if (indent === 0) break // next top-level entry ends this block
      if (providersIndent === null) {
        if (/^\s*providers\s*:\s*$/.test(line) && /^\s*config\s*:\s*$/.test(lines[j - 1] || '')) providersIndent = indent
        else if (/^\s*providers\s*:\s*$/.test(line)) providersIndent = indent
        continue
      }
      const providerMatch = line.match(new RegExp('^\\s{' + (providersIndent + 2) + '}(\\S[^:]*):\\s*$'))
      if (providerMatch) {
        currentProvider = providerMatch[1].trim().replace(/^["']|["']$/g, '')
        continue
      }
      if (indent > providersIndent + 2) {
        const env = line.match(/^\s+apiKeyEnv\s*:\s*["']?([A-Za-z_][A-Za-z0-9_]*)["']?\s*$/)
        if (env && currentProvider && !map.has(currentProvider)) map.set(currentProvider, env[1])
      }
    }
  }
  return map
}

let credCache = { at: 0, refs: null, envs: null }

function credentials() {
  const now = Date.now()
  if (credCache.refs === null || now - credCache.at > 60000) {
    credCache = { at: now, refs: loadCredentialRefs(), envs: loadProfileApiKeyEnvs() }
  }
  return credCache
}

/** Best-effort key for one provider id, or null when nothing is stored. */
export function resolveProviderKey(provider) {
  const { refs, envs } = credentials()
  const envName = envs.get(provider) || FALLBACK_ENV[provider]
  if (!envName) return null
  if (process.env[envName]) return { key: process.env[envName], envName, source: 'env' }
  const ref = refs.get(envName)
  if (ref) return { key: ref, envName, source: 'credentials' }
  return null
}

//#endregion

//#region provider probes (mirrors the host dsh-usage adapters)

async function getJSON(url, headers) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
  let body = null
  try { body = await res.json() } catch (err) { body = null }
  return { status: res.status, body }
}

function balanceOf(currency, total) {
  const v = num(total)
  return v == null ? null : { currency, totalBalance: String(v), updatedAt: Date.now() }
}

const PROBES = {
  'deepseek-official': {
    deepseek: true,
    async run(key) {
      const r = await getJSON('https://api.deepseek.com/user/balance', { authorization: 'Bearer ' + key })
      const info = r.status === 200 && Array.isArray(r.body && r.body.balance_infos) ? r.body.balance_infos[0] : null
      return info ? balanceOf(info.currency, info.total_balance) : null
    }
  },
  'moonshotai-cn': {
    async run(key) {
      const r = await getJSON('https://api.moonshot.cn/v1/users/me/balance', { authorization: 'Bearer ' + key })
      const d = r.status === 200 && r.body && r.body.data
      return d && d.available_balance != null ? balanceOf('CNY', d.available_balance) : null
    }
  },
  moonshotai: {
    async run(key) {
      const r = await getJSON('https://api.moonshot.ai/v1/users/me/balance', { authorization: 'Bearer ' + key })
      const d = r.status === 200 && r.body && r.body.data
      return d && d.available_balance != null ? balanceOf('USD', d.available_balance) : null
    }
  },
  openrouter: {
    async run(key) {
      const r = await getJSON('https://openrouter.ai/api/v1/credits', { authorization: 'Bearer ' + key })
      const d = r.status === 200 && r.body && r.body.data
      return d && d.total_credits != null ? balanceOf('USD', num(d.total_credits) - (num(d.total_usage) || 0)) : null
    }
  },
  siliconflow: {
    async run(key) {
      const r = await getJSON('https://api.siliconflow.cn/v1/user/info', { authorization: 'Bearer ' + key })
      const d = r.status === 200 && r.body && r.body.data
      return d && d.totalBalance != null ? balanceOf('CNY', d.totalBalance) : null
    }
  },
  'siliconflow-cn': 'siliconflow',
  'siliconflow-intl': {
    async run(key) {
      const r = await getJSON('https://api.siliconflow.com/v1/user/info', { authorization: 'Bearer ' + key })
      const d = r.status === 200 && r.body && r.body.data
      return d && d.totalBalance != null ? balanceOf('USD', d.totalBalance) : null
    }
  },
  zenmux: {
    async run(key) {
      const r = await getJSON('https://zenmux.ai/api/v1/management/payg/balance', { authorization: 'Bearer ' + key })
      const d = r.status === 200 && r.body && r.body.data
      return d && d.total_credits != null ? balanceOf('USD', d.total_credits) : null
    }
  },
  'kimi-coding': {
    async run(key) {
      const r = await getJSON('https://api.kimi.com/coding/v1/usages', { authorization: 'Bearer ' + key })
      if (r.status !== 200 || !r.body) return null
      const windows = []
      if (Array.isArray(r.body.limits)) {
        for (const e of r.body.limits) {
          if (!e || typeof e.detail !== 'object') continue
          const d = e.detail
          const dur = e.window ? num(e.window.duration) : null
          windows.push({
            key: dur === 300 && e.window && e.window.timeUnit === 'TIME_UNIT_MINUTE' ? '5h' : (dur != null ? 'w-' + dur : 'window'),
            name: d.name || null,
            percent: pctOf(d.used, d.limit),
            resetsAt: toIso(d.resetTime)
          })
        }
      }
      if (r.body.usage && typeof r.body.usage === 'object') {
        windows.push({ key: 'week', name: 'Weekly', percent: pctOf(r.body.usage.used, r.body.usage.limit), resetsAt: toIso(r.body.usage.resetTime) })
      }
      return windows.length > 0 ? { windows } : null
    }
  },
  'zai-coding-cn': 'glm-cn',
  'zai-coding': 'glm-intl',
  zai: 'glm-intl',
  'glm-cn': {
    async run(key) { return glmQuota('https://open.bigmodel.cn/api/monitor/usage/quota/limit', key) }
  },
  'glm-intl': {
    async run(key) { return glmQuota('https://api.z.ai/api/monitor/usage/quota/limit', key) }
  },
  'minimax-cn': 'mm-cn',
  minimax: 'mm-intl',
  'mm-cn': {
    async run(key) { return mmQuota('https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains', key) }
  },
  'mm-intl': {
    async run(key) { return mmQuota('https://api.minimax.io/v1/api/openplatform/coding_plan/remains', key) }
  },
  'opencode-go': {
    async run(key) {
      const r = await getJSON('https://opencode.ai/zen/go/v1/usage', { authorization: 'Bearer ' + key })
      if (r.status !== 200 || !r.body || typeof r.body.usage !== 'object') return null
      const windows = []
      for (const pair of [['rolling', '5h'], ['weekly', 'week'], ['monthly', 'month']]) {
        const row = r.body.usage[pair[0]]
        if (!row || typeof row !== 'object') continue
        const percent = clampPct(row.percent)
        windows.push({ key: pair[1], name: pair[1] === '5h' ? '5 小时窗口' : pair[1] === 'week' ? '本周窗口' : '当月窗口', percent, resetsAt: percent === 0 ? null : toIso(row.resetsAt) })
      }
      return windows.length > 0 ? { windows } : null
    }
  }
}

function probeFor(provider) {
  let probe = PROBES[provider]
  const seen = new Set()
  while (typeof probe === 'string' && !seen.has(probe)) {
    seen.add(probe)
    probe = PROBES[probe]
  }
  return probe && typeof probe === 'object' ? probe : null
}

async function glmQuota(url, key) {
  const r = await getJSON(url, { authorization: key, 'accept-language': 'en-US,en' })
  if (r.status !== 200 || !r.body || r.body.success !== true) return null
  const limits = r.body.data && r.body.data.limits
  if (!Array.isArray(limits) || limits.length === 0) return null
  const windows = limits.map((e) => ({
    key: e.unit === 3 ? '5h' : e.unit === 6 ? 'week' : 'window',
    name: e.unit === 3 ? '5 小时' : e.unit === 6 ? '本周' : '窗口',
    percent: clampPct(e.percentage),
    resetsAt: toIso(e.nextResetTime)
  }))
  return { windows }
}

async function mmQuota(url, key) {
  const r = await getJSON(url, { authorization: 'Bearer ' + key })
  if (r.status !== 200 || !r.body) return null
  const remains = Array.isArray(r.body.model_remains) ? r.body.model_remains : []
  const g = remains.find((e) => e && e.model_name === 'general')
  if (!g) return null
  const windows = []
  if (g.current_interval_remaining_percent != null) {
    windows.push({ key: '5h', name: '5 小时', percent: clampPct(100 - Number(g.current_interval_remaining_percent)), resetsAt: toIso(g.end_time) })
  }
  if (g.current_weekly_status === 1 && g.current_weekly_remaining_percent != null) {
    windows.push({ key: 'week', name: '本周', percent: clampPct(100 - Number(g.current_weekly_remaining_percent)), resetsAt: toIso(g.weekly_end_time) })
  }
  return windows.length > 0 ? { windows } : null
}

//#endregion

const probeCache = new Map()

/**
 * Probe one provider. Cached for PROBE_TTL_MS. Returns a snapshot-shaped
 * entry fragment ({balance}|{plan}|null) or null when nothing usable.
 */
export async function probeProvider(provider) {
  const probe = probeFor(provider)
  if (!probe) return null
  const now = Date.now()
  const cached = probeCache.get(provider)
  if (cached && now - cached.at < PROBE_TTL_MS) return cached.result
  let result = null
  const cred = resolveProviderKey(provider)
  if (cred) {
    try {
      const raw = await probe.run(cred.key)
      if (raw && raw.windows) result = { plan: { windows: raw.windows, updatedAt: now } }
      else if (raw && raw.totalBalance !== undefined) result = { balance: raw }
    } catch (err) {
      result = null
    }
  }
  probeCache.set(provider, { at: now, result })
  return result
}

/**
 * Rewrite the overview snapshot map in place: every provider the host ledger
 * marked `credential: "none"` is re-resolved and re-probed here; entries that
 * come back with data are revived with `credential: "auto"` so the dashboard
 * shows them again. Providers that truly have no stored key stay untouched
 * (and remain filtered downstream).
 */
export async function reviveNoneCredentialProviders(providers) {
  if (!providers || typeof providers !== 'object') return
  const ids = Object.keys(providers).filter((id) => providers[id] && providers[id].credential === 'none')
  await Promise.all(ids.map(async (id) => {
    const entry = providers[id]
    const cred = resolveProviderKey(id)
    if (!cred) return
    const probed = await probeProvider(id)
    if (!probed) {
      // Key exists but the probe failed: keep the card visible with the error
      // instead of silently dropping the provider.
      entry.credential = 'auto'
      entry.credentialSource = cred.source + ':' + cred.envName
      if (!entry.error) entry.error = '已发现凭证（' + cred.envName + '），但余额/套餐探测失败'
      return
    }
    entry.credential = 'auto'
    entry.credentialSource = cred.source + ':' + cred.envName
    if (!entry.displayName || entry.displayName === id) entry.displayName = DISPLAY_NAMES[id] || id
    if (probed.balance) entry.balance = probed.balance
    if (probed.plan) entry.plan = probed.plan
    delete entry.error
    entry.updatedAt = Date.now()
  }))
}

/** Test hook: drop all caches. */
export function resetProviderCaches() {
  probeCache.clear()
  credCache = { at: 0, refs: null, envs: null }
}
