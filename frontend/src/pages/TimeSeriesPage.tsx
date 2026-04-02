import { useEffect, useState, useRef, useCallback } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  Loader2,
  Calendar,
  Zap,
  Search,
  X,
  BarChart2,
  Info,
} from 'lucide-react'
import { narrativeLensApi, type TimeSeriesResponse } from '../services/api'
import InfoPanel from '../components/InfoPanel'
import HelpModal from '../components/HelpModal'

// ── colour helpers ────────────────────────────────────────────────────────────
const ACCENT = '#818cf8'
const ACCENT_SUBTLE = 'rgba(99,102,241,0.12)'
const HIGHLIGHT = '#34d399'
const PEAK_COLOR = '#fbbf24'

// ── Chart component (pure SVG) ────────────────────────────────────────────────
function LineChart({
  points,
  peakDate,
  width,
  height,
}: {
  points: { date: string; count: number }[]
  peakDate: string | null
  width: number
  height: number
}) {
  const PAD = { top: 20, right: 24, bottom: 40, left: 52 }
  const W = width - PAD.left - PAD.right
  const H = height - PAD.top - PAD.bottom

  if (!points.length) return null

  const maxCount = Math.max(...points.map(p => p.count))
  const minCount = 0

  const xScale = (i: number) => (i / Math.max(points.length - 1, 1)) * W
  const yScale = (v: number) => H - ((v - minCount) / Math.max(maxCount - minCount, 1)) * H

  // Build SVG path
  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(p.count).toFixed(1)}`)
    .join(' ')

  // Area fill
  const areaD = `${pathD} L${xScale(points.length - 1).toFixed(1)},${H} L0,${H} Z`

  // Y-axis ticks
  const yTicks = 5
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) =>
    Math.round((maxCount / yTicks) * i)
  )

  // X-axis: show every Nth date label
  const labelEvery = Math.max(1, Math.floor(points.length / 6))

  // Peak index
  const peakIdx = points.findIndex(p => p.date === peakDate)

  // Tooltip state
  const [hovered, setHovered] = useState<{ i: number; x: number; y: number } | null>(null)

  return (
    <svg
      width={width}
      height={height}
      style={{ overflow: 'visible', userSelect: 'none' }}
    >
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0.25" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0.01" />
        </linearGradient>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={ACCENT} />
          <stop offset="100%" stopColor={HIGHLIGHT} />
        </linearGradient>
      </defs>

      <g transform={`translate(${PAD.left},${PAD.top})`}>
        {/* Grid lines */}
        {yTickValues.map(val => (
          <g key={val}>
            <line
              x1={0} y1={yScale(val)} x2={W} y2={yScale(val)}
              stroke="rgba(255,255,255,0.05)" strokeWidth={1}
            />
            <text
              x={-8} y={yScale(val)} textAnchor="end"
              dominantBaseline="middle"
              style={{ fontSize: 10, fill: 'var(--color-text-muted)', fontFamily: 'inherit' }}
            >
              {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
            </text>
          </g>
        ))}

        {/* Area fill */}
        <path d={areaD} fill="url(#areaGrad)" />

        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke="url(#lineGrad)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Peak marker */}
        {peakIdx >= 0 && (
          <g>
            <line
              x1={xScale(peakIdx)} y1={0} x2={xScale(peakIdx)} y2={H}
              stroke={PEAK_COLOR} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7}
            />
            <circle
              cx={xScale(peakIdx)} cy={yScale(points[peakIdx].count)}
              r={5} fill={PEAK_COLOR} stroke="#1e1e2e" strokeWidth={2}
            />
          </g>
        )}

        {/* Hover overlay */}
        <rect
          x={0} y={0} width={W} height={H}
          fill="transparent"
          onMouseMove={e => {
            const rect = e.currentTarget.getBoundingClientRect()
            const relX = e.clientX - rect.left - PAD.left
            const frac = Math.max(0, Math.min(1, relX / W))
            const idx = Math.round(frac * (points.length - 1))
            setHovered({ i: idx, x: xScale(idx), y: yScale(points[idx].count) })
          }}
          onMouseLeave={() => setHovered(null)}
        />

        {/* Hover dot + tooltip */}
        {hovered && (
          <g>
            <circle cx={hovered.x} cy={hovered.y} r={4} fill={ACCENT} stroke="#1e1e2e" strokeWidth={2} />
            <g transform={`translate(${Math.min(hovered.x, W - 110)},${Math.max(hovered.y - 44, 0)})`}>
              <rect x={0} y={0} width={104} height={36} rx={6}
                fill="var(--color-bg-elevated)" stroke="var(--color-border)" strokeWidth={1}
              />
              <text x={8} y={14} style={{ fontSize: 10, fill: 'var(--color-text-muted)', fontFamily: 'inherit' }}>
                {points[hovered.i].date}
              </text>
              <text x={8} y={28} style={{ fontSize: 12, fill: 'var(--color-text-primary)', fontWeight: 600, fontFamily: 'inherit' }}>
                {points[hovered.i].count.toLocaleString()} posts
              </text>
            </g>
          </g>
        )}

        {/* X-axis labels */}
        {points.map((p, i) => {
          if (i % labelEvery !== 0 && i !== points.length - 1) return null
          return (
            <text
              key={p.date}
              x={xScale(i)} y={H + 16}
              textAnchor="middle"
              style={{ fontSize: 10, fill: 'var(--color-text-muted)', fontFamily: 'inherit' }}
            >
              {p.date.slice(5)} {/* MM-DD */}
            </text>
          )
        })}
      </g>
    </svg>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function TimeSeriesPage() {
  const [data, setData] = useState<TimeSeriesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [localQuery, setLocalQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = useState(800)

  // Responsive chart width
  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(entries => {
      setChartWidth(entries[0].contentRect.width)
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  const fetchData = useCallback(async (query: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await narrativeLensApi.getTimeSeries(query || undefined)
      setData(result)
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail?.message ??
        err?.response?.data?.detail ??
        'Failed to load time-series data. Is the backend running?'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData('') }, [fetchData])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setActiveQuery(localQuery.trim())
    fetchData(localQuery.trim())
  }

  const handleClear = () => {
    setLocalQuery('')
    setActiveQuery('')
    fetchData('')
  }

  // Trend direction
  const trend = (() => {
    if (!data || data.points.length < 6) return 'stable'
    const counts = data.points.map(p => p.count)
    const third = Math.floor(counts.length / 3)
    const firstAvg = counts.slice(0, third).reduce((a, b) => a + b, 0) / third
    const lastAvg = counts.slice(-third).reduce((a, b) => a + b, 0) / third
    if (lastAvg > firstAvg * 1.25) return 'rising'
    if (lastAvg < firstAvg * 0.75) return 'falling'
    return 'stable'
  })()

  const TrendIcon = trend === 'rising' ? TrendingUp : trend === 'falling' ? TrendingDown : Minus
  const trendColor = trend === 'rising' ? '#34d399' : trend === 'falling' ? '#f87171' : '#94a3b8'

  // Plain-English description
  const descriptionText = (() => {
    if (!data || !data.points.length) return null
    const first = data.points[0].date
    const last = data.points[data.points.length - 1].date
    const avgPerDay = Math.round(data.total_posts / Math.max(data.date_range_days, 1))
    const trendSentence =
      trend === 'rising'
        ? 'Activity is increasing — more posts are appearing toward the end of this period.'
        : trend === 'falling'
        ? 'Activity is declining — posting frequency dropped compared to the start of this period.'
        : 'Activity is relatively stable throughout this period with no clear rising or falling trend.'
    const querySentence = activeQuery
      ? `These results are filtered to posts semantically related to "${activeQuery}".`
      : 'This shows all posts in the dataset without any topic filter.'
    return (
      `The chart covers ${data.date_range_days} days from ${first} to ${last}, ` +
      `totalling ${data.total_posts.toLocaleString()} posts at an average of ${avgPerDay.toLocaleString()} posts per day. ` +
      `The busiest day was ${data.peak_date ?? 'unknown'} with ${data.peak_count.toLocaleString()} posts. ` +
      `${trendSentence} ${querySentence}`
    )
  })()

  return (
    <div>
      {/* Storytelling + Help */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div style={{ flex: 1 }}><InfoPanel tab="timeseries" /></div>
        <HelpModal tab="timeseries" />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>
            Time Series
          </h2>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Daily post volume over time · narrative activity trend
          </p>
        </div>
        <div
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
          style={{ background: ACCENT_SUBTLE, color: ACCENT, border: '1px solid rgba(99,102,241,0.2)' }}
        >
          <BarChart2 size={11} />
          Daily counts
        </div>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--color-text-muted)' }}
            />
            <input
              id="timeseries-search"
              type="text"
              placeholder="Filter by topic (e.g. 'conflict', 'economy')…"
              value={localQuery}
              onChange={e => setLocalQuery(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 rounded-lg text-sm outline-none transition-colors"
              style={{
                background: 'var(--color-bg-surface)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = ACCENT }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-border)' }}
            />
            {localQuery && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-3 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100"
              >
                <X size={13} style={{ color: 'var(--color-text-secondary)' }} />
              </button>
            )}
          </div>
          <button
            id="timeseries-search-btn"
            type="submit"
            className="px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{ background: ACCENT, color: '#fff' }}
          >
            Search
          </button>
        </div>
        {activeQuery && (
          <p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Showing results for: <span style={{ color: ACCENT }}>"{activeQuery}"</span>
          </p>
        )}
      </form>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center min-h-96 gap-4">
          <Loader2 size={28} className="animate-spin" style={{ color: ACCENT }} />
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Computing time series…
          </p>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center min-h-64 gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}
          >
            <AlertCircle size={20} style={{ color: '#f87171' }} />
          </div>
          <p className="text-sm text-center max-w-sm" style={{ color: 'var(--color-text-muted)' }}>
            {error}
          </p>
        </div>
      )}

      {/* Content */}
      {!loading && !error && data && (
        <div className="space-y-5">
          {/* Plain-language description */}
          {descriptionText && (
            <div
              className="flex gap-3 rounded-xl p-4"
              style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.18)' }}
            >
              <Info size={14} style={{ color: ACCENT, flexShrink: 0, marginTop: 2 }} />
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {descriptionText}
              </p>
            </div>
          )}

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            {/* Trend */}
            <div
              className="rounded-xl p-4"
              style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <TrendIcon size={14} style={{ color: trendColor }} />
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Trend</span>
              </div>
              <p className="text-lg font-bold capitalize" style={{ color: trendColor }}>{trend}</p>
            </div>

            {/* Peak */}
            <div
              className="rounded-xl p-4"
              style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Zap size={14} style={{ color: PEAK_COLOR }} />
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Peak Day</span>
              </div>
              <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {data.peak_date ?? '—'}
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {data.peak_count.toLocaleString()} posts
              </p>
            </div>

            {/* Total */}
            <div
              className="rounded-xl p-4"
              style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <BarChart2 size={14} style={{ color: ACCENT }} />
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Total Posts</span>
              </div>
              <p className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {data.total_posts.toLocaleString()}
              </p>
            </div>

            {/* Date span */}
            <div
              className="rounded-xl p-4"
              style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Calendar size={14} style={{ color: HIGHLIGHT }} />
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Date Span</span>
              </div>
              <p className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {data.date_range_days}
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>days</p>
            </div>
          </div>

          {/* AI Summary card */}
          <div
            className="rounded-xl p-4"
            style={{
              background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(16,185,129,0.06) 100%)',
              border: '1px solid rgba(99,102,241,0.2)',
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: ACCENT_SUBTLE, border: '1px solid rgba(99,102,241,0.3)' }}
              >
                <Zap size={13} style={{ color: ACCENT }} />
              </div>
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: ACCENT }}>
                  AI Insight
                </p>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  {data.summary}
                </p>
              </div>
            </div>
          </div>

          {/* Chart */}
          {data.points.length > 0 ? (
            <div
              ref={containerRef}
              className="rounded-xl p-5"
              style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }}
            >
              <p className="text-xs font-medium mb-4" style={{ color: 'var(--color-text-muted)' }}>
                Posts per Day
                {data.peak_date && (
                  <span style={{ color: PEAK_COLOR }}> · Peak: {data.peak_date}</span>
                )}
              </p>
              <LineChart
                points={data.points}
                peakDate={data.peak_date}
                width={Math.max(chartWidth - 40, 300)}
                height={260}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center py-16 rounded-xl"
              style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }}>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                No data points for this query.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
