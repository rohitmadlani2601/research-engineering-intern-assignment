import { useEffect, useRef, useState, useCallback } from 'react'
import { Braces, AlertCircle, Loader2, Info, X, ExternalLink, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { narrativeLensApi, type EmbeddingMapResponse, type EmbeddingPoint } from '../services/api'
import InfoPanel from '../components/InfoPanel'
import HelpModal from '../components/HelpModal'

// ── Cluster colour palette ─────────────────────────────────────────────────────
const CLUSTER_COLORS = [
  '#818cf8', '#34d399', '#fbbf24', '#f87171', '#60a5fa',
  '#c084fc', '#2dd4bf', '#fb923c', '#e879f9', '#38bdf8',
  '#a3e635', '#f43f5e',
]
function clusterColor(id: number) {
  if (id < 0) return 'rgba(255,255,255,0.25)'
  return CLUSTER_COLORS[id % CLUSTER_COLORS.length]
}

// ── Zoom limits ────────────────────────────────────────────────────────────────
const MIN_SCALE = 0.5
const MAX_SCALE = 8

// ── Scatter canvas ─────────────────────────────────────────────────────────────
function ScatterPlot({
  points,
  width,
  height,
  clusterLabels,
  onPointClick,
  selectedId,
}: {
  points: EmbeddingPoint[]
  width: number
  height: number
  clusterLabels: Map<number, string>
  onPointClick: (p: EmbeddingPoint) => void
  selectedId: string | null
}) {
  const [hovered, setHovered] = useState<EmbeddingPoint | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  // Zoom / pan state
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const isPanning = useRef(false)
  const lastPan = useRef({ x: 0, y: 0 })

  const PAD = 24

  // Scale x, y from [-1,1] to canvas space
  const sx = useCallback((v: number) =>
    pan.x + (PAD + ((v + 1) / 2) * (width - PAD * 2)) * scale,
    [pan.x, width, scale]
  )
  const sy = useCallback((v: number) =>
    pan.y + (PAD + (1 - (v + 1) / 2) * (height - PAD * 2)) * scale,
    [pan.y, height, scale]
  )

  function findNearest(mx: number, my: number): EmbeddingPoint | null {
    const threshold = (20 / scale) * (20 / scale)
    let best: EmbeddingPoint | null = null
    let bestDist = threshold
    for (const p of points) {
      const dx = sx(p.x) - mx
      const dy = sy(p.y) - my
      const d2 = dx * dx + dy * dy
      if (d2 < bestDist) { bestDist = d2; best = p }
    }
    return best
  }

  // Wheel zoom centred on cursor
  function handleWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const delta = e.deltaY > 0 ? 0.85 : 1.18
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * delta))
    // Keep the point under the cursor stationary
    setPan(prev => ({
      x: mx - (mx - prev.x) * (newScale / scale),
      y: my - (my - prev.y) * (newScale / scale),
    }))
    setScale(newScale)
  }

  // Pan via drag
  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (e.button !== 0) return
    isPanning.current = true
    lastPan.current = { x: e.clientX, y: e.clientY }
  }
  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (isPanning.current) {
      const dx = e.clientX - lastPan.current.x
      const dy = e.clientY - lastPan.current.y
      lastPan.current = { x: e.clientX, y: e.clientY }
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }))
      setHovered(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    setHovered(findNearest(mx, my))
    setTooltipPos({ x: mx, y: my })
  }
  function handleMouseUp() { isPanning.current = false }

  const resetView = () => { setScale(1); setPan({ x: 0, y: 0 }) }
  const zoomIn = () => setScale(s => Math.min(MAX_SCALE, s * 1.4))
  const zoomOut = () => setScale(s => Math.max(MIN_SCALE, s / 1.4))

  return (
    <div style={{ position: 'relative' }}>
      {/* Zoom controls */}
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[
          { icon: <ZoomIn size={12} />, action: zoomIn, title: 'Zoom in' },
          { icon: <ZoomOut size={12} />, action: zoomOut, title: 'Zoom out' },
          { icon: <RotateCcw size={12} />, action: resetView, title: 'Reset view' },
        ].map(({ icon, action, title }) => (
          <button key={title} title={title} onClick={action}
            style={{
              width: 26, height: 26, borderRadius: 6,
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-elevated)',
              color: 'var(--color-text-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >{icon}</button>
        ))}
      </div>

      <svg
        width={width}
        height={height}
        style={{ display: 'block', cursor: isPanning.current ? 'grabbing' : 'crosshair', userSelect: 'none' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setHovered(null); handleMouseUp() }}
        onClick={e => {
          if ((e.target as SVGElement).tagName === 'circle') return
          const rect = e.currentTarget.getBoundingClientRect()
          const mx = e.clientX - rect.left
          const my = e.clientY - rect.top
          const p = findNearest(mx, my)
          if (p) onPointClick(p)
        }}
      >
        {/* Grid circles */}
        {[0.25, 0.5, 0.75, 1.0].map(r => (
          <ellipse key={r}
            cx={pan.x + (width / 2) * scale}
            cy={pan.y + (height / 2) * scale}
            rx={(r * (width - PAD * 2)) / 2 * scale}
            ry={(r * (height - PAD * 2)) / 2 * scale}
            fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={1}
          />
        ))}

        {/* Points */}
        {points.map((p, i) => {
          const isHov = hovered?.post_id === p.post_id
          const isSel = selectedId === p.post_id
          const cx = sx(p.x)
          const cy = sy(p.y)
          // Cull points outside viewport for perf
          if (cx < -10 || cx > width + 10 || cy < -10 || cy > height + 10) return null
          return (
            <circle key={i}
              cx={cx} cy={cy}
              r={isSel ? 6 : isHov ? 5 : 2.5}
              fill={clusterColor(p.cluster_id)}
              opacity={isSel ? 1 : isHov ? 1 : 0.65}
              stroke={isSel ? '#fff' : isHov ? '#fff' : 'none'}
              strokeWidth={isSel ? 2 : 1}
              style={{ cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); onPointClick(p) }}
            />
          )
        })}
      </svg>

      {/* Tooltip */}
      {hovered && (
        <div style={{
          position: 'absolute',
          left: Math.min(tooltipPos.x + 12, width - 230),
          top: Math.max(tooltipPos.y - 80, 0),
          pointerEvents: 'none',
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          padding: '8px 12px',
          maxWidth: 220,
          zIndex: 20,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: clusterColor(hovered.cluster_id), marginBottom: 3 }}>
            {clusterLabels.get(hovered.cluster_id) ?? `Cluster ${hovered.cluster_id}`}
          </p>
          {hovered.title && (
            <p style={{ fontSize: 10.5, color: 'var(--color-text-primary)', marginBottom: 3, lineHeight: 1.4, fontWeight: 500 }}>
              {hovered.title.length > 80 ? hovered.title.slice(0, 78) + '…' : hovered.title}
            </p>
          )}
          {hovered.snippet && (
            <p style={{ fontSize: 9.5, color: 'var(--color-text-muted)', lineHeight: 1.45, marginBottom: 3 }}>
              {hovered.snippet.length > 90 ? hovered.snippet.slice(0, 88) + '…' : hovered.snippet}
            </p>
          )}
          <p style={{ fontSize: 9, color: 'var(--color-text-muted)', marginTop: 2 }}>
            Click to view · ({hovered.x.toFixed(2)}, {hovered.y.toFixed(2)})
          </p>
        </div>
      )}

      {/* Scale indicator */}
      {scale !== 1 && (
        <div style={{
          position: 'absolute', bottom: 8, right: 8,
          fontSize: 10, color: 'var(--color-text-muted)',
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border)',
          borderRadius: 5, padding: '1px 6px',
        }}>
          {Math.round(scale * 100)}%
        </div>
      )}
    </div>
  )
}

// ── Selected point detail panel ────────────────────────────────────────────────
function PointDetail({ point, label, onClose }: { point: EmbeddingPoint; label: string; onClose: () => void }) {
  const color = clusterColor(point.cluster_id)
  const redditUrl = `https://reddit.com/search/?q=${encodeURIComponent(point.title ?? point.post_id)}`

  return (
    <div style={{
      borderRadius: 12,
      padding: '0.875rem 1rem',
      background: `${color}0d`,
      border: `1px solid ${color}30`,
      position: 'relative',
    }}>
      <button onClick={onClose} style={{
        position: 'absolute', top: 10, right: 10,
        width: 22, height: 22, borderRadius: 6,
        border: '1px solid var(--color-border)',
        background: 'var(--color-bg-elevated)',
        color: 'var(--color-text-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
      }}><X size={11} /></button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
        <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color }}>{label}</span>
      </div>

      {point.title && (
        <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '0.3rem', lineHeight: 1.4 }}>
          {point.title}
        </p>
      )}
      {point.snippet && (
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.55, marginBottom: '0.5rem' }}>
          {point.snippet}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>
          ID: <code style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)' }}>{point.post_id}</code>
        </span>
        <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>
          ({point.x.toFixed(3)}, {point.y.toFixed(3)})
        </span>
        <a href={redditUrl} target="_blank" rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', gap: 3,
            fontSize: '0.68rem', color, textDecoration: 'none',
            marginLeft: 'auto',
          }}
        >
          <ExternalLink size={10} /> Search on Reddit
        </a>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function EmbeddingMapPage() {
  const [data, setData] = useState<EmbeddingMapResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedClusters, setSelectedClusters] = useState<Set<number>>(new Set())
  const [selectedPoint, setSelectedPoint] = useState<EmbeddingPoint | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 700, h: 480 })

  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(e => {
      const w = e[0].contentRect.width
      setDims({ w, h: Math.min(560, Math.max(380, w * 0.65)) })
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    narrativeLensApi.getEmbeddingMap()
      .then(d => { setData(d); setLoading(false) })
      .catch(err => {
        const msg = err?.response?.data?.detail?.message ?? 'Failed to load embedding map.'
        setError(msg)
        setLoading(false)
      })
  }, [])

  // Build cluster metadata
  const clusterLabels = new Map<number, string>()
  const clusterCounts = new Map<number, number>()
  if (data) {
    for (const p of data.points) {
      clusterLabels.set(p.cluster_id, p.label)
      clusterCounts.set(p.cluster_id, (clusterCounts.get(p.cluster_id) ?? 0) + 1)
    }
  }

  const sortedClusters = Array.from(clusterCounts.entries()).sort((a, b) => b[1] - a[1])

  const toggleCluster = (id: number) => {
    setSelectedPoint(null)
    setSelectedClusters(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const visPoints = data
    ? selectedClusters.size === 0
      ? data.points
      : data.points.filter(p => selectedClusters.has(p.cluster_id))
    : []

  const handlePointClick = (p: EmbeddingPoint) => setSelectedPoint(p)

  return (
    <div>
      {/* Storytelling + Help */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
        <div style={{ flex: 1 }}><InfoPanel tab="embeddings" /></div>
        <HelpModal tab="embeddings" />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>
            Embedding Map
          </h2>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            2D PCA projection of all post embeddings · each point = one post · scroll to zoom · drag to pan
          </p>
        </div>
        <div
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
          style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}
        >
          <Braces size={11} />
          PCA · 2D
        </div>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center min-h-96 gap-4">
          <Loader2 size={28} className="animate-spin" style={{ color: '#818cf8' }} />
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Projecting embeddings…</p>
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center justify-center min-h-64 gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <AlertCircle size={20} style={{ color: '#f87171' }} />
          </div>
          <p className="text-sm text-center max-w-sm" style={{ color: 'var(--color-text-muted)' }}>{error}</p>
        </div>
      )}

      {!loading && !error && data && (
        <div className="space-y-5">
          {/* Plain-language description */}
          <div
            className="flex gap-3 rounded-xl p-4"
            style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.18)' }}
          >
            <Info size={14} style={{ color: '#818cf8', flexShrink: 0, marginTop: 2 }} />
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              {selectedClusters.size > 0
                ? `Viewing ${visPoints.length.toLocaleString()} posts from ${selectedClusters.size} cluster${selectedClusters.size > 1 ? 's' : ''}: ` +
                  `${Array.from(selectedClusters).map(id => clusterLabels.get(id) ?? `Cluster ${id}`).join(', ')}. ` +
                  `Posts in the same cluster discuss similar topics. Click any dot to view post details, or clear the filter to see all.`
                : `Each dot represents one Reddit post projected into 2D via PCA. ` +
                  `Showing ${data.sampled_posts.toLocaleString()} of ${data.total_posts.toLocaleString()} posts. ` +
                  `Proximity = semantic similarity. Dots are coloured by topic cluster. ` +
                  `Explained variance: ${(data.explained_variance * 100).toFixed(1)}%. ` +
                  `Hover to preview · click to inspect · scroll to zoom · drag to pan.`
              }
            </p>
          </div>

          {/* Info bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
              style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
            >
              <Info size={12} />
              {data.sampled_posts.toLocaleString()} of {data.total_posts.toLocaleString()} posts shown
            </div>
            <div
              className="px-3 py-1.5 rounded-lg text-xs"
              style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
            >
              Explained variance: <span style={{ color: '#818cf8', fontWeight: 600 }}>
                {(data.explained_variance * 100).toFixed(1)}%
              </span>
            </div>
            {selectedClusters.size > 0 && (
              <button
                onClick={() => { setSelectedClusters(new Set()); setSelectedPoint(null) }}
                className="px-3 py-1.5 rounded-lg text-xs transition-colors"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', cursor: 'pointer' }}
              >
                Clear filter
              </button>
            )}
          </div>

          <div className="flex gap-5" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {/* Chart */}
            <div
              ref={containerRef}
              className="rounded-xl overflow-hidden flex-1"
              style={{ minWidth: 280, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }}
            >
              <ScatterPlot
                points={visPoints}
                width={dims.w}
                height={dims.h}
                clusterLabels={clusterLabels}
                onPointClick={handlePointClick}
                selectedId={selectedPoint?.post_id ?? null}
              />
            </div>

            {/* Cluster legend */}
            <div
              className="rounded-xl p-4 shrink-0"
              style={{
                width: 200,
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border)',
                maxHeight: dims.h + 8,
                overflowY: 'auto',
              }}
            >
              <p className="text-xs font-semibold mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                Clusters
              </p>
              {sortedClusters.map(([cid, count]) => {
                const label = clusterLabels.get(cid) ?? 'Unknown'
                const active = selectedClusters.size === 0 || selectedClusters.has(cid)
                return (
                  <button
                    key={cid}
                    id={`embedding-cluster-${cid}`}
                    onClick={() => toggleCluster(cid)}
                    className="w-full text-left flex items-center gap-2 py-1.5 px-2 rounded-lg mb-0.5 transition-all"
                    style={{
                      opacity: active ? 1 : 0.35,
                      background: selectedClusters.has(cid) ? 'rgba(99,102,241,0.1)' : 'transparent',
                      border: selectedClusters.has(cid) ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: clusterColor(cid), flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {label}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {count.toLocaleString()} pts
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Selected point detail */}
          {selectedPoint && (
            <PointDetail
              point={selectedPoint}
              label={clusterLabels.get(selectedPoint.cluster_id) ?? `Cluster ${selectedPoint.cluster_id}`}
              onClose={() => setSelectedPoint(null)}
            />
          )}
        </div>
      )}
    </div>
  )
}
