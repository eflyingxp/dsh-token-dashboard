const CSS_LINES = [
  '.tkd-embed { width: 100%; border: 0; display: block; background: transparent; }',
  '.tkd-page { padding: 24px 32px; max-width: 1100px; }',
  '.tkd-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }',
  '.tkd-head-right { display: flex; gap: 12px; align-items: center; }',
  '.tkd-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }',
  '.tkd-card { border: 1px solid var(--border-color, rgba(128,128,128,.25)); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }',
  '.tkd-card-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }',
  '.tkd-card-name { font-weight: 600; }',
  '.tkd-chip { font-size: 11px; padding: 2px 8px; border-radius: 99px; background: var(--hover-bg, rgba(128,128,128,.15)); }',
  '.tkd-chip.tkd-auto { color: #3d9a5f; }',
  '.tkd-bar { height: 8px; border-radius: 4px; background: var(--hover-bg, rgba(128,128,128,.15)); overflow: hidden; margin-bottom: 4px; }',
  '.tkd-bar-fill { height: 100%; background: var(--tkd-accent, #5b8def); border-radius: 4px; transition: width .3s; }',
  '.tkd-bar-fill.tkd-orange { background: #e8a33d; }',
  '.tkd-bar-fill.tkd-red { background: #e05252; }',
  '.tkd-row { display: flex; justify-content: space-between; font-size: 12px; opacity: .85; }',
  '.tkd-balance { font-size: 20px; }',
  '.tkd-renew { font-size: 13px; font-weight: 600; }',
  '.tkd-win { margin-top: 6px; }',
  '.tkd-win-name { font-size: 11px; opacity: .7; display: flex; justify-content: space-between; }',
  '.tkd-green { color: #3d9a5f; } .tkd-orange { color: #d98f1f; } .tkd-red { color: #e05252; }',
  '.tkd-muted { opacity: .6; font-size: 12px; }',
  '.tkd-err { color: #e05252; font-size: 12px; word-break: break-all; }',
  '.tkd-raw summary { cursor: pointer; font-size: 12px; opacity: .6; }',
  '.tkd-raw pre { font-size: 10px; max-height: 160px; overflow: auto; white-space: pre-wrap; }',
  '.tkd-btn { padding: 4px 12px; border-radius: 6px; border: 1px solid var(--border-color, rgba(128,128,128,.3)); background: transparent; color: inherit; cursor: pointer; font-size: 13px; }',
  '.tkd-btn:hover { background: var(--hover-bg, rgba(128,128,128,.12)); }',
  '.tkd-btn.tkd-primary { background: var(--tkd-accent, #5b8def); color: #fff; border-color: transparent; }',
  '.tkd-btn.tkd-danger { color: #e05252; }',
  '.tkd-alertbar { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }',
  '.tkd-alert { font-size: 13px; padding: 8px 12px; border-radius: 8px; background: rgba(232,163,61,.12); color: #d98f1f; }',
  '.tkd-alert.tkd-high { background: rgba(224,82,82,.12); color: #e05252; }',
  '.tkd-alert.tkd-info { background: var(--hover-bg, rgba(128,128,128,.12)); opacity: .8; }',
  // The sidebar row renders the registered `label` next to this glyph, so the
  // glyph must stay icon-only (rendering text here duplicates the label).
  '.tkd-side { display: inline-flex; align-items: center; cursor: pointer; position: relative; }',
  '.tkd-side-icon { display: block; }',
  '.tkd-badge { position: absolute; top: -6px; right: -10px; background: #e05252; color: #fff; font-size: 10px; min-width: 16px; height: 16px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; padding: 0 4px; }',
  '.tkd-toasts { position: fixed; top: 16px; right: 16px; display: flex; flex-direction: column; gap: 8px; z-index: 9999; }',
  '.tkd-toast { display: flex; gap: 12px; align-items: center; padding: 10px 14px; border-radius: 10px; background: var(--bg, #fff); border: 1px solid var(--border-color, rgba(128,128,128,.3)); box-shadow: 0 4px 16px rgba(0,0,0,.15); font-size: 13px; color: #d98f1f; }',
  '.tkd-toast.tkd-high { color: #e05252; }',
  '.tkd-toast.tkd-info { opacity: .85; }',
  '.tkd-toast-x { background: none; border: none; cursor: pointer; font-size: 15px; color: inherit; opacity: .6; }',
  '.tkd-settings { display: flex; flex-direction: column; gap: 14px; padding: 8px 4px; }',
  '.tkd-editor { border: 1px solid var(--border-color, rgba(128,128,128,.25)); border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }',
  '.tkd-editor-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: end; }',
  '.tkd-editor label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; opacity: .85; }',
  '.tkd-editor input, .tkd-editor select { padding: 5px 8px; border-radius: 6px; border: 1px solid var(--border-color, rgba(128,128,128,.3)); background: transparent; color: inherit; min-width: 120px; }',
  '.tkd-check { flex-direction: row !important; align-items: center !important; gap: 6px !important; }',
  '.tkd-save-row { display: flex; gap: 12px; align-items: center; }',
  '.tkd-presets { display: flex; gap: 8px; flex-wrap: wrap; }',
  '.tkd-tabs { display: flex; gap: 4px; margin-bottom: 18px; border-bottom: 1px solid var(--border-color, rgba(128,128,128,.25)); }',
  '.tkd-tab { padding: 8px 16px; border: none; border-bottom: 2px solid transparent; border-radius: 0; background: none; font-size: 14px; cursor: pointer; color: inherit; opacity: .65; }',
  '.tkd-tab:hover { opacity: .9; background: none; }',
  '.tkd-tab.active { opacity: 1; border-bottom-color: var(--tkd-accent, #5b8def); font-weight: 600; }',
  '.ul-wrap { font-size: 13px; display: flex; flex-direction: column; gap: 14px; }',
  '.ul-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }',
  '.ul-cards { display: flex; gap: 10px; flex-wrap: wrap; }',
  '.ul-card { border: 1px solid var(--dsh-border, rgba(128,128,128,.3)); border-radius: 10px; padding: 10px 14px; min-width: 120px; }',
  '.ul-card .v { font-size: 18px; font-weight: 600; }',
  '.ul-card .k { opacity: .65; font-size: 11px; margin-top: 2px; }',
  '.ul table { border-collapse: collapse; width: 100%; }',
  '.ul th, .ul td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--dsh-border, rgba(128,128,128,.18)); white-space: nowrap; }',
  '.ul th { opacity: .6; font-weight: 500; font-size: 11px; }',
  '.ul td.num, .ul th.num { text-align: right; font-variant-numeric: tabular-nums; }',
  '.ul h3 { margin: 4px 0 6px; font-size: 13px; opacity: .8; }',
  '.ul button { border: 1px solid var(--dsh-border, rgba(128,128,128,.35)); background: transparent; color: inherit; border-radius: 6px; padding: 3px 10px; cursor: pointer; font-size: 12px; }',
  '.ul button.active { background: var(--dsh-fill-active, rgba(128,128,128,.2)); }',
  '.ul input { border: 1px solid var(--dsh-border, rgba(128,128,128,.35)); background: transparent; color: inherit; border-radius: 5px; padding: 2px 6px; width: 70px; font-size: 12px; }',
  '.ul .muted { opacity: .55; font-size: 12px; }',
  '.ul .warn { color: #d07a2c; font-size: 12px; }'
]

var KIND_LABELS = {
  volc: '火山方舟', deepseek: 'DeepSeek', manual: '手动订阅',
  'moonshot-cn': 'Moonshot 国内', moonshot: 'Moonshot 国际',
  'kimi-coding': 'Kimi For Coding', 'glm-coding': 'GLM Coding Plan', 'glm-coding-intl': 'GLM Coding (国际)',
  minimax: 'MiniMax Coding', 'minimax-intl': 'MiniMax Coding (国际)',
  openrouter: 'OpenRouter', siliconflow: '硅基流动', 'siliconflow-intl': 'SiliconFlow 国际',
  zenmux: 'ZenMux', 'opencode-go': 'OpenCode Go'
}

var LEDGER_RANGES = [1, 7, 30, 90]

function fmt(n) {
  if (n == null || isNaN(n)) return '-'
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(1) + 'w'
  return String(Math.round(n * 100) / 100)
}
function kindLabel(kind) { return KIND_LABELS[kind] || kind }
function daysText(d) { if (d == null) return null; if (d < 0) return '已过期'; return d + ' 天后续费' }
function resetText(iso) {
  if (!iso) return null
  const t = Date.parse(iso); if (isNaN(t)) return null
  const mins = Math.round((t - Date.now()) / 60000)
  if (mins < 0) return null
  if (mins < 60) return mins + ' 分钟后重置'
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return hrs + ' 小时后重置'
  return Math.round(hrs / 24) + ' 天后重置'
}
function fmtInt(n) { return Number(n || 0).toLocaleString('en-US') }
function fmtCost(c) { return c === null || c === undefined ? '—' : '$' + c.toFixed(4) }

function Sparkline(props) {
  const points = props.points || []; if (points.length < 2) return null
  const w = 160, h = 36, max = Math.max.apply(null, points.concat([1])), step = w / (points.length - 1)
  const pts = points.map((v, i) => (i * step).toFixed(1) + ',' + (h - (v / max) * (h - 4) - 2).toFixed(1)).join(' ')
  return React.createElement('svg', { className: 'tkd-spark', width: w, height: h },
    React.createElement('polyline', { points: pts, fill: 'none', stroke: 'var(--tkd-accent, #5b8def)', strokeWidth: 1.5 }))
}

function WinRow(props) {
  const w = props.win
  const pct = w.percent
  return React.createElement('div', { className: 'tkd-win' },
    React.createElement('div', { className: 'tkd-win-name' },
      React.createElement('span', null, w.name || w.key),
      React.createElement('span', null, resetText(w.resetsAt) || '')),
    pct != null ? React.createElement('div', null,
      React.createElement('div', { className: 'tkd-bar' },
        React.createElement('div', { className: 'tkd-bar-fill' + (pct >= 95 ? ' tkd-red' : pct >= 80 ? ' tkd-orange' : ''), style: { width: Math.min(100, pct) + '%' } })),
      React.createElement('div', { className: 'tkd-row' },
        React.createElement('span', null, ''),
        React.createElement('span', { className: pct >= 80 ? 'tkd-orange' : '' }, Math.round(pct) + '%'))) : null)
}

function ProviderCard(props) {
  const p = props.provider, e = props.entry
  let pct = null
  if (e && e.ok && e.total > 0 && e.used != null) pct = Math.min(100, Math.round(e.used / e.total * 100))
  const dl = e && e.ok ? e.daysLeft : null
  const dlCls = dl == null ? '' : (dl <= 3 ? 'tkd-red' : dl <= 7 ? 'tkd-orange' : 'tkd-green')
  const windows = e && e.ok && Array.isArray(e.windows) ? e.windows : []
  return React.createElement('div', { className: 'tkd-card' },
    React.createElement('div', { className: 'tkd-card-head' },
      React.createElement('span', { className: 'tkd-card-name' }, p.name),
      React.createElement('span', null,
        e && e.ok && e.credKind === 'auto' ? React.createElement('span', { className: 'tkd-chip tkd-auto', title: 'API Key 自动发现自 设置-模型 凭据' }, '自动凭据') : null,
        ' ', React.createElement('span', { className: 'tkd-chip' }, kindLabel(p.kind)))),
    e == null ? React.createElement('div', { className: 'tkd-muted' }, '尚未刷新') :
      !e.ok ? React.createElement('div', { className: 'tkd-err' }, '查询失败: ' + (e.error || '未知错误')) :
      React.createElement('div', null,
        (e.total > 0 && e.used != null) ? React.createElement('div', null,
          React.createElement('div', { className: 'tkd-bar' },
            React.createElement('div', { className: 'tkd-bar-fill' + (pct >= 95 ? ' tkd-red' : pct >= 80 ? ' tkd-orange' : ''), style: { width: pct + '%' } })),
          React.createElement('div', { className: 'tkd-row' },
            React.createElement('span', null, fmt(e.used) + ' / ' + fmt(e.total)),
            React.createElement('span', { className: pct >= 80 ? 'tkd-orange' : '' }, pct + '%'))) : null,
        windows.map((w) => React.createElement(WinRow, { key: w.key, win: w })),
        e.balance != null ? React.createElement('div', { className: 'tkd-balance' }, '余额 ', React.createElement('b', null, fmt(e.balance)), e.currency ? ' ' + e.currency : '') : null,
        dl != null ? React.createElement('div', { className: 'tkd-renew ' + dlCls }, daysText(dl)) : null,
        e.available === false ? React.createElement('div', { className: 'tkd-err' }, '账户不可用') : null,
        e.note ? React.createElement('div', { className: 'tkd-muted' }, e.note) : null,
        e.raw ? React.createElement('details', { className: 'tkd-raw' }, React.createElement('summary', null, '原始数据'), React.createElement('pre', null, e.raw)) : null,
        React.createElement(Sparkline, { points: props.points })))
}

function PriceEditor(props) {
  const row = props.row, onDone = props.onDone
  const [draft, setDraft] = React.useState(function () {
    const p = row.price || {}
    return { input: p.input !== undefined ? String(p.input) : '', output: p.output !== undefined ? String(p.output) : '', cacheRead: p.cacheRead !== undefined ? String(p.cacheRead) : '', cacheWrite: p.cacheWrite !== undefined ? String(p.cacheWrite) : '' }
  })
  const [busy, setBusy] = React.useState(false)
  function set(k, v) { setDraft(Object.assign({}, draft, { [k]: v })) }
  function save() {
    setBusy(true)
    host.call('usage-ledger/set-price', { model: row.model, price: draft }).then(function () { onDone() }, function () { setBusy(false) })
  }
  function field(k, label) { return React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 4 } }, label, React.createElement('input', { value: draft[k], placeholder: '—', onChange: function (e) { set(k, e.target.value) } })) }
  return React.createElement('div', { className: 'ul-row', style: { marginTop: 6 } },
    field('input', '输入'), field('output', '输出'), field('cacheRead', '缓存读'), field('cacheWrite', '缓存写'),
    React.createElement('button', { onClick: save, disabled: busy }, busy ? '保存中...' : '保存'),
    React.createElement('button', { onClick: onDone }, '取消'),
    React.createElement('span', { className: 'muted' }, 'USD / 1M tokens，留空沿用默认'))
}

let dashCache = null
async function loadDash(force) {
  if (dashCache && !force) return dashCache
  dashCache = await host.call('dash/get', {})
  return dashCache
}

function OverviewTab() {
  const [data, setData] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  const load = React.useCallback(async (force) => {
    setBusy(true)
    try { setData(await host.call(force ? 'dash/refresh' : 'dash/get', {})) } catch (e) { console.error(e) }
    setBusy(false)
  }, [])
  React.useEffect(() => { load(false) }, [load])
  if (!data) return React.createElement('div', { className: 'tkd-muted' }, '加载中...')
  const provs = data.providers.filter((p) => p.enabled)
  if (provs.length === 0) return React.createElement('div', { className: 'tkd-muted' }, '还没有配置任何平台。请打开 设置 - Token 用量 添加。')
  const alerts = data.alerts || []
  return React.createElement('div', null,
    React.createElement('div', { className: 'tkd-head' },
      React.createElement('h2', null, 'Token 用量 Dashboard'),
      React.createElement('div', { className: 'tkd-head-right' },
        data.lastRefresh ? React.createElement('span', { className: 'tkd-muted' }, '更新于 ' + new Date(data.lastRefresh).toLocaleTimeString()) : null,
        React.createElement('button', { className: 'tkd-btn', disabled: busy, onClick: () => load(true) }, busy ? '刷新中...' : '立即刷新'))),
    alerts.length > 0 ? React.createElement('div', { className: 'tkd-alertbar' },
      alerts.map((a) => React.createElement('div', { key: a.id, className: 'tkd-alert tkd-' + a.level }, a.text))) : null,
    React.createElement('div', { className: 'tkd-grid' },
      provs.map((p) => {
        const e = data.snapshot[p.id]
        const pts = (data.history || []).map((h) => h.entries[p.id]).filter(Boolean).map((c) => c.u != null ? c.u : (c.b != null ? c.b : 0))
        return React.createElement(ProviderCard, { key: p.id, provider: p, entry: e, points: pts.slice(-40) })
      })))
}

function LedgerTab() {
  const [days, setDays] = React.useState(7)
  const [data, setData] = React.useState(null)
  const [error, setError] = React.useState(null)
  const [editing, setEditing] = React.useState(null)
  const reload = React.useCallback(function () {
    host.call('usage-ledger/query', { days: days }).then(function (d) { setData(d); setError(null) }, function (e) { setError(String((e && e.message) || e)) })
  }, [days])
  React.useEffect(reload, [reload])
  const t = data && data.totals
  return React.createElement('div', { className: 'ul-wrap' },
    React.createElement('div', { className: 'ul-row' },
      React.createElement('span', null, '统计范围：'),
      LEDGER_RANGES.map(function (d) {
        return React.createElement('button', { key: d, className: days === d ? 'ul active' : 'ul', onClick: function () { setDays(d) } }, d === 1 ? '今天' : d + ' 天')
      }),
      React.createElement('button', { onClick: reload }, '刷新'),
      data ? React.createElement('span', { className: 'muted' }, '来源：宿主 dsh-usage 账本，共 ' + fmtInt(data.entriesTotal) + ' 次调用') : null),
    error ? React.createElement('div', { className: 'warn' }, '查询失败：' + error) : null,
    data && data.sourceEmpty ? React.createElement('div', { className: 'warn' }, '未找到宿主用量账本（~/.dsh/dsh-usage/usage-ledger.json）。') : null,
    t ? React.createElement('div', { className: 'ul-cards' },
      React.createElement('div', { className: 'ul-card' }, React.createElement('div', { className: 'v' }, fmtCost(t.cost)), React.createElement('div', { className: 'k' }, '总花费' + (t.costKnownRequests < t.requests ? '（部分模型无价）' : ''))),
      React.createElement('div', { className: 'ul-card' }, React.createElement('div', { className: 'v' }, fmtInt(t.requests)), React.createElement('div', { className: 'k' }, '模型调用')),
      React.createElement('div', { className: 'ul-card' }, React.createElement('div', { className: 'v' }, fmtInt(t.inputTokens)), React.createElement('div', { className: 'k' }, '输入 tokens')),
      React.createElement('div', { className: 'ul-card' }, React.createElement('div', { className: 'v' }, fmtInt(t.outputTokens)), React.createElement('div', { className: 'k' }, '输出 tokens')),
      React.createElement('div', { className: 'ul-card' }, React.createElement('div', { className: 'v' }, fmtInt(t.cacheReadTokens)), React.createElement('div', { className: 'k' }, '缓存命中 tokens'))) : null,
    data && data.byDay.length > 0 ? React.createElement('div', null,
      React.createElement('h3', null, '按天'),
      React.createElement('table', null,
        React.createElement('thead', null, React.createElement('tr', null, ['日期', '调用', '输入', '输出', '缓存读', '缓存写', '花费'].map(function (h, i) { return React.createElement('th', { key: h, className: i > 0 ? 'num' : '' }, h) }))),
        React.createElement('tbody', null, data.byDay.map(function (r) {
          return React.createElement('tr', { key: r.day }, React.createElement('td', null, r.day), React.createElement('td', { className: 'num' }, fmtInt(r.requests)), React.createElement('td', { className: 'num' }, fmtInt(r.inputTokens)), React.createElement('td', { className: 'num' }, fmtInt(r.outputTokens)), React.createElement('td', { className: 'num' }, fmtInt(r.cacheReadTokens)), React.createElement('td', { className: 'num' }, fmtInt(r.cacheWriteTokens)), React.createElement('td', { className: 'num' }, fmtCost(r.costKnownRequests > 0 ? r.cost : null)))
        })))) : null,
    data && data.byModel.length > 0 ? React.createElement('div', null,
      React.createElement('h3', null, '按模型（含 provider）'),
      React.createElement('table', null,
        React.createElement('thead', null, React.createElement('tr', null, ['模型', '调用', '输入', '输出', '花费', ''].map(function (h, i) { return React.createElement('th', { key: i, className: i > 0 && h !== '' ? 'num' : '' }, h) }))),
        React.createElement('tbody', null, data.byModel.map(function (r) {
          return React.createElement('tr', { key: r.key },
            React.createElement('td', null, r.model, React.createElement('span', { className: 'muted', style: { marginLeft: 6 } }, r.provider), r.priced ? null : React.createElement('span', { className: 'warn', style: { marginLeft: 6 } }, '未定价')),
            React.createElement('td', { className: 'num' }, fmtInt(r.requests)),
            React.createElement('td', { className: 'num' }, fmtInt(r.inputTokens)),
            React.createElement('td', { className: 'num' }, fmtInt(r.outputTokens)),
            React.createElement('td', { className: 'num' }, fmtCost(r.costKnownRequests > 0 ? r.cost : null)),
            React.createElement('td', null, editing === r.key ? null : React.createElement('button', { onClick: function () { setEditing(r.key) } }, '价格')))
        })))) : null,
    data && data.byModel.length > 0 ? data.byModel.map(function (r) {
      if (editing !== r.key) return null
      return React.createElement(PriceEditor, { key: r.key, row: r, onDone: function () { setEditing(null); reload() } })
    }) : null,
    data && data.unknownModels.length > 0 ? React.createElement('div', { className: 'warn' }, '价格表未覆盖：' + data.unknownModels.join('、') + '（点「价格」补充单价后计入花费）') : null)
}

function DashboardPage() {
  const iframeRef = React.useRef(null)
  const [embedHeight, setEmbedHeight] = React.useState(null)
  React.useEffect(() => {
    const el = iframeRef.current
    if (!el) return undefined
    const update = function () {
      // 实测 iframe 顶部到窗口底部的距离，让 iframe 精确填满剩余空间，
      // 避免写死高度在宿主布局变化时底部露出白条。
      const rect = el.getBoundingClientRect()
      const h = Math.max(400, Math.floor(window.innerHeight - rect.top))
      setEmbedHeight(h)
    }
    update()
    let ro = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(update)
      ro.observe(document.body)
      if (el.parentElement) ro.observe(el.parentElement)
    }
    window.addEventListener('resize', update)
    return function () {
      if (ro) ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])
  const style = embedHeight != null ? { height: embedHeight + 'px' } : { height: '80vh' }
  return React.createElement('iframe', {
    ref: iframeRef,
    className: 'tkd-embed',
    style: style,
    title: 'TokenDashboard 看板',
    src: 'http://127.0.0.1:8788/',
  })
}

function SidebarEntry(props) {
  const [count, setCount] = React.useState(0)
  React.useEffect(() => {
    let alive = true
    loadDash(false).then((d) => { if (alive) setCount((d.alerts || []).length) }).catch(function () {})
    return () => { alive = false }
  }, [])
  const size = Number(props && props.size) > 0 ? Number(props.size) : 18
  // Icon-only: the sidebar row already renders the registered label "Token 用量",
  // so any text here would show twice.
  return React.createElement('span', { className: 'tkd-side' },
    React.createElement('svg', {
      className: 'tkd-side-icon', width: size, height: size, viewBox: '0 0 16 16',
      fill: 'currentColor', 'aria-hidden': 'true', focusable: 'false',
    },
      React.createElement('rect', { x: 1.5, y: 8.5, width: 3, height: 6, rx: 0.8 }),
      React.createElement('rect', { x: 6.5, y: 4.5, width: 3, height: 10, rx: 0.8 }),
      React.createElement('rect', { x: 11.5, y: 1.5, width: 3, height: 13, rx: 0.8 })),
    count > 0 ? React.createElement('span', { className: 'tkd-badge' }, count) : null)
}

const seenAlerts = new Set()
let seenInit = false
function AlertOverlay() {
  const [toasts, setToasts] = React.useState([])
  React.useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const d = await loadDash(false); if (!alive) return
        const fresh = (d.alerts || []).filter((a) => !seenAlerts.has(a.id))
        for (const a of fresh) seenAlerts.add(a.id)
        if (!seenInit) { seenInit = true; return }
        if (fresh.length > 0) setToasts((cur) => cur.concat(fresh.map((a) => ({ key: a.id + ':' + Date.now(), text: a.text, level: a.level }))))
      } catch (e) {}
    }
    tick(); return () => { alive = false }
  }, [])
  const dismiss = (key) => setToasts((cur) => cur.filter((t) => t.key !== key))
  if (toasts.length === 0) return null
  return React.createElement('div', { className: 'tkd-toasts' },
    toasts.map((t) => React.createElement('div', { key: t.key, className: 'tkd-toast tkd-' + t.level },
      React.createElement('span', null, t.text),
      React.createElement('button', { className: 'tkd-toast-x', onClick: () => dismiss(t.key) }, 'x'))))
}

function SettingsPage() {
  const [draft, setDraft] = React.useState(null)
  const [status, setStatus] = React.useState('')
  React.useEffect(() => {
    loadDash(false).then((d) => {
      setDraft({ providers: d.providers.map((p) => Object.assign({}, p, { apiKey: '' })), thresholds: Object.assign({}, d.thresholds) })
    }).catch((e) => setStatus('加载失败: ' + e))
  }, [])
  if (!draft) return React.createElement('div', { className: 'tkd-muted' }, '加载中...')
  const upd = (i, field, value) => setDraft((d) => { const next = Object.assign({}, d, { providers: d.providers.slice() }); next.providers[i] = Object.assign({}, next.providers[i]); next.providers[i][field] = value; return next })
  const updKind = (i, kind) => setDraft((d) => { const next = Object.assign({}, d, { providers: d.providers.slice() }); next.providers[i] = Object.assign({}, next.providers[i], { kind: kind, name: next.providers[i].name || (KIND_LABELS[kind] || kind) }); return next })
  const updPlan = (i, field, value) => setDraft((d) => { const next = Object.assign({}, d, { providers: d.providers.slice() }); next.providers[i] = Object.assign({}, next.providers[i], { plan: Object.assign({}, next.providers[i].plan) }); next.providers[i].plan[field] = value; return next })
  const addProvider = (kind) => setDraft((d) => Object.assign({}, d, { providers: d.providers.concat([{ id: 'p' + Math.random().toString(36).slice(2, 8), name: kind ? (KIND_LABELS[kind] || kind) : '', kind: kind || 'manual', enabled: true, hasKey: false, apiKey: '', profile: '', plan: { total: 0, used: 0, renewDate: '', note: '' } }]) }))
  const removeProvider = (i) => setDraft((d) => Object.assign({}, d, { providers: d.providers.filter((_, j) => j !== i) }))
  const needsKey = (kind) => kind !== 'volc' && kind !== 'manual'
  const save = async () => {
    setStatus('保存中...')
    try {
      const payload = { providers: draft.providers.map((p) => { const row = { id: p.id, name: p.name || '未命名', kind: p.kind, enabled: p.enabled !== false, profile: p.profile || '', plan: { total: p.plan.total || 0, used: p.plan.used || 0, renewDate: p.plan.renewDate || '', note: p.plan.note || '' } }; if (p.apiKey) row.apiKey = p.apiKey; return row }), thresholds: { usagePct: draft.thresholds.usagePct, renewalDays: draft.thresholds.renewalDays } }
      const d = await host.call('dash/save', { config: payload }); dashCache = d
      setDraft({ providers: d.providers.map((p) => Object.assign({}, p, { apiKey: '' })), thresholds: Object.assign({}, d.thresholds) })
      setStatus('已保存并刷新')
    } catch (e) { setStatus('保存失败: ' + e) }
  }
  const KINDS = Object.keys(KIND_LABELS)
  return React.createElement('div', { className: 'tkd-settings' },
    React.createElement('h3', null, '快速添加'),
    React.createElement('div', { className: 'tkd-presets' }, KINDS.filter((k) => k !== 'manual').map((k) => React.createElement('button', { key: k, className: 'tkd-btn', onClick: () => addProvider(k) }, '+ ' + KIND_LABELS[k]))),
    React.createElement('h3', null, '已配置平台'),
    draft.providers.map((p, i) => React.createElement('div', { key: p.id, className: 'tkd-editor' },
      React.createElement('div', { className: 'tkd-editor-row' },
        React.createElement('label', null, '名称', React.createElement('input', { value: p.name, onChange: (e2) => upd(i, 'name', e2.target.value) })),
        React.createElement('label', null, '类型', React.createElement('select', { value: p.kind, onChange: (e2) => updKind(i, e2.target.value) }, KINDS.map((k) => React.createElement('option', { key: k, value: k }, KIND_LABELS[k])))),
        React.createElement('label', { className: 'tkd-check' }, React.createElement('input', { type: 'checkbox', checked: p.enabled !== false, onChange: (e2) => upd(i, 'enabled', e2.target.checked) }), '启用'),
        React.createElement('button', { className: 'tkd-btn tkd-danger', onClick: () => removeProvider(i) }, '删除')),
      needsKey(p.kind) ? React.createElement('label', null, 'API Key', React.createElement('input', { type: 'password', placeholder: p.hasKey ? '已配置' : 'sk-...', value: p.apiKey, onChange: (e2) => upd(i, 'apiKey', e2.target.value) })) : null,
      p.kind === 'volc' ? React.createElement('label', null, 'arkcli profile', React.createElement('input', { value: p.profile || '', placeholder: '默认 profile', onChange: (e2) => upd(i, 'profile', e2.target.value) })) : null,
      p.kind === 'manual' ? React.createElement('div', { className: 'tkd-editor-row' },
        React.createElement('label', null, '总额度', React.createElement('input', { type: 'number', value: p.plan.total, onChange: (e2) => updPlan(i, 'total', Number(e2.target.value) || 0) })),
        React.createElement('label', null, '已用', React.createElement('input', { type: 'number', value: p.plan.used, onChange: (e2) => updPlan(i, 'used', Number(e2.target.value) || 0) })),
        React.createElement('label', null, '续费日期', React.createElement('input', { type: 'date', value: (p.plan.renewDate || '').slice(0, 10), onChange: (e2) => updPlan(i, 'renewDate', e2.target.value) }))) : null)),
    React.createElement('button', { className: 'tkd-btn', onClick: () => addProvider('manual') }, '+ 添加手动订阅'),
    React.createElement('h3', null, '提醒阈值'),
    React.createElement('div', { className: 'tkd-editor-row' },
      React.createElement('label', null, '用量告警 (%)', React.createElement('input', { type: 'number', value: draft.thresholds.usagePct, onChange: (e2) => setDraft((d) => Object.assign({}, d, { thresholds: Object.assign({}, d.thresholds, { usagePct: Number(e2.target.value) || 80 }) })) })),
      React.createElement('label', null, '续费提前提醒 (天)', React.createElement('input', { type: 'number', value: draft.thresholds.renewalDays, onChange: (e2) => setDraft((d) => Object.assign({}, d, { thresholds: Object.assign({}, d.thresholds, { renewalDays: Number(e2.target.value) || 7 }) })) }))),
    React.createElement('div', { className: 'tkd-save-row' },
      React.createElement('button', { className: 'tkd-btn tkd-primary', onClick: save }, '保存并刷新'),
      React.createElement('span', { className: 'tkd-muted' }, status)))
}

return {
  apply(ctx) {
    styles.insert(CSS_LINES.join('\n'))
    const slots = ctx.get('slots')
    if (slots === undefined) return
    slots.inject('sidebar.panellist', () => { slots.register({ name: 'sidebar.panellist', id: 'token-dashboard', order: 50, label: 'Token 用量' }, SidebarEntry) })
    slots.inject('main', () => { slots.register({ name: 'main', key: 'token-dashboard' }, DashboardPage) })
    slots.inject('settings.section', () => { slots.register({ name: 'settings.section', id: 'token-dashboard', order: 60, label: 'Token 用量' }, SettingsPage) })
    slots.inject('shell.overlay', () => { slots.register({ name: 'shell.overlay', id: 'token-dashboard-alerts', order: 90, label: 'Token 提醒' }, AlertOverlay) })
  },
}