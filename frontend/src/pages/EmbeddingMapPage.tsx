import { useEffect, useRef, useState } from 'react'
import { Braces, AlertCircle, Loader2, Info } from 'lucide-react'
import { narrativeLensApi, type EmbeddingMapResponse, type EmbeddingPoint } from '../services/api'

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

// ── Scatter canvas ─────────────────────────────────────────────────────────────
function ScatterPlot({
  points,
  width,
  height,
  clusterLabels,
}: {
  points: EmbeddingPoint[]
  width: number
  height: number
  clusterLabels: Map<number, string>
}) {
  const [hovered, setHovered] = useState<EmbeddingPoint | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  const PAD = 24

  // scale x, y from [-1,1] to canvas space
  const sx = (v: number) => PAD + ((v + 1) / 2) * (width - PAD * 2)
  const sy = (v: number) => PAD + (1 - (v + 1) / 2) * (height - PAD * 2)

  function findNearest(mx: number, my: number): EmbeddingPoint | null {
    let best: EmbeddingPoint | null = null
    let bestDist = 20 * 20 // 20px threshold
    for (const p of points) {
      const dx = sx(p.x) - mx
      const dy = sy(p.y) - my
      const d2 = dx * dx + dy * dy
      if (d2 < bestDist) { bestDist = d2; best = p }
    }
    return best
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg
        width={width}
        height={height}
        style={{ display: 'block', cursor: 'crosshair' }}
        onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect()
          const mx = e.clientX - rect.left
          const my = e.clientY - rect.top
          setHovered(findNearest(mx, my))
          setTooltipPos({ x: mx, y: my })
        }}
        onMouseLeave={() => setHovered(null)}
      >
        {/* Grid circles */}
        {[0.25, 0.5, 0.75, 1.0].map(r => (
          <ellipse key={r}
            cx={width / 2} cy={height / 2}
            rx={(r * (width - PAD * 2)) / 2}
            ry={(r * (height - PAD * 2)) / 2}
            fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={1}
          />
        ))}

        {/* Points */}
        {points.map((p, i) => (
          <circle key={i}
            cx={sx(p.x)} cy={sy(p.y)}
            r={hovered?.post_id === p.post_id ? 5 : 2.5}
            fill={clusterColor(p.cluster_id)}
            opacity={hovered?.post_id === p.post_id ? 1 : 0.65}
            stroke={hovered?.post_id === p.post_id ? '#fff' : 'none'}
            strokeWidth={1}
          />
        ))}
      </svg>

      {/* Tooltip */}
      {hovered && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(tooltipPos.x + 12, width - 180),
            top: Math.max(tooltipPos.y - 60, 0),
            pointerEvents: 'none',
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: '8px 12px',
            minWidth: 160,
          }}
        >
          <p style={{ fontSize: 11, fontWeight: 600, color: clusterColor(hovered.cluster_id), marginBottom: 2 }}>
            {hovered.label}
          </p>
          <p style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
            ID: {hovered.post_id}
          </p>
          <p style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
            ({hovered.x.toFixed(3)}, {hovered.y.toFixed(3)})
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function EmbeddingMapPage() {
  const [data, setData] = useState<EmbeddingMapResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedClusters, setSelectedClusters] = useState<Set<number>>(new Set())
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

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>
            Embedding Map
          </h2>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            2D PCA projection of all post embeddings · each point = one post
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
                ? `You are viewing ${visPoints.length.toLocaleString()} posts from ${selectedClusters.size} selected cluster${selectedClusters.size > 1 ? 's' : ''} — ` +
                  `${Array.from(selectedClusters).map(id => clusterLabels.get(id) ?? `Cluster ${id}`).join(', ')}. ` +
                  `Posts that belong to the same cluster tend to discuss similar topics. Click a cluster in the legend to toggle it, or clear the filter to see all posts.`
                : `Each dot on this map represents one Reddit post, projected into 2D space using PCA (Principal Component Analysis) applied to its semantic embedding. ` +
                  `Showing ${data.sampled_posts.toLocaleString()} of ${data.total_posts.toLocaleString()} total posts. ` +
                  `Dots that appear close together discuss semantically similar topics. Dots are colored by their assigned topic cluster. ` +
                  `The 2D layout preserves ${(data.explained_variance * 100).toFixed(1)}% of the original variance — higher means more faithful. ` +
                  `Hover over any dot to see the post ID and cluster. Click a cluster in the legend to filter.`
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
                onClick={() => setSelectedClusters(new Set())}
                className="px-3 py-1.5 rounded-lg text-xs transition-colors"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}
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
        </div>
      )}
    </div>
  )
}
