/**
 * server.mjs - zero-dependency HTTP server for the TokenDashboard.
 * Serves the static UI and a small JSON API backed by the live host ledger.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  aggregateRange,
  meta,
  hourlySeries,
  ledgerSeries,
  loadOverrides,
  readSnapshots,
  saveOverrides,
  qwenPlanSnapshot
} from './lib/data.mjs'
import { codexPlanSnapshot } from './lib/codex-quota.mjs'
import { reviveNoneCredentialProviders } from './lib/providers.mjs'

const CODEX_PROVIDER_ID = 'codex-chatgpt'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.join(HERE, 'public')
const PORT = Number(process.env.TOKEN_DASHBOARD_PORT || process.env.PORT || 8788)
const HOST = process.env.TOKEN_DASHBOARD_HOST || '127.0.0.1'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type'
}

const QWEN_PROVIDER_ID = 'qwen-token-plan-cn'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, Object.assign({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text)
  }, CORS))
  res.end(text)
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    const chunks = []
    let size = 0
    req.on('data', function (chunk) {
      size += chunk.length
      if (size > 1024 * 1024) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', function () {
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', reject)
  })
}

function numbersFromQuery(url) {
  const out = {}
  for (const [key, value] of url.searchParams.entries()) out[key] = value
  return out
}

async function handleApi(req, res, url) {
  const routes = url.pathname
  const query = numbersFromQuery(url)

  if (routes === '/api/health') {
    sendJson(res, 200, { ok: true, now: Date.now(), paths: meta() })
    return true
  }

  if (routes === '/api/overview') {
    const days = Number(query.days) || 7
    const overrides = loadOverrides()
    const agg = aggregateRange(days, overrides)
    const snapshots = readSnapshots() || { providers: {} }
    if (!snapshots.providers || typeof snapshots.providers !== 'object') snapshots.providers = {}
    // DSH 0.1.7-rc.1: the host dsh-usage plugin loses the llm-pi-ai profile
    // mapping after the settings.yaml -> cordis.patch.yml migration and marks
    // most providers credential:"none". Re-resolve and re-probe them here.
    await reviveNoneCredentialProviders(snapshots.providers)
    // The host dsh-usage plugin has no adapter for the Aliyun token plan, so
    // splice in a live qwen-token-plan-cn card probed by this server.
    snapshots.providers[QWEN_PROVIDER_ID] = await qwenPlanSnapshot()
    // Codex / ChatGPT subscription quota via a local `codex app-server` RPC.
    snapshots.providers[CODEX_PROVIDER_ID] = await codexPlanSnapshot()
    // Drop providers without configured credentials so the overview only
    // shows providers the user can actually query.
    for (const id of Object.keys(snapshots.providers)) {
      const p = snapshots.providers[id]
      if (!p || p.credential === 'none') delete snapshots.providers[id]
    }
    sendJson(res, 200, Object.assign({
      generatedAt: Date.now(),
      snapshots,
      overrides,
      paths: meta()
    }, agg))
    return true
  }

  if (routes === '/api/series') {
    const dim = String(query.dim || 'day')
    const overrides = loadOverrides()
    if (dim === 'hour') {
      const hours = Number(query.hours) || 72
      const series = await hourlySeries(hours)
      sendJson(res, 200, series)
      return true
    }
    const safeDim = dim === 'week' || dim === 'month' ? dim : 'day'
    const days = Number(query.days) || 7
    sendJson(res, 200, ledgerSeries(safeDim, days, overrides))
    return true
  }

  if (routes === '/api/price' && req.method === 'POST') {
    const raw = await readBody(req)
    let payload = {}
    try {
      payload = JSON.parse(raw || '{}')
    } catch (err) {
      sendJson(res, 400, { ok: false, error: 'invalid JSON' })
      return true
    }
    const model = String(payload.model || '')
    if (!model) {
      sendJson(res, 400, { ok: false, error: 'model required' })
      return true
    }
    const overrides = loadOverrides()
    if (payload.clear === true) {
      delete overrides[model]
    } else {
      const clean = {}
      for (const key of ['input', 'output', 'cacheRead', 'cacheWrite']) {
        const value = payload.price ? payload.price[key] : undefined
        if (value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value))) {
          clean[key] = Number(value)
        }
      }
      overrides[model] = clean
    }
    saveOverrides(overrides)
    sendJson(res, 200, { ok: true, overrides })
    return true
  }

  sendJson(res, 404, { ok: false, error: 'not found' })
  return true
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname)
  if (rel === '/' || rel === '') rel = '/index.html'
  const target = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, ''))
  if (!target.startsWith(PUBLIC_DIR)) {
    res.writeHead(403)
    res.end('forbidden')
    return
  }
  fs.readFile(target, function (err, data) {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('not found')
      return
    }
    const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream'
    res.writeHead(200, Object.assign({ 'content-type': type, 'cache-control': 'no-cache' }, CORS))
    res.end(data)
  })
}

const server = http.createServer(function (req, res) {
  const url = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'))
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    res.end()
    return
  }
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch(function (err) {
      sendJson(res, 500, { ok: false, error: String((err && err.message) || err) })
    })
    return
  }
  serveStatic(req, res, url)
})

server.listen(PORT, HOST, function () {
  console.log('TokenDashboard: http://' + HOST + ':' + PORT)
  console.log('ledger: ' + meta().ledgerPath)
})
