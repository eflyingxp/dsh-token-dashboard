/**
 * charts.js - dependency-free SVG charts for the TokenDashboard.
 * Exposes window.TDCharts with number formatting plus trend / donut / bar /
 * sparkline builders. Every builder returns an SVG markup string.
 */
(function () {
  'use strict'

  var PALETTE = [
    '#6366f1', '#22d3ee', '#f59e0b', '#ef4444', '#10b981',
    '#a855f7', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
    '#8b5cf6', '#eab308'
  ]

  function colorFor(index) {
    return PALETTE[index % PALETTE.length]
  }

  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function nf(value) {
    var num = Number(value) || 0
    return Math.round(num).toLocaleString('en-US')
  }

  function fmtTokens(value) {
    var num = Number(value) || 0
    if (num <= 0) return '0'
    if (num < 1000) return String(Math.round(num))
    if (num < 1000000) return trim(num / 1000) + 'k'
    if (num < 1000000000) return trim(num / 1000000) + 'M'
    return trim(num / 1000000000) + 'B'
  }

  function trim(value) {
    if (value >= 100) return String(Math.round(value))
    return value.toFixed(value >= 10 ? 1 : 2).replace(/\.?0+$/, '')
  }

  function fmtCost(value) {
    var num = Number(value) || 0
    return '$' + num.toFixed(num >= 100 ? 2 : 4)
  }

  function fmtInt(value) {
    return nf(value)
  }

  function niceMax(value) {
    if (!Number.isFinite(value) || value <= 0) return 1
    var exp = Math.floor(Math.log10(value))
    var base = Math.pow(10, exp)
    var norm = value / base
    var step
    if (norm <= 1) step = 1
    else if (norm <= 1.2) step = 1.2
    else if (norm <= 1.5) step = 1.5
    else if (norm <= 2) step = 2
    else if (norm <= 2.5) step = 2.5
    else if (norm <= 3) step = 3
    else if (norm <= 4) step = 4
    else if (norm <= 5) step = 5
    else if (norm <= 6) step = 6
    else if (norm <= 8) step = 8
    else step = 10
    return step * base
  }

  function labelStep(count) {
    if (count <= 12) return 1
    return Math.ceil(count / 12)
  }

  /**
   * Stacked bar or multi-line trend chart.
   * opts: { buckets:[{label, values:{key:number}, total}], models:[{key,label,color}], type, height }
   */
  function trend(opts) {
    var buckets = opts.buckets || []
    var models = opts.models || []
    var type = opts.type === 'line' ? 'line' : 'bar'
    var W = 980
    var H = opts.height || 340
    var m = { t: 16, r: 16, b: 40, l: 68 }
    var iw = W - m.l - m.r
    var ih = H - m.t - m.b
    var count = buckets.length

    var max = 0
    for (var i = 0; i < buckets.length; i += 1) {
      var b = buckets[i]
      if (type === 'bar') {
        if (b.total > max) max = b.total
      } else {
        for (var j = 0; j < models.length; j += 1) {
          var v = b.values[models[j].key] || 0
          if (v > max) max = v
        }
      }
    }
    max = niceMax(max)

    var svg = []
    svg.push('<svg viewBox="0 0 ' + W + ' ' + H + '" class="td-chart" preserveAspectRatio="xMidYMid meet" role="img">')

    // horizontal grid + y labels
    var ticks = 4
    for (var t = 0; t <= ticks; t += 1) {
      var value = (max / ticks) * t
      var y = m.t + ih - (value / max) * ih
      svg.push('<line x1="' + m.l + '" y1="' + y.toFixed(1) + '" x2="' + (W - m.r) + '" y2="' + y.toFixed(1) + '" class="td-grid"/>')
      svg.push('<text x="' + (m.l - 10) + '" y="' + (y + 4).toFixed(1) + '" class="td-axis" text-anchor="end">' + esc(fmtTokens(value)) + '</text>')
    }

    var band = count > 0 ? iw / count : iw
    var barPad = Math.min(10, band * 0.22)
    var barW = Math.max(2, band - barPad)
    var step = labelStep(count)

    // x labels
    for (var k = 0; k < count; k += 1) {
      if (k % step !== 0 && k !== count - 1) continue
      var cx = m.l + band * k + band / 2
      svg.push('<text x="' + cx.toFixed(1) + '" y="' + (m.t + ih + 24) + '" class="td-axis" text-anchor="middle">' + esc(buckets[k].label) + '</text>')
    }

    if (type === 'bar') {
      for (var bi = 0; bi < count; bi += 1) {
        var bucket = buckets[bi]
        var x = m.l + band * bi + (band - barW) / 2
        var cursor = m.t + ih
        var total = bucket.total || 0
        var title = bucket.label + '  ' + fmtTokens(total) + ' tokens'
        svg.push('<g class="td-col"><title>' + esc(title) + '</title>')
        for (var mi = 0; mi < models.length; mi += 1) {
          var model = models[mi]
          var mv = bucket.values[model.key] || 0
          if (mv <= 0) continue
          var h = (mv / max) * ih
          cursor -= h
          var pct = total > 0 ? Math.round((mv / total) * 100) : 0
          svg.push('<rect x="' + x.toFixed(1) + '" y="' + cursor.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2" fill="' + model.color + '" class="td-seg"><title>' + esc(model.label + ': ' + fmtTokens(mv) + ' (' + pct + '%)') + '</title></rect>')
        }
        svg.push('</g>')
      }
    } else {
      for (var li = 0; li < models.length; li += 1) {
        var lm = models[li]
        var points = []
        for (var pi = 0; pi < count; pi += 1) {
          var pv = buckets[pi].values[lm.key] || 0
          var px = m.l + band * pi + band / 2
          var py = m.t + ih - (pv / max) * ih
          points.push(px.toFixed(1) + ',' + py.toFixed(1))
        }
        svg.push('<polyline class="td-line" points="' + points.join(' ') + '" fill="none" stroke="' + lm.color + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>')
        for (var di = 0; di < count; di += 1) {
          var dv = buckets[di].values[lm.key] || 0
          if (dv <= 0) continue
          var dx = m.l + band * di + band / 2
          var dy = m.t + ih - (dv / max) * ih
          svg.push('<circle class="td-dot" cx="' + dx.toFixed(1) + '" cy="' + dy.toFixed(1) + '" r="2.6" fill="' + lm.color + '"><title>' + esc(lm.label + ' ' + buckets[di].label + ': ' + fmtTokens(dv)) + '</title></circle>')
        }
      }
    }

    // hover bands for a custom tooltip
    for (var hi = 0; hi < count; hi += 1) {
      svg.push('<rect class="td-band" data-i="' + hi + '" x="' + (m.l + band * hi).toFixed(1) + '" y="' + m.t + '" width="' + band.toFixed(1) + '" height="' + ih + '" fill="transparent"/>')
    }

    svg.push('</svg>')
    return svg.join('')
  }

  function polar(cx, cy, r, angle) {
    var rad = ((angle - 90) * Math.PI) / 180
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
  }

  /**
   * Donut chart with a centre label.
   * opts: { segments:[{label, value, color}], centerValue, centerLabel, size }
   */
  function donut(opts) {
    var segments = (opts.segments || []).filter(function (s) { return s.value > 0 })
    var size = opts.size || 220
    var cx = size / 2
    var cy = size / 2
    var r = size / 2 - 14
    var inner = r * 0.62
    var total = segments.reduce(function (acc, s) { return acc + s.value }, 0)
    var svg = []
    svg.push('<svg viewBox="0 0 ' + size + ' ' + size + '" class="td-donut" role="img">')
    if (total <= 0) {
      svg.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + ((r + inner) / 2) + '" fill="none" stroke="var(--td-border)" stroke-width="' + (r - inner) + '"/>')
    } else {
      var angle = 0
      for (var i = 0; i < segments.length; i += 1) {
        var seg = segments[i]
        var sweep = (seg.value / total) * 360
        var start = angle
        var end = angle + sweep
        angle = end
        if (sweep >= 359.999) {
          svg.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + ((r + inner) / 2) + '" fill="none" stroke="' + seg.color + '" stroke-width="' + (r - inner) + '"/>')
          continue
        }
        var p1 = polar(cx, cy, r, start)
        var p2 = polar(cx, cy, r, end)
        var p3 = polar(cx, cy, inner, end)
        var p4 = polar(cx, cy, inner, start)
        var large = sweep > 180 ? 1 : 0
        var d = 'M ' + p1.x.toFixed(2) + ' ' + p1.y.toFixed(2) +
          ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p2.x.toFixed(2) + ' ' + p2.y.toFixed(2) +
          ' L ' + p3.x.toFixed(2) + ' ' + p3.y.toFixed(2) +
          ' A ' + inner + ' ' + inner + ' 0 ' + large + ' 0 ' + p4.x.toFixed(2) + ' ' + p4.y.toFixed(2) + ' Z'
        var pct = Math.round((seg.value / total) * 100)
        svg.push('<path d="' + d + '" fill="' + seg.color + '" class="td-arc"><title>' + esc(seg.label + ': ' + fmtTokens(seg.value) + ' (' + pct + '%)') + '</title></path>')
      }
    }
    svg.push('<text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" class="td-donut-value">' + esc(opts.centerValue || '') + '</text>')
    svg.push('<text x="' + cx + '" y="' + (cy + 18) + '" text-anchor="middle" class="td-donut-label">' + esc(opts.centerLabel || '') + '</text>')
    svg.push('</svg>')
    return svg.join('')
  }

  /**
   * Horizontal ranked bars.
   * opts: { rows:[{label, sub, value, color}], format, width }
   */
  function hbar(opts) {
    var rows = opts.rows || []
    var format = opts.format || fmtTokens
    var W = opts.width || 460
    var rowH = 34
    var labelW = opts.labelW || 150
    var valueW = 74
    var H = Math.max(rowH, rows.length * rowH + 6)
    var max = 1
    for (var i = 0; i < rows.length; i += 1) if (rows[i].value > max) max = rows[i].value
    var trackW = W - labelW - valueW - 12
    var svg = []
    svg.push('<svg viewBox="0 0 ' + W + ' ' + H + '" class="td-hbar" role="img">')
    if (rows.length === 0) {
      svg.push('<text x="12" y="24" class="td-axis">No data</text>')
    }
    for (var r = 0; r < rows.length; r += 1) {
      var row = rows[r]
      var y = r * rowH + 8
      var w = Math.max(2, (row.value / max) * trackW)
      svg.push('<text x="0" y="' + (y + 12) + '" class="td-hbar-label">' + esc(row.label) + '</text>')
      svg.push('<rect x="' + labelW + '" y="' + (y + 1) + '" width="' + trackW + '" height="14" rx="7" fill="var(--td-track)"/>')
      svg.push('<rect x="' + labelW + '" y="' + (y + 1) + '" width="' + w.toFixed(1) + '" height="14" rx="7" fill="' + row.color + '"><title>' + esc(row.label + ': ' + format(row.value)) + '</title></rect>')
      svg.push('<text x="' + (W - 2) + '" y="' + (y + 12) + '" text-anchor="end" class="td-hbar-value">' + esc(format(row.value)) + '</text>')
    }
    svg.push('</svg>')
    return svg.join('')
  }

  /** Small area sparkline. opts: { values, color, width, height } */
  function sparkline(values, opts) {
    var options = opts || {}
    var data = values || []
    var W = options.width || 160
    var H = options.height || 40
    var color = options.color || 'var(--td-accent)'
    if (data.length === 0) return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="td-spark"></svg>'
    var max = Math.max.apply(null, data)
    var min = Math.min.apply(null, data)
    if (max === min) max = min + 1
    var step = data.length > 1 ? W / (data.length - 1) : W
    var pts = []
    for (var i = 0; i < data.length; i += 1) {
      var x = i * step
      var y = H - 4 - ((data[i] - min) / (max - min)) * (H - 8)
      pts.push(x.toFixed(1) + ',' + y.toFixed(1))
    }
    var line = pts.join(' ')
    var area = '0,' + H + ' ' + line + ' ' + W + ',' + H
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="td-spark" preserveAspectRatio="none">' +
      '<polygon points="' + area + '" fill="' + color + '" opacity="0.14"/>' +
      '<polyline points="' + line + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round"/></svg>'
  }

  window.TDCharts = {
    colorFor: colorFor,
    esc: esc,
    nf: nf,
    fmtInt: fmtInt,
    fmtTokens: fmtTokens,
    fmtCost: fmtCost,
    trend: trend,
    donut: donut,
    hbar: hbar,
    sparkline: sparkline
  }
})()
