/**
 * app.js - TokenDashboard UI. Reads /api/overview and /api/series and renders
 * a polished, chart-rich view of the host dsh-usage ledger.
 */
(function () {
  'use strict'

  var C = window.TDCharts
  var app = document.getElementById('app')

  var state = {
    tab: 'ledger',
    days: 7,
    dim: 'day',
    chartType: 'bar',
    hidden: {},
    overview: null,
    series: null,
    trendBuckets: [],
    trendModels: [],
    loading: true,
    error: null,
    refreshedAt: null,
    theme: localStorage.getItem('td-theme') || 'auto'
  }

  var modelIndex = {}
  var modelOrder = []

  var bootParams = new URLSearchParams(location.search)
  var bootTheme = bootParams.get('theme')
  if (bootTheme === 'light' || bootTheme === 'dark' || bootTheme === 'auto') state.theme = bootTheme
  var bootTab = location.hash.replace('#', '')
  if (bootTab === 'overview' || bootTab === 'ledger') state.tab = bootTab
  var bootDim = bootParams.get('dim')
  if (bootDim === 'hour' || bootDim === 'day' || bootDim === 'week' || bootDim === 'month') state.dim = bootDim
  var bootChart = bootParams.get('chart')
  if (bootChart === 'bar' || bootChart === 'line') state.chartType = bootChart
  var bootDays = Number(bootParams.get('days'))
  if (bootDays > 0) state.days = bootDays

  function api(url, options) {
    return fetch(url, options).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status)
      return res.json()
    })
  }

  function totalTok(row) {
    return (row.inputTokens || 0) + (row.outputTokens || 0) + (row.cacheReadTokens || 0) + (row.cacheWriteTokens || 0)
  }

  function esc(value) {
    return C.esc(value)
  }

  function modelLabel(key) {
    var entry = modelIndex[key]
    return entry ? entry.model : String(key).split('/').slice(1).join('/')
  }

  function providerLabel(key) {
    var entry = modelIndex[key]
    return entry ? entry.provider : String(key).split('/')[0]
  }

  function rebuildModelIndex() {
    modelIndex = {}
    modelOrder = []
    var rows = (state.overview && state.overview.byModel) || []
    var sorted = rows.slice().sort(function (a, b) { return totalTok(b) - totalTok(a) })
    sorted.forEach(function (row, index) {
      modelIndex[row.key] = {
        key: row.key,
        model: row.model,
        provider: row.provider,
        color: C.colorFor(index)
      }
      modelOrder.push(row.key)
    })
    var seriesModels = (state.series && state.series.models) || []
    seriesModels.forEach(function (row) {
      if (modelIndex[row.key]) return
      modelIndex[row.key] = {
        key: row.key,
        model: row.model,
        provider: row.provider,
        color: C.colorFor(modelOrder.length)
      }
      modelOrder.push(row.key)
    })
  }

  function visibleKeys() {
    return modelOrder.filter(function (key) { return !state.hidden[key] })
  }

  function setDefaults() {
    state.hidden = {}
    var rows = ((state.overview && state.overview.byModel) || []).slice().sort(function (a, b) { return totalTok(b) - totalTok(a) })
    rows.forEach(function (row, index) {
      if (index >= 6) state.hidden[row.key] = true
    })
  }

  function daysForDim() {
    if (state.dim === 'hour') return 1
    if (state.dim === 'week') return Math.max(state.days, 30)
    if (state.dim === 'month') return Math.max(state.days, 90)
    return state.days
  }

  function fetchAll() {
    state.loading = true
    render()
    var overviewUrl = '/api/overview?days=' + state.days
    var seriesUrl
    if (state.dim === 'hour') {
      var hours = state.days <= 1 ? 24 : state.days <= 7 ? 72 : state.days <= 30 ? 168 : 336
      seriesUrl = '/api/series?dim=hour&hours=' + hours
    } else {
      seriesUrl = '/api/series?dim=' + state.dim + '&days=' + daysForDim()
    }
    return Promise.all([api(overviewUrl), api(seriesUrl)]).then(function (results) {
      state.overview = results[0]
      state.series = results[1]
      rebuildModelIndex()
      if (Object.keys(state.hidden).length === 0) setDefaults()
      state.loading = false
      state.error = null
      state.refreshedAt = new Date()
      render()
    }).catch(function (err) {
      state.loading = false
      state.error = String((err && err.message) || err)
      render()
    })
  }

  function fetchSeries() {
    var seriesUrl
    if (state.dim === 'hour') {
      var hours = state.days <= 1 ? 24 : state.days <= 7 ? 72 : state.days <= 30 ? 168 : 336
      seriesUrl = '/api/series?dim=hour&hours=' + hours
    } else {
      seriesUrl = '/api/series?dim=' + state.dim + '&days=' + daysForDim()
    }
    return api(seriesUrl).then(function (series) {
      state.series = series
      rebuildModelIndex()
      render()
    })
  }

  function bucketLabel(bucket, dim) {
    if (dim === 'hour') {
      var start = String(bucket.start || '')
      var parts = start.split(' ')
      if (parts.length < 2) return start
      var hm = parts[1].slice(0, 5)
      return hm === '00:00' ? parts[0].slice(5) : hm
    }
    if (dim === 'month') return String(bucket.key)
    var key = String(bucket.start || bucket.key || '')
    return key.slice(5)
  }

  function segmented(options, active, action) {
    return options.map(function (option) {
      var cls = option.value === active ? 'td-seg-btn is-active' : 'td-seg-btn'
      return '<button type="button" class="' + cls + '" data-action="' + action + '" data-value="' + esc(option.value) + '">' + esc(option.label) + '</button>'
    }).join('')
  }

  function kpiCard(label, value, sub, accent) {
    return '<div class="td-kpi" style="--accent:' + accent + '">' +
      '<span class="td-kpi-label">' + esc(label) + '</span>' +
      '<span class="td-kpi-value">' + esc(value) + '</span>' +
      '<span class="td-kpi-sub">' + esc(sub || '') + '</span>' +
      '</div>'
  }

  function renderTopbar() {
    var updated = state.refreshedAt ? state.refreshedAt.toLocaleTimeString() : '--:--:--'
    return '<header class="td-topbar">' +
      '<div class="td-brand">' +
      '<span class="td-brand-mark">TD</span>' +
      '<div><h1>TokenDashboard</h1><p>Token 消费明细 · 数据来自宿主 dsh-usage 账本</p></div>' +
      '</div>' +
      '<div class="td-topbar-actions">' +
      '<span class="td-updated">更新于 ' + esc(updated) + '</span>' +
      '<button type="button" class="td-ghost-btn" data-action="refresh">' + (state.loading ? '刷新中…' : '刷新') + '</button>' +
      '<button type="button" class="td-ghost-btn" data-action="theme" title="切换主题">' + (state.theme === 'dark' ? '深色' : state.theme === 'light' ? '浅色' : '跟随系统') + '</button>' +
      '</div></header>'
  }

  function renderTabs() {
    function tab(value, label) {
      var cls = state.tab === value ? 'td-tab is-active' : 'td-tab'
      return '<button type="button" role="tab" class="' + cls + '" data-action="tab" data-value="' + value + '">' + esc(label) + '</button>'
    }
    return '<nav class="td-tabs" role="tablist">' + tab('overview', '平台总览') + tab('ledger', '消费明细') + '</nav>'
  }

  function sourceLine() {
    var ov = state.overview
    if (!ov) return ''
    var total = ov.entriesTotal || 0
    var dimText = state.dim === 'hour' ? '小时' : state.dim === 'week' ? '周' : state.dim === 'month' ? '月' : '天'
    return '账本共 ' + C.fmtInt(total) + ' 次调用 · 当前按「' + dimText + '」聚合 · ' +
      (ov.firstDay ? '数据区间 ' + ov.firstDay + ' ~ ' + ov.lastDay : '暂无数据')
  }

  function renderLedger() {
    var ov = state.overview
    if (!ov) return ''
    var t = ov.totals || {}
    var totalAll = totalTok(t)
    var cacheHit = totalAll > 0 ? Math.round((t.cacheReadTokens / totalAll) * 100) : 0
    var cacheDenom = t.inputTokens + t.cacheReadTokens + t.cacheWriteTokens
    var hitRate = cacheDenom > 0 ? Math.round((t.cacheReadTokens / cacheDenom) * 100) : 0
    var cost = t.cost || 0
    var estimated = t.estimatedCost || 0

    var kpis = '<div class="td-kpis">' +
      kpiCard('总花费', C.fmtCost(cost), estimated > 0 ? '含手填单价估算 ' + C.fmtCost(estimated) : '按账本价目', 'var(--td-accent)') +
      kpiCard('模型调用', C.fmtInt(t.calls), '次请求', '#22d3ee') +
      kpiCard('输入 tokens', C.fmtInt(t.inputTokens), '未命中缓存的输入', '#f59e0b') +
      kpiCard('输出 tokens', C.fmtInt(t.outputTokens), '含 reasoning ' + C.fmtInt(t.reasoningTokens || 0), '#ef4444') +
      kpiCard('缓存命中 tokens', C.fmtInt(t.cacheReadTokens), '命中率 ' + hitRate + '%', '#10b981') +
      kpiCard('缓存写 tokens', C.fmtInt(t.cacheWriteTokens), '占总量 ' + cacheHit + '%', '#a855f7') +
      '</div>'

    var rangeButtons = segmented([
      { value: '1', label: '今天' },
      { value: '7', label: '7 天' },
      { value: '30', label: '30 天' },
      { value: '90', label: '90 天' }
    ], String(state.days), 'range')

    var toolbar = '<div class="td-toolbar">' +
      '<div class="td-seg">' + rangeButtons + '</div>' +
      '<span class="td-muted">' + esc(sourceLine()) + '</span>' +
      '</div>'

    return toolbar + kpis + renderTrendCard() + renderBreakdowns() + renderCallsCard() + renderDayTable() + renderModelTable()
  }

  function renderTrendCard() {
    var dimButtons = segmented([
      { value: 'hour', label: '小时' },
      { value: 'day', label: '天' },
      { value: 'week', label: '周' },
      { value: 'month', label: '月' }
    ], state.dim, 'dim')
    var typeButtons = segmented([
      { value: 'bar', label: '柱状' },
      { value: 'line', label: '曲线' }
    ], state.chartType, 'chart-type')

    var series = state.series || { buckets: [], models: [] }
    var visible = visibleKeys()
    var buckets = []
    var hiddenTotal = 0
    series.buckets.forEach(function (bucket) {
      var values = {}
      var total = 0
      var hiddenSum = 0
      Object.keys(bucket.models || {}).forEach(function (key) {
        var value = bucket.models[key] || 0
        if (state.hidden[key]) { hiddenSum += value; return }
        values[key] = value
        total += value
      })
      if (hiddenSum > 0) {
        values['__other__'] = hiddenSum
        total += hiddenSum
        hiddenTotal += hiddenSum
      }
      buckets.push({ label: bucketLabel(bucket, series.dim), values: values, total: total })
    })

    var chartModels = visible.map(function (key) {
      return { key: key, label: modelLabel(key), color: modelIndex[key].color }
    })
    if (state.dim !== 'hour' && hiddenTotal > 0) {
      var other = { key: '__other__', label: '其他模型', color: '#94a3b8' }
      if (state.chartType === 'line') {
        // line mode shows only the individually selected models
      } else {
        chartModels.push(other)
      }
    }

    state.trendBuckets = buckets
    state.trendModels = chartModels

    var svg = buckets.length > 0
      ? C.trend({ buckets: buckets, models: chartModels, type: state.chartType })
      : '<div class="td-empty">暂无数据</div>'

    var legend = modelOrder.map(function (key) {
      var entry = modelIndex[key]
      var on = !state.hidden[key]
      return '<button type="button" class="td-legend-item' + (on ? ' is-on' : '') + '" data-action="toggle-model" data-value="' + esc(key) + '">' +
        '<span class="td-legend-dot" style="background:' + (on ? entry.color : 'transparent') + ';border-color:' + entry.color + '"></span>' +
        '<span class="td-legend-name">' + esc(entry.model) + '</span>' +
        '<span class="td-legend-provider">' + esc(entry.provider) + '</span>' +
        '</button>'
    }).join('')

    var legendActions = '<div class="td-legend-actions">' +
      '<button type="button" class="td-mini-btn" data-action="all-models" data-value="all">全选</button>' +
      '<button type="button" class="td-mini-btn" data-action="all-models" data-value="top">仅前 6</button>' +
      '</div>'

    return '<section class="td-card td-card-wide">' +
      '<div class="td-card-head">' +
      '<div><h2>模型用量趋势</h2><p>按模型堆叠的 token 用量，可切换小时 / 天 / 周 / 月与柱状 / 曲线</p></div>' +
      '<div class="td-card-controls"><div class="td-seg">' + dimButtons + '</div><div class="td-seg">' + typeButtons + '</div></div>' +
      '</div>' +
      '<div class="td-chart-wrap"><div class="td-chart-svg">' + svg + '</div><div class="td-tooltip" hidden></div></div>' +
      '<div class="td-legend-head"><span>模型（点击显示/隐藏）</span>' + legendActions + '</div>' +
      '<div class="td-legend">' + legend + '</div>' +
      '</section>'
  }

  function renderBreakdowns() {
    var ov = state.overview
    var t = ov.totals || {}
    var composition = [
      { label: '输入（未缓存）', value: t.inputTokens || 0, color: '#f59e0b' },
      { label: '输出', value: t.outputTokens || 0, color: '#ef4444' },
      { label: '缓存命中', value: t.cacheReadTokens || 0, color: '#10b981' },
      { label: '缓存写', value: t.cacheWriteTokens || 0, color: '#a855f7' }
    ]
    var compTotal = composition.reduce(function (acc, s) { return acc + s.value }, 0)
    var compDonut = C.donut({
      segments: composition,
      centerValue: C.fmtTokens(compTotal),
      centerLabel: 'tokens 合计',
      size: 210
    })
    var compLegend = composition.map(function (seg) {
      var pct = compTotal > 0 ? ((seg.value / compTotal) * 100).toFixed(1) : '0.0'
      return '<li><span class="td-legend-dot" style="background:' + seg.color + '"></span>' +
        '<span class="td-legend-name">' + esc(seg.label) + '</span>' +
        '<span class="td-legend-value">' + esc(C.fmtTokens(seg.value)) + '</span>' +
        '<span class="td-legend-pct">' + pct + '%</span></li>'
    }).join('')

    var costRows = (ov.byModel || []).filter(function (row) { return row.effectiveCost > 0 }).slice(0, 8).map(function (row) {
      return { label: row.model, value: row.effectiveCost, color: modelIndex[row.key] ? modelIndex[row.key].color : '#6366f1' }
    })
    var costBar = C.hbar({ rows: costRows, format: C.fmtCost, width: 460, labelW: 140, valueW: 84 })

    var providerRows = (ov.byProvider || []).slice(0, 8).map(function (row, index) {
      return { label: row.provider, value: totalTok(row), color: C.colorFor(index) }
    })
    var providerBar = C.hbar({ rows: providerRows, format: C.fmtTokens, width: 460, labelW: 150 })

    return '<div class="td-grid-3">' +
      '<section class="td-card"><div class="td-card-head"><div><h2>Token 构成</h2><p>输入 / 输出 / 缓存</p></div></div>' +
      '<div class="td-donut-wrap">' + compDonut + '</div><ul class="td-legend-list">' + compLegend + '</ul></section>' +
      '<section class="td-card"><div class="td-card-head"><div><h2>各模型花费</h2><p>按估算花费排序 Top 8</p></div></div>' + costBar + '</section>' +
      '<section class="td-card"><div class="td-card-head"><div><h2>Provider 用量占比</h2><p>按 token 总量</p></div></div>' + providerBar + '</section>' +
      '</div>'
  }

  function renderCallsCard() {
    var series = state.series || { buckets: [] }
    var values = series.buckets.map(function (b) { return b.calls || 0 })
    var svg = C.sparkline(values, { width: 900, height: 70, color: '#22d3ee' })
    var total = values.reduce(function (acc, v) { return acc + v }, 0)
    var peak = values.length > 0 ? Math.max.apply(null, values) : 0
    return '<section class="td-card td-card-wide"><div class="td-card-head">' +
      '<div><h2>调用次数趋势</h2><p>当前粒度共 ' + C.fmtInt(total) + ' 次，单桶峰值 ' + C.fmtInt(peak) + ' 次</p></div>' +
      '</div><div class="td-spark-wrap">' + svg + '</div></section>'
  }

  function renderDayTable() {
    var ov = state.overview
    var rows = (ov.byDay || []).slice().reverse()
    if (rows.length === 0) return ''
    var maxTok = 1
    rows.forEach(function (row) { maxTok = Math.max(maxTok, totalTok(row)) })
    var head = '<tr><th>日期</th><th class="num">调用</th><th class="num">输入</th><th class="num">输出</th><th class="num">缓存命中</th><th class="num">缓存写</th><th>用量</th><th class="num">花费</th></tr>'
    var body = rows.map(function (row) {
      var tokens = totalTok(row)
      var pct = Math.round((tokens / maxTok) * 100)
      return '<tr>' +
        '<td class="td-strong">' + esc(row.day) + '</td>' +
        '<td class="num">' + C.fmtInt(row.calls) + '</td>' +
        '<td class="num">' + C.fmtInt(row.inputTokens) + '</td>' +
        '<td class="num">' + C.fmtInt(row.outputTokens) + '</td>' +
        '<td class="num">' + C.fmtInt(row.cacheReadTokens) + '</td>' +
        '<td class="num">' + C.fmtInt(row.cacheWriteTokens) + '</td>' +
        '<td><span class="td-mini-track"><span class="td-mini-fill" style="width:' + pct + '%"></span></span></td>' +
        '<td class="num td-cost">' + esc(C.fmtCost(row.cost)) + '</td>' +
        '</tr>'
    }).join('')
    var t = ov.totals || {}
    var foot = '<tr class="td-total-row"><td>合计</td><td class="num">' + C.fmtInt(t.calls) + '</td><td class="num">' + C.fmtInt(t.inputTokens) + '</td><td class="num">' + C.fmtInt(t.outputTokens) + '</td><td class="num">' + C.fmtInt(t.cacheReadTokens) + '</td><td class="num">' + C.fmtInt(t.cacheWriteTokens) + '</td><td></td><td class="num td-cost">' + esc(C.fmtCost(t.cost)) + '</td></tr>'
    return '<section class="td-card td-card-wide"><div class="td-card-head"><div><h2>按天</h2><p>dsh-usage 账本的每日折叠</p></div></div>' +
      '<div class="td-table-wrap"><table class="td-table"><thead>' + head + '</thead><tbody>' + body + foot + '</tbody></table></div></section>'
  }

  function renderModelTable() {
    var ov = state.overview
    var rows = ov.byModel || []
    if (rows.length === 0) return ''
    var maxTok = 1
    rows.forEach(function (row) { maxTok = Math.max(maxTok, totalTok(row)) })
    var head = '<tr><th>模型</th><th class="num">调用</th><th class="num">输入</th><th class="num">输出</th><th class="num">缓存命中</th><th>占比</th><th class="num">花费</th><th></th></tr>'
    var body = rows.map(function (row) {
      var entry = modelIndex[row.key] || { color: '#94a3b8' }
      var tokens = totalTok(row)
      var pct = Math.round((tokens / maxTok) * 100)
      var priceTag = row.ledgerCost > 0
        ? '<span class="td-tag td-tag-solid">账本</span>'
        : row.estimatedCost > 0
          ? '<span class="td-tag">估算</span>'
          : '<span class="td-tag td-tag-muted">套餐内</span>'
      return '<tr>' +
        '<td><span class="td-model"><span class="td-legend-dot" style="background:' + entry.color + '"></span>' +
        '<span class="td-model-name">' + esc(row.model) + '</span>' +
        '<span class="td-model-provider">' + esc(row.provider) + '</span>' + priceTag + '</span></td>' +
        '<td class="num">' + C.fmtInt(row.calls) + '</td>' +
        '<td class="num">' + C.fmtInt(row.inputTokens) + '</td>' +
        '<td class="num">' + C.fmtInt(row.outputTokens) + '</td>' +
        '<td class="num">' + C.fmtInt(row.cacheReadTokens) + '</td>' +
        '<td><span class="td-mini-track"><span class="td-mini-fill" style="width:' + pct + '%;background:' + entry.color + '"></span></span></td>' +
        '<td class="num td-cost">' + esc(C.fmtCost(row.effectiveCost)) + '</td>' +
        '<td class="num"><button type="button" class="td-mini-btn" data-action="price" data-value="' + esc(row.model) + '">价格</button></td>' +
        '</tr>'
    }).join('')
    return '<section class="td-card td-card-wide"><div class="td-card-head"><div><h2>按模型（含 provider）</h2><p>点「价格」可补充单价，用于估算套餐外花费</p></div></div>' +
      '<div class="td-table-wrap"><table class="td-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div></section>'
  }

  function renderOverview() {
    var ov = state.overview
    var snapshots = (ov && ov.snapshots && ov.snapshots.providers) || {}
    var ids = Object.keys(snapshots).filter(function (id) { return snapshots[id] && snapshots[id].credential !== 'none' })
    if (ids.length === 0) {
      return '<div class="td-empty">暂无 provider 余额快照。</div>'
    }
    var cards = ids.map(function (id) {
      var p = snapshots[id] || {}
      var name = p.displayName || id
      var body = ''
      if (p.balance && p.balance.totalBalance !== undefined) {
        var cur = String(p.balance.currency || '').toUpperCase()
        var symbol = cur === 'CNY' ? '¥' : cur === 'USD' ? '$' : ''
        body += '<div class="td-provider-balance">' + esc(symbol + p.balance.totalBalance) + ' <span class="td-muted">' + esc(cur) + '</span></div>'
      }
      var windows = (p.plan && p.plan.windows) || []
      if (windows.length > 0) {
        body += '<div class="td-windows">' + windows.map(function (w) {
          var hasPct = w.percent !== null && w.percent !== undefined
          var pct = Math.max(0, Math.min(100, Number(w.percent) || 0))
          var tone = pct >= 90 ? 'is-danger' : pct >= 70 ? 'is-warn' : 'is-ok'
          return '<div class="td-window"><div class="td-window-head"><span>' + esc(w.name || w.key) + '</span><span>' + (hasPct ? pct + '%' : '可用') + '</span></div>' +
            '<span class="td-track"><span class="td-fill ' + tone + '" style="width:' + pct + '%"></span></span>' +
            (w.resetsAt ? '<span class="td-window-reset">重置于 ' + esc(new Date(w.resetsAt).toLocaleString()) + '</span>' : '') +
            '</div>'
        }).join('') + '</div>'
      }
      if (!body) body = '<div class="td-muted">' + esc(p.credential === 'none' ? '未配置凭证' : '无余额/套餐数据') + '</div>'
      var cred = p.credential === 'oauth' ? 'OAuth' : p.credential === 'env' ? '环境变量' : p.credential === 'key' ? 'API Key' : p.credential === 'auto' ? '自动发现凭证' : '未配置'
      if (p.error) body += '<div class="td-muted">' + esc(String(p.error).slice(0, 120)) + '</div>'
      return '<section class="td-card td-provider-card">' +
        '<div class="td-card-head"><div><h2>' + esc(name) + '</h2><p>' + esc(id) + ' · ' + esc(cred) + '</p></div></div>' +
        body + '</section>'
    }).join('')
    var updated = ov.snapshots && ov.snapshots.providers ? '' : ''
    return '<div class="td-provider-grid">' + cards + '</div>'
  }

  function renderModal() {
    if (!state.modal) return ''
    var row = state.modal
    var price = state.overrides[row.model] || {}
    function field(key, label) {
      return '<label class="td-field"><span>' + esc(label) + '</span><input type="number" step="0.001" min="0" data-field="' + key + '" value="' + esc(price[key] !== undefined ? price[key] : '') + '" placeholder="0"></label>'
    }
    return '<div class="td-modal-backdrop" data-action="price-close">' +
      '<div class="td-modal" role="dialog">' +
      '<h3>设置单价 · ' + esc(row.model) + '</h3>' +
      '<p class="td-muted">单位：USD / 1M tokens。留空则沿用默认价目。</p>' +
      '<div class="td-fields">' + field('input', '输入') + field('output', '输出') + field('cacheRead', '缓存读') + field('cacheWrite', '缓存写') + '</div>' +
      '<div class="td-modal-actions">' +
      '<button type="button" class="td-mini-btn" data-action="price-clear" data-value="' + esc(row.model) + '">清除</button>' +
      '<span class="td-spacer"></span>' +
      '<button type="button" class="td-ghost-btn" data-action="price-close">取消</button>' +
      '<button type="button" class="td-primary-btn" data-action="price-save" data-value="' + esc(row.model) + '">保存</button>' +
      '</div></div></div>'
  }

  function render() {
    var themeAttr = state.theme
    document.documentElement.setAttribute('data-theme', themeAttr)
    var body = ''
    if (state.error) {
      body = '<div class="td-error">加载失败：' + esc(state.error) + '<button type="button" class="td-ghost-btn" data-action="refresh">重试</button></div>'
    } else if (state.loading && !state.overview) {
      body = '<div class="td-skeleton"><div class="td-skeleton-row"></div><div class="td-skeleton-row"></div><div class="td-skeleton-row"></div></div>'
    } else if (state.tab === 'overview') {
      body = renderOverview()
    } else {
      body = renderLedger()
    }
    app.innerHTML = renderTopbar() + renderTabs() + '<main class="td-main">' + body + '</main>' + renderModal()
  }

  function savePrice(model) {
    var modal = app.querySelector('.td-modal')
    if (!modal) return
    var price = {}
    modal.querySelectorAll('input[data-field]').forEach(function (input) {
      if (input.value !== '') price[input.dataset.field] = Number(input.value)
    })
    api('/api/price', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: model, price: price })
    }).then(function (res) {
      state.overrides = res.overrides || {}
      state.modal = null
      return fetchAll()
    }).catch(function (err) {
      state.error = String((err && err.message) || err)
      render()
    })
  }

  function clearPrice(model) {
    api('/api/price', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: model, clear: true })
    }).then(function (res) {
      state.overrides = res.overrides || {}
      state.modal = null
      return fetchAll()
    }).catch(function (err) {
      state.error = String((err && err.message) || err)
      render()
    })
  }

  function modelRowFor(model) {
    var rows = (state.overview && state.overview.byModel) || []
    for (var i = 0; i < rows.length; i += 1) {
      if (rows[i].model === model) return rows[i]
    }
    return { model: model, key: model, provider: '' }
  }

  app.addEventListener('click', function (event) {
    var target = event.target.closest('[data-action]')
    if (!target) return
    var action = target.dataset.action
    var value = target.dataset.value
    if (action === 'tab') {
      state.tab = value
      if (location.hash !== '#' + value) history.replaceState(null, '', '#' + value)
      render()
    } else if (action === 'range') {
      state.days = Number(value)
      fetchAll()
    } else if (action === 'dim') {
      state.dim = value
      fetchSeries()
    } else if (action === 'chart-type') {
      state.chartType = value
      render()
    } else if (action === 'toggle-model') {
      state.hidden[value] = !state.hidden[value]
      render()
    } else if (action === 'all-models') {
      if (value === 'all') {
        state.hidden = {}
      } else {
        state.hidden = {}
        modelOrder.forEach(function (key, index) { if (index >= 6) state.hidden[key] = true })
      }
      render()
    } else if (action === 'refresh') {
      fetchAll()
    } else if (action === 'theme') {
      state.theme = state.theme === 'auto' ? 'light' : state.theme === 'light' ? 'dark' : 'auto'
      localStorage.setItem('td-theme', state.theme)
      render()
    } else if (action === 'price') {
      state.modal = modelRowFor(value)
      render()
    } else if (action === 'price-save') {
      savePrice(value)
    } else if (action === 'price-clear') {
      clearPrice(value)
    } else if (action === 'price-close') {
      if (event.target === target || target === event.target) {
        state.modal = null
        render()
      }
    }
  })

  function hideTooltip() {
    var tip = app.querySelector('.td-tooltip')
    if (tip) tip.hidden = true
  }

  app.addEventListener('mousemove', function (event) {
    var band = event.target.closest ? event.target.closest('.td-band') : null
    var tip = app.querySelector('.td-tooltip')
    if (!band || !tip) {
      hideTooltip()
      return
    }
    var index = Number(band.dataset.i)
    var bucket = state.trendBuckets[index]
    if (!bucket) { hideTooltip(); return }
    var rows = []
    state.trendModels.forEach(function (model) {
      var value = bucket.values[model.key] || 0
      if (value <= 0) return
      var pct = bucket.total > 0 ? Math.round((value / bucket.total) * 100) : 0
      rows.push('<li><span class="td-legend-dot" style="background:' + model.color + '"></span>' +
        '<span class="td-legend-name">' + esc(model.label) + '</span>' +
        '<span class="td-legend-value">' + esc(C.fmtTokens(value)) + '</span>' +
        '<span class="td-legend-pct">' + pct + '%</span></li>')
    })
    tip.innerHTML = '<div class="td-tip-title">' + esc(bucket.label) + ' · ' + esc(C.fmtTokens(bucket.total)) + ' tokens</div><ul>' + rows.join('') + '</ul>'
    tip.hidden = false
    var wrap = app.querySelector('.td-chart-wrap')
    if (wrap) {
      var rect = wrap.getBoundingClientRect()
      var x = event.clientX - rect.left
      var y = event.clientY - rect.top
      tip.style.left = Math.min(Math.max(12, x + 14), rect.width - tip.offsetWidth - 12) + 'px'
      tip.style.top = Math.max(12, y - 10) + 'px'
    }
  })

  app.addEventListener('mouseleave', hideTooltip)

  fetchAll()
  window.setInterval(function () {
    if (document.visibilityState === 'visible') fetchAll()
  }, 20000)
})()
