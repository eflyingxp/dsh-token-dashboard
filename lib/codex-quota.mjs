/**
 * codex-quota.mjs - Codex (ChatGPT) subscription quota probe.
 *
 * Talks to a long-lived `codex app-server --stdio` child via JSON-RPC and
 * reads rate limits through `account/rateLimits/read`. The Codex CLI owns
 * all OAuth refresh and credential storage; this module never reads or
 * writes ~/.codex/auth.json tokens itself.
 *
 * Response shape (codex-cli >= 0.155):
 * { rateLimits: { primary: {usedPercent, windowDurationMins, resetsAt},
 *                 secondary: {...}, planType: "plus" | "pro" | ... } }
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const REFRESH_MS = 5 * 60 * 1000     // quota data is coarse; 5 min is plenty
const REQUEST_TIMEOUT_MS = 15 * 1000
const RESTART_BACKOFF_MS = 30 * 1000 // after a crash, wait before re-spawning

let client = null                     // { child, nextId, pending, ready }
let clientBrokenUntil = 0
let cache = { at: 0, snapshot: null }

function authPath() {
  return path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'auth.json')
}

function codexInstalled() {
  return fs.existsSync(authPath())
}

function windowLabel(mins) {
  if (mins >= 10080) return '每周窗口'
  if (mins >= 1440 && mins < 10080) return Math.round(mins / 1440) + ' 天窗口'
  if (mins >= 300 && mins < 1440) return '5 小时窗口'
  if (mins >= 60) return Math.round(mins / 60) + ' 小时窗口'
  return mins + ' 分钟窗口'
}

function planLabel(planType) {
  var names = { plus: 'Plus', pro: 'Pro', team: 'Team', business: 'Business', enterprise: 'Enterprise', free: 'Free' }
  return names[planType] || planType || 'unknown'
}

/** Spawn the app-server and complete the JSON-RPC initialize handshake. */
function ensureClient() {
  if (client) return client
  var state = { child: null, nextId: 1, pending: new Map(), ready: null, closed: false }
  var child
  try {
    child = spawn('codex', ['app-server', '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] })
  } catch (err) {
    clientBrokenUntil = Date.now() + RESTART_BACKOFF_MS
    throw new Error('无法启动 codex CLI: ' + err.message)
  }
  state.child = child
  var buffer = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', function (chunk) {
    buffer += chunk
    var lineEnd
    while ((lineEnd = buffer.indexOf('\n')) !== -1) {
      var line = buffer.slice(0, lineEnd).trim()
      buffer = buffer.slice(lineEnd + 1)
      if (!line) continue
      var msg
      try { msg = JSON.parse(line) } catch { continue }
      if (msg.id !== undefined && state.pending.has(msg.id)) {
        var pending = state.pending.get(msg.id)
        state.pending.delete(msg.id)
        if (msg.error) pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)))
        else pending.resolve(msg.result)
      }
    }
  })
  child.on('error', function (err) {
    failAll(state, new Error('codex 进程错误: ' + err.message))
    dropClient(state, 'error')
  })
  child.on('exit', function (code) {
    failAll(state, new Error('codex app-server 已退出 (code ' + code + ')'))
    dropClient(state, 'exit')
  })
  state.ready = request(state, 'initialize', {
    protocolVersion: '1.0.0',
    clientInfo: { name: 'token-dashboard', title: 'TokenDashboard', version: '1.0.0' }
  }).then(function () {
    // Mandatory notification after a successful initialize.
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'initialized' }) + '\n')
    return state
  })
  client = state
  return state
}

function dropClient(state) {
  if (client === state) client = null
  if (state.child && !state.child.killed) {
    try { state.child.kill() } catch { /* already gone */ }
  }
}

function failAll(state, err) {
  state.pending.forEach(function (pending) { pending.reject(err) })
  state.pending.clear()
}

function request(state, method, params) {
  var id = state.nextId++
  var message = JSON.stringify({ jsonrpc: '2.0', id: id, method: method, params: params || {} }) + '\n'
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () {
      state.pending.delete(id)
      reject(new Error(method + ' 请求超时'))
    }, REQUEST_TIMEOUT_MS)
    state.pending.set(id, {
      resolve: function (result) { clearTimeout(timer); resolve(result) },
      reject: function (err) { clearTimeout(timer); reject(err) }
    })
    state.child.stdin.write(message)
  })
}

/** Fetch raw rate limits from the app-server. */
async function fetchRateLimits() {
  if (Date.now() < clientBrokenUntil) throw new Error('codex app-server 暂不可用，稍后自动重试')
  var state = ensureClient()
  await state.ready
  try {
    return await request(state, 'account/rateLimits/read', {})
  } catch (err) {
    // A broken session poisons the pipe; drop it so the next call re-spawns.
    dropClient(state)
    clientBrokenUntil = Date.now() + RESTART_BACKOFF_MS
    throw err
  } finally {
    clientBrokenUntil = 0
  }
}

/** Snapshot entry shaped for the overview provider-card renderer. */
export async function codexPlanSnapshot() {
  var now = Date.now()
  if (cache.snapshot && now - cache.at < REFRESH_MS) return cache.snapshot

  var entry = {
    provider: 'codex-chatgpt',
    displayName: 'Codex / ChatGPT 订阅',
    credential: codexInstalled() ? 'oauth' : 'none',
    supported: true,
    updatedAt: now
  }

  if (entry.credential === 'none') {
    entry.error = '未检测到 Codex 登录（缺少 ~/.codex/auth.json）'
  } else {
    try {
      var result = await fetchRateLimits()
      var limits = (result && result.rateLimits) || {}
      var windows = []
      var pairs = [['primary', limits.primary], ['secondary', limits.secondary]]
      for (const pair of pairs) {
        const w = pair[1]
        if (!w || w.usedPercent === undefined || w.usedPercent === null) continue
        windows.push({
          key: pair[0],
          name: windowLabel(w.windowDurationMins) + (limits.planType ? ' · ' + planLabel(limits.planType) : ''),
          percent: Math.round(Number(w.usedPercent) * 10) / 10,
          resetsAt: w.resetsAt ? w.resetsAt * 1000 : null
        })
      }
      if (windows.length > 0) {
        entry.plan = { windows: windows, updatedAt: now }
        if (limits.planType) entry.planType = limits.planType
      } else {
        entry.error = 'codex 未返回额度窗口数据'
      }
    } catch (err) {
      entry.error = '套餐探测失败: ' + (err && err.message ? err.message : String(err))
    }
  }

  cache = { at: now, snapshot: entry }
  return entry
}

/** Testable wiring: clear the in-memory cache (used by tests / manual refresh). */
export function resetCodexQuotaCache() {
  cache = { at: 0, snapshot: null }
}
