const makeDashHost = function() {
return {
  inject: ['timer', 'shell'],
  apply(ctx) {
    const shell = ctx.shell
    const timer = ctx.timer
    let config = { providers: [], thresholds: { usagePct: 80, renewalDays: 7 } }
    let history = []
    let latest = {}
    let alerts = []
    let lastRefresh = null
    let initPromise = null
    let cfgPath = ''
    let histPath = ''

    async function sh(command, timeoutMs) {
      const spec = shell.resolve({ command: command, timeoutMs: timeoutMs || 25000, stdoutMaxBytes: 262144 })
      return await shell.run(spec)
    }
    async function curlJSON(url, headers, timeoutMs) {
      const parts = ['curl -s -m 20 ' + JSON.stringify(url)]
      for (const k of Object.keys(headers || {})) parts.push('-H ' + JSON.stringify(k + ': ' + headers[k]))
      const r = await sh(parts.join(' '), timeoutMs || 30000)
      const text = (r.stdout && r.stdout.text) || ''
      try { return { status: 200, body: JSON.parse(text) } } catch (e) {
        return { status: 0, body: null, err: (text || ('exit ' + r.exitCode)).slice(0, 200) }
      }
    }
    async function readFile(path) {
      try {
        const r = await sh('cat ' + JSON.stringify(path), 8000)
        if (r.exitCode !== 0) return null
        return (r.stdout && r.stdout.text) || null
      } catch (e) { return null }
    }
    async function writeFile(path, content) {
      const dir = path.slice(0, path.lastIndexOf('/'))
      const spec = shell.resolve({ command: 'mkdir -p ' + JSON.stringify(dir) + ' && cat > ' + JSON.stringify(path), timeoutMs: 10000 })
      spec.stdin = content
      await shell.run(spec)
    }

    function sanitizeConfig(raw) {
      const KINDS = ['volc', 'deepseek', 'manual', 'moonshot-cn', 'moonshot', 'kimi-coding', 'glm-coding', 'glm-coding-intl', 'minimax', 'minimax-intl', 'openrouter', 'siliconflow', 'siliconflow-intl', 'zenmux', 'opencode-go']
      const out = { providers: [], thresholds: { usagePct: 80, renewalDays: 7 } }
      if (raw && typeof raw === 'object') {
        if (raw.thresholds && typeof raw.thresholds === 'object') {
          const t = raw.thresholds
          out.thresholds.usagePct = Math.min(100, Math.max(1, Number(t.usagePct) || 80))
          out.thresholds.renewalDays = Math.max(0, Math.min(365, Number(t.renewalDays) || 7))
        }
        if (Array.isArray(raw.providers)) {
          for (const p of raw.providers) {
            if (!p || typeof p !== 'object') continue
            const kind = KINDS.indexOf(p.kind) >= 0 ? p.kind : 'manual'
            out.providers.push({
              id: String(p.id || ('p' + Math.random().toString(36).slice(2, 8))),
              name: String(p.name || '未命名').slice(0, 40),
              kind: kind,
              enabled: p.enabled !== false,
              apiKey: typeof p.apiKey === 'string' ? p.apiKey : '',
              profile: typeof p.profile === 'string' ? p.profile.slice(0, 40) : '',
              plan: (p.plan && typeof p.plan === 'object') ? {
                total: Number(p.plan.total) || 0,
                used: Number(p.plan.used) || 0,
                renewDate: typeof p.plan.renewDate === 'string' ? p.plan.renewDate : '',
                note: typeof p.plan.note === 'string' ? p.plan.note.slice(0, 200) : '',
              } : { total: 0, used: 0, renewDate: '', note: '' },
            })
            if (out.providers.length >= 24) break
          }
        }
      }
      return out
    }

    async function ensureInit() {
      if (initPromise) return initPromise
      initPromise = (async () => {
        const r = await sh('echo $HOME', 5000)
        const home = ((r.stdout && r.stdout.text) || '').trim() || '/tmp'
        cfgPath = home + '/.token-dashboard/config.json'
        histPath = home + '/.token-dashboard/history.json'
        const cfgText = await readFile(cfgPath)
        if (cfgText) { try { config = sanitizeConfig(JSON.parse(cfgText)) } catch (e) {} }
        const histText = await readFile(histPath)
        if (histText) { try { const h = JSON.parse(histText); if (Array.isArray(h)) history = h } catch (e) {} }
      })()
      return initPromise
    }

    function daysLeftOf(dateStr) {
      if (!dateStr) return null
      const t = Date.parse(dateStr)
      if (isNaN(t)) return null
      return Math.ceil((t - Date.now()) / 86400000)
    }
    function toNum(v) { const n = Number(v); return (v !== '' && v != null && isFinite(n)) ? n : null }
    function toIso(v) {
      if (v == null) return null
      if (/^\d+$/.test(String(v))) { const ms = Number(v) < 1e12 ? Number(v) * 1000 : Number(v); const d = new Date(ms); return isNaN(d.getTime()) ? null : d.toISOString() }
      const d = new Date(v)
      return isNaN(d.getTime()) ? null : d.toISOString()
    }
    function pctOf(used, limit) {
      const u = toNum(used); const l = toNum(limit)
      if (u == null || l == null || l <= 0) return null
      return Math.max(0, Math.min(100, u / l * 100))
    }

    var KIND_ROUTES = {
      deepseek: ['deepseek-official', 'deepseek'],
      'moonshot-cn': ['moonshotai-cn', 'moonshot-cn'],
      moonshot: ['moonshotai', 'moonshot'],
      'kimi-coding': ['kimi-coding'],
      'glm-coding': ['zai-coding-cn', 'zai-coding'],
      'glm-coding-intl': ['zai-coding', 'zai'],
      minimax: ['minimax-cn', 'minimax'],
      'minimax-intl': ['minimax', 'minimax-io'],
      openrouter: ['openrouter'],
      siliconflow: ['siliconflow', 'siliconflow-cn'],
      'siliconflow-intl': ['siliconflow-intl', 'siliconflow'],
      zenmux: ['zenmux'],
      'opencode-go': ['opencode-go', 'opencode']
    }

    async function resolveEnvRef(name) {
      const credentials = ctx.get('credentials')
      if (!credentials || typeof credentials.resolve !== 'function') return null
      const candidates = [name, 'env/' + name, { scope: 'env', id: name }, { env: name }]
      for (const c of candidates) {
        try {
          const r = await credentials.resolve(c)
          if (r && typeof r.value === 'string' && r.value) return r.value
        } catch (e) {}
      }
      return null
    }

    async function autoCredential(kind) {
      const routes = KIND_ROUTES[kind]
      if (!routes) return null
      try {
        const settings = ctx.get('settings')
        if (settings && typeof settings.get === 'function') {
          const ns = settings.get('llm-pi-ai')
          const providers = ns && ns.providers ? ns.providers : null
          if (providers && typeof providers === 'object') {
            for (const route of routes) {
              const prof = providers[route]
              if (prof && typeof prof.apiKeyEnv === 'string' && prof.apiKeyEnv) {
                const v = await resolveEnvRef(prof.apiKeyEnv)
                if (v) return v
              }
            }
          }
          if (kind === 'deepseek') {
            const ds = settings.get('llm-deepseek')
            const envName = ds && typeof ds === 'object' ? (ds.apiKeyEnv || (ds.config && ds.config.apiKeyEnv)) : null
            if (typeof envName === 'string' && envName) {
              const v = await resolveEnvRef(envName)
              if (v) return v
            }
          }
        }
      } catch (e) {}
      try {
        const credentials = ctx.get('credentials')
        if (credentials && typeof credentials.readRecord === 'function') {
          for (const route of routes) {
            for (const keyForm of ['llm-pi-ai/' + route, 'llm-deepseek/' + route]) {
              try {
                const rec = await credentials.readRecord(keyForm)
                if (!rec) continue
                const payload = rec.payload
                const keyVal = rec.key || (payload && typeof payload === 'object' ? (payload.apiKey || payload.key || payload.access) : null)
                if (typeof keyVal === 'string' && keyVal.length > 8) return keyVal
              } catch (e) {}
            }
          }
        }
      } catch (e) {}
      return null
    }

    async function withKey(p, fn) {
      let key = p.apiKey
      if (!key) key = await autoCredential(p.kind)
      if (!key) return { ok: false, error: '未配置 API Key（设置页填写，或先在 设置-模型 配置该平台）' }
      const r = await fn(key)
      if (r && r.ok) r.credKind = p.apiKey ? 'manual' : 'auto'
      return r
    }

    function errOf(res) {
      if (res.status !== 200) return { ok: false, error: 'HTTP ' + res.status + (res.err ? ': ' + res.err : '') }
      return { ok: false, error: '响应格式异常' }
    }
    function bal(res, pick) {
      if (res.status !== 200 || typeof res.body !== 'object' || res.body === null) return errOf(res)
      const v = pick(res.body)
      if (v == null) return { ok: false, error: '响应缺少余额字段' }
      return { ok: true, balance: v.balance, currency: v.currency || '', windows: null }
    }

    var ADAPTERS = {
      deepseek: { probe: (key) => curlJSON('https://api.deepseek.com/user/balance', { authorization: 'Bearer ' + key }),
        parse: (res) => bal(res, (b) => {
          const i = Array.isArray(b.balance_infos) ? b.balance_infos[0] : null
          return i ? { balance: toNum(i.total_balance), currency: i.currency } : null
        }) },
      'moonshot-cn': { probe: (key) => curlJSON('https://api.moonshot.cn/v1/users/me/balance', { authorization: 'Bearer ' + key }),
        parse: (res) => bal(res, (b) => b.data && b.data.available_balance != null ? { balance: toNum(b.data.available_balance), currency: 'CNY' } : null) },
      moonshot: { probe: (key) => curlJSON('https://api.moonshot.ai/v1/users/me/balance', { authorization: 'Bearer ' + key }),
        parse: (res) => bal(res, (b) => b.data && b.data.available_balance != null ? { balance: toNum(b.data.available_balance), currency: 'USD' } : null) },
      openrouter: { probe: (key) => curlJSON('https://openrouter.ai/api/v1/credits', { authorization: 'Bearer ' + key }),
        parse: (res) => bal(res, (b) => b.data && b.data.total_credits != null ? { balance: toNum(b.data.total_credits) - (toNum(b.data.total_usage) || 0), currency: 'USD' } : null) },
      siliconflow: { probe: (key) => curlJSON('https://api.siliconflow.cn/v1/user/info', { authorization: 'Bearer ' + key }),
        parse: (res) => bal(res, (b) => b.data && b.data.totalBalance != null ? { balance: toNum(b.data.totalBalance), currency: 'CNY' } : null) },
      'siliconflow-intl': { probe: (key) => curlJSON('https://api.siliconflow.com/v1/user/info', { authorization: 'Bearer ' + key }),
        parse: (res) => bal(res, (b) => b.data && b.data.totalBalance != null ? { balance: toNum(b.data.totalBalance), currency: 'USD' } : null) },
      zenmux: { probe: (key) => curlJSON('https://zenmux.ai/api/v1/management/payg/balance', { authorization: 'Bearer ' + key }),
        parse: (res) => bal(res, (b) => b.data && b.data.total_credits != null ? { balance: toNum(b.data.total_credits), currency: 'USD' } : null) },
      'kimi-coding': { probe: (key) => curlJSON('https://api.kimi.com/coding/v1/usages', { authorization: 'Bearer ' + key }),
        parse: (res) => {
          if (res.status !== 200 || typeof res.body !== 'object' || res.body === null) return errOf(res)
          const b = res.body
          const wins = []
          if (Array.isArray(b.limits)) {
            for (const e of b.limits) {
              if (!e || typeof e.detail !== 'object') continue
              const d = e.detail
              const dur = e.window ? toNum(e.window.duration) : null
              const unit = e.window ? e.window.timeUnit : null
              wins.push({ key: dur === 300 && unit === 'TIME_UNIT_MINUTE' ? '5h' : (dur != null ? 'w-' + dur : 'window'), name: d.name || null, percent: pctOf(d.used, d.limit), resetsAt: toIso(d.resetTime) })
            }
          }
          if (b.usage && typeof b.usage === 'object') wins.push({ key: 'week', name: 'Weekly', percent: pctOf(b.usage.used, b.usage.limit), resetsAt: toIso(b.usage.resetTime) })
          if (wins.length === 0) return { ok: false, error: '响应缺少配额窗口' }
          return { ok: true, windows: wins }
        } }
    }
    function glmParse(res) {
      if (res.status !== 200 || typeof res.body !== 'object' || res.body === null || res.body.success !== true) return errOf(res)
      const limits = res.body.data && res.body.data.limits
      if (!Array.isArray(limits) || limits.length === 0) return { ok: false, error: '响应缺少 limits' }
      const wins = limits.map((e) => ({
        key: e.unit === 3 ? '5h' : e.unit === 6 ? 'week' : 'window',
        name: e.unit === 3 ? '5 小时' : e.unit === 6 ? '本周' : '窗口',
        percent: e.percentage != null ? Math.max(0, Math.min(100, Number(e.percentage))) : null,
        resetsAt: toIso(e.nextResetTime),
      }))
      return { ok: true, windows: wins, planName: res.body.data.level || null }
    }
    ADAPTERS['glm-coding'] = { probe: (key) => curlJSON('https://open.bigmodel.cn/api/monitor/usage/quota/limit', { authorization: key, 'accept-language': 'en-US,en' }), parse: glmParse }
    ADAPTERS['glm-coding-intl'] = { probe: (key) => curlJSON('https://api.z.ai/api/monitor/usage/quota/limit', { authorization: key, 'accept-language': 'en-US,en' }), parse: glmParse }
    function mmParse(res) {
      if (res.status !== 200 || typeof res.body !== 'object' || res.body === null) return errOf(res)
      const remains = Array.isArray(res.body.model_remains) ? res.body.model_remains : []
      const g = remains.find((e) => e && e.model_name === 'general')
      if (!g) return { ok: false, error: '响应缺少 general 套餐' }
      const wins = []
      if (g.current_interval_remaining_percent != null) wins.push({ key: '5h', name: '5 小时', percent: Math.max(0, Math.min(100, 100 - Number(g.current_interval_remaining_percent))), resetsAt: toIso(g.end_time) })
      if (g.current_weekly_status === 1 && g.current_weekly_remaining_percent != null) wins.push({ key: 'week', name: '本周', percent: Math.max(0, Math.min(100, 100 - Number(g.current_weekly_remaining_percent))), resetsAt: toIso(g.weekly_end_time) })
      if (wins.length === 0) return { ok: false, error: '响应缺少窗口' }
      return { ok: true, windows: wins }
    }
    ADAPTERS.minimax = { probe: (key) => curlJSON('https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains', { authorization: 'Bearer ' + key }), parse: mmParse }
    ADAPTERS['minimax-intl'] = { probe: (key) => curlJSON('https://api.minimax.io/v1/api/openplatform/coding_plan/remains', { authorization: 'Bearer ' + key }), parse: mmParse }

    async function fetchAdapted(p) {
      const ad = ADAPTERS[p.kind]
      if (!ad) return null
      return await withKey(p, async (key) => {
        const res = await ad.probe(key)
        const e = ad.parse(res)
        if (e && e.ok && e.windows) {
          let maxPct = null
          for (const w of e.windows) { if (w.percent != null && (maxPct == null || w.percent > maxPct)) maxPct = w.percent }
          e.used = maxPct; e.total = maxPct != null ? 100 : null
        }
        if (e && e.ok && p.plan.renewDate) e.daysLeft = daysLeftOf(p.plan.renewDate)
        return e
      })
    }

    async function fetchVolc(p) {
      const prof = p.profile ? ' --profile ' + JSON.stringify(p.profile) : ''
      const r = await sh('arkcli usage balance --type plan' + prof, 40000)
      const text = (r.stdout && r.stdout.text) || ''
      let j = null
      try { j = JSON.parse(text) } catch (e) {}
      if (!j) return { ok: false, error: text.slice(0, 300) || ('exit ' + r.exitCode) }
      if (j.ok === false) return { ok: false, error: ((j.error && j.error.message) || '查询失败').slice(0, 300) }
      const e = { ok: true, raw: null, used: null, total: null, balance: null, daysLeft: p.plan.renewDate ? daysLeftOf(p.plan.renewDate) : null }
      const data = j.data !== undefined ? j.data : j
      try { e.raw = JSON.stringify(data).slice(0, 1500) } catch (err) {}
      const scan = (node) => {
        if (!node || typeof node !== 'object') return
        if (Array.isArray(node)) { node.forEach(scan); return }
        for (const k of ['totalAmount', 'totalQuota', 'total']) { const v = toNum(node[k]); if (v != null && e.total == null) e.total = v }
        for (const k of ['usedAmount', 'usedQuota', 'used']) { const v = toNum(node[k]); if (v != null && e.used == null) e.used = v }
        for (const k of ['remainder', 'remaining', 'balance']) { const v = toNum(node[k]); if (v != null && e.balance == null) e.balance = v }
        for (const k of ['expireTime', 'expireAt', 'renewTime', 'endTime']) {
          if (typeof node[k] === 'string' && e.daysLeft == null) { const d = daysLeftOf(node[k].slice(0, 10)); if (d != null) e.daysLeft = d }
        }
        Object.keys(node).forEach((k) => { if (node[k] && typeof node[k] === 'object') scan(node[k]) })
      }
      scan(data)
      if (e.total != null && e.used == null && e.balance != null) e.used = Math.max(0, e.total - e.balance)
      return e
    }

    function manualEntry(p) {
      const total = p.plan.total || 0
      const used = p.plan.used || 0
      return { ok: true, used: used, total: total, balance: Math.max(0, total - used), daysLeft: daysLeftOf(p.plan.renewDate), currency: '', note: p.plan.note || '' }
    }

    function rebuildAlerts() {
      const th = config.thresholds
      const next = []
      for (const id of Object.keys(latest)) {
        const e = latest[id]
        if (!e || !e.ok) continue
        const checkPct = (pct, label) => {
          if (pct != null && pct >= th.usagePct) next.push({ id: id + ':usage:' + label, providerId: id, provider: e.name, level: pct >= 95 ? 'high' : 'mid', text: '「' + e.name + '」' + label + '用量已达 ' + Math.round(pct) + '%' })
        }
        checkPct(e.total > 0 && e.used != null ? e.used / e.total * 100 : null, '')
        if (Array.isArray(e.windows)) for (const w of e.windows) checkPct(w.percent, w.name || w.key)
        if (e.daysLeft != null && e.daysLeft <= th.renewalDays) {
          next.push({ id: id + ':renew', providerId: id, provider: e.name, level: e.daysLeft <= 3 ? 'high' : 'mid', text: '「' + e.name + '」' + (e.daysLeft < 0 ? '已过期' : e.daysLeft + ' 天后续费') })
        }
        if (e.kind === 'deepseek' && e.available === false) {
          next.push({ id: id + ':avail', providerId: id, provider: e.name, level: 'high', text: '「' + e.name + '」账户余额不足或不可用' })
        }
      }
      for (const id of Object.keys(latest)) {
        const e = latest[id]
        if (e && !e.ok) next.push({ id: id + ':error', providerId: id, provider: e.name, level: 'info', text: '「' + e.name + '」查询失败: ' + (e.error || '').slice(0, 120) })
      }
      alerts = next
    }

    async function refreshAll() {
      await ensureInit()
      const entries = {}
      for (const p of config.providers) {
        if (p.enabled === false) continue
        let e
        try {
          if (p.kind === 'volc') e = await fetchVolc(p)
          else if (p.kind === 'manual') e = manualEntry(p)
          else e = await fetchAdapted(p)
          if (e == null) e = { ok: false, error: '未知平台类型' }
        } catch (err) { e = { ok: false, error: String((err && err.message) || err).slice(0, 200) } }
        e.id = p.id; e.name = p.name; e.kind = p.kind
        entries[p.id] = e
      }
      latest = entries
      lastRefresh = Date.now()
      const compact = {}
      for (const id of Object.keys(entries)) {
        const e = entries[id]
        if (e.ok) compact[id] = { u: (e.total > 0 && e.used != null) ? Math.round(e.used / e.total * 100) : null, b: e.balance != null ? e.balance : null, d: e.daysLeft != null ? e.daysLeft : null }
      }
      history.push({ t: lastRefresh, entries: compact })
      if (history.length > 500) history = history.slice(-500)
      try { await writeFile(histPath, JSON.stringify(history)) } catch (e) {}
      rebuildAlerts()
      return entries
    }

    function view() {
      return {
        providers: config.providers.map((p) => ({ id: p.id, name: p.name, kind: p.kind, enabled: p.enabled !== false, hasKey: !!p.apiKey, profile: p.profile || '', plan: p.plan })),
        thresholds: config.thresholds,
        snapshot: latest,
        history: history.slice(-120),
        alerts: alerts,
        lastRefresh: lastRefresh,
      }
    }

    harness.handle('dash/get', async () => { await ensureInit(); return view() })
    harness.handle('dash/refresh', async () => { await refreshAll(); return view() })
    harness.handle('dash/save', async (args) => {
      await ensureInit()
      config = sanitizeConfig(args && args.config)
      await writeFile(cfgPath, JSON.stringify(config))
      await refreshAll()
      return view()
    })

    ctx.effect(() => {
      refreshAll().catch((e) => console.error('tkdash initial refresh failed', e))
      const stop = timer.interval(() => { refreshAll().catch((e) => console.error('tkdash refresh failed', e)) }, 1800000)
      return () => { if (typeof stop === 'function') stop() }
    }, 'tkdash-refresh-poll')
  },
}
}

const makeLedgerHost = function() {
return {
  inject: ['shell'],
  async apply(ctx) {
    const shell = ctx.shell
    async function sh(command, timeoutMs) {
      const spec = shell.resolve({ command: command, timeoutMs: timeoutMs || 15000, stdoutMaxBytes: 33554432 })
      return await shell.run(spec)
    }
    let home = '/tmp'
    let usagePath = ''
    let overridesPath = ''
    {
      const r = await sh('echo $HOME', 5000)
      home = ((r.stdout && r.stdout.text) || '').trim() || '/tmp'
      usagePath = home + '/.dsh/dsh-usage/usage-ledger.json'
      overridesPath = home + '/.token-dashboard/usage-price-overrides.json'
    }
    let priceOverrides = {}
    try {
      const r = await sh('cat ' + JSON.stringify(overridesPath), 8000)
      const text = (r.stdout && r.stdout.text) || ''
      if (text) { const d = JSON.parse(text); if (d && typeof d === 'object') priceOverrides = d }
    } catch (e) {}
    async function saveOverrides() {
      const dir = overridesPath.slice(0, overridesPath.lastIndexOf('/'))
      const spec = shell.resolve({ command: 'mkdir -p ' + JSON.stringify(dir) + ' && cat > ' + JSON.stringify(overridesPath), timeoutMs: 10000 })
      spec.stdin = JSON.stringify(priceOverrides)
      await shell.run(spec)
    }
    const DEFAULT_PRICES = {
      'deepseek-chat': { input: 0.28, output: 0.42, cacheRead: 0.028, cacheWrite: 0.28 },
      'deepseek-reasoner': { input: 0.28, output: 0.42, cacheRead: 0.028, cacheWrite: 0.28 },
    }
    function priceFor(model) {
      const base = DEFAULT_PRICES[model] || {}
      const over = priceOverrides[model] || {}
      const p = { input: over.input !== undefined ? Number(over.input) : base.input, output: over.output !== undefined ? Number(over.output) : base.output, cacheRead: over.cacheRead !== undefined ? Number(over.cacheRead) : base.cacheRead, cacheWrite: over.cacheWrite !== undefined ? Number(over.cacheWrite) : base.cacheWrite }
      return (p.input !== undefined || p.output !== undefined) ? p : null
    }
    function costOf(model, v) {
      if (v.cost && Number(v.cost) > 0) return Number(v.cost)
      const p = priceFor(model)
      if (p === null) return null
      const inp = Number(v.inputTokens) || 0, out = Number(v.outputTokens) || 0
      const cr = Number(v.cacheReadTokens) || 0, cw = Number(v.cacheWriteTokens) || 0
      const miss = Math.max(0, inp - cr - cw)
      const crP = p.cacheRead !== undefined ? p.cacheRead : p.input
      const cwP = p.cacheWrite !== undefined ? p.cacheWrite : p.input
      return (miss * p.input + cr * crP + cw * cwP + out * p.output) / 1e6
    }
    async function readUsage() {
      try {
        const r = await sh('cat ' + JSON.stringify(usagePath), 10000)
        const text = (r.stdout && r.stdout.text) || ''
        if (!text) return null
        const d = JSON.parse(text)
        return d && typeof d.days === 'object' ? d : null
      } catch (e) { return null }
    }
    harness.handle('usage-ledger/query', async function (args) {
      const days = args && Number(args.days) > 0 ? Number(args.days) : 7
      const cutoff = new Date(Date.now() - (days - 1) * 86400000)
      const cutoffKey = cutoff.getFullYear() + '-' + String(cutoff.getMonth() + 1).padStart(2, '0') + '-' + String(cutoff.getDate()).padStart(2, '0')
      const data = await readUsage()
      const byDay = new Map(), byModel = new Map()
      const totals = { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, cost: 0, costKnownRequests: 0 }
      const unknownModels = new Set()
      let totalCalls = 0
      if (data) {
        function bucket(map, key) {
          let b = map.get(key)
          if (b === undefined) { b = { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, cost: 0, costKnownRequests: 0 }; map.set(key, b) }
          return b
        }
        for (const day of Object.keys(data.days).sort()) {
          if (day < cutoffKey) continue
          const provs = data.days[day] || {}
          for (const prov of Object.keys(provs)) {
            const models = provs[prov] || {}
            for (const model of Object.keys(models)) {
              const v = models[model] || {}
              const cost = costOf(model, v)
              if (cost === null) unknownModels.add(model)
              const calls = Number(v.calls) || 1
              totalCalls += calls
              const b1 = bucket(byDay, day), b2 = bucket(byModel, prov + '/' + model)
              for (const b of [b1, b2]) {
                b.requests += calls
                b.inputTokens += Number(v.inputTokens) || 0
                b.outputTokens += Number(v.outputTokens) || 0
                b.cacheReadTokens += Number(v.cacheReadTokens) || 0
                b.cacheWriteTokens += Number(v.cacheWriteTokens) || 0
                if (cost !== null) { b.cost += cost; b.costKnownRequests += calls }
              }
              totals.requests += calls
              totals.inputTokens += Number(v.inputTokens) || 0
              totals.outputTokens += Number(v.outputTokens) || 0
              totals.cacheReadTokens += Number(v.cacheReadTokens) || 0
              totals.cacheWriteTokens += Number(v.cacheWriteTokens) || 0
              totals.reasoningTokens += Number(v.reasoningTokens) || 0
              if (cost !== null) { totals.cost += cost; totals.costKnownRequests += calls }
            }
          }
        }
      }
      const dayRows = Array.from(byDay.entries()).map(function (kv) { return Object.assign({ day: kv[0] }, kv[1]) }).sort(function (a, b) { return a.day < b.day ? 1 : -1 })
      const modelRows = Array.from(byModel.entries()).map(function (kv) {
        const parts = kv[0].split('/')
        const model = parts.slice(1).join('/')
        const priced = priceFor(model)
        return Object.assign({ key: kv[0], provider: parts[0], model, priced: priced !== null, price: priced }, kv[1])
      }).sort(function (a, b) { return (b.cost - a.cost) || (b.outputTokens - a.outputTokens) })
      return { generatedAt: Date.now(), entriesTotal: totalCalls, sourceEmpty: !data, persisted: true, totals, byDay: dayRows, byModel: modelRows, unknownModels: Array.from(unknownModels), recent: [] }
    })
    harness.handle('usage-ledger/set-price', async function (args) {
      const model = args && String(args.model || '')
      if (!model) return { ok: false, error: 'model required' }
      const p = (args && args.price) || {}
      const clean = {}
      for (const k of ['input', 'output', 'cacheRead', 'cacheWrite']) { if (p[k] !== undefined && p[k] !== null && p[k] !== '' && !isNaN(Number(p[k]))) clean[k] = Number(p[k]) }
      priceOverrides[model] = clean
      try { await saveOverrides() } catch (e) { return { ok: false, error: String((e && e.message) || e) } }
      return { ok: true, price: priceFor(model) }
    })
    // Bootstrap the dashboard server if it is not already running.
    // Candidate locations: $TOKEN_DASHBOARD_HOME, then common install paths.
    try {
      const up = await sh('curl -sf -m 2 http://127.0.0.1:8788/api/health >/dev/null 2>&1', 6000)
      if (up.exitCode !== 0) {
        const hr = await sh('echo "$HOME $TOKEN_DASHBOARD_HOME"', 5000)
        const parts = ((hr.stdout && hr.stdout.text) || '').trim().split(/\s+/)
        const home = parts[0] || ''
        const custom = parts[1] || ''
        const candidates = [custom, home + '/.dsh/profiles/web/node_modules/dsh-token-dashboard', home + '/dsh-token-dashboard', home + '/DSH/dsh-token-dashboard', home + '/DSH/TokenDashboard'].filter(Boolean)
        for (const dir of candidates) {
          const exists = await sh('test -f ' + JSON.stringify(dir + '/server.mjs'), 5000)
          if (exists.exitCode === 0) {
            await sh('cd ' + JSON.stringify(dir) + ' && nohup node server.mjs >/tmp/token-dashboard.log 2>&1 &', 8000)
            break
          }
        }
      }
    } catch (e) {}
    console.log('usage-ledger host ready, source:', usagePath)
  },
}
}

return {
  inject: ['timer', 'shell'],
  async apply(ctx) {
    const a = makeDashHost()
    const b = makeLedgerHost()
    await a.apply(ctx)
    await b.apply(ctx)
  },
}