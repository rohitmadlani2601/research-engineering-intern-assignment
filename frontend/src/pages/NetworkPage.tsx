import { useEffect, useRef, useState } from 'react'
import { Network, AlertCircle, Loader2, Users, GitBranch, Award, TrendingUp, Info } from 'lucide-react'
import { narrativeLensApi, type NetworkResponse, type NetworkNode } from '../services/api'

// ── palette ───────────────────────────────────────────────────────────────────
const COMMUNITY_COLORS = [
  '#818cf8', '#34d399', '#fbbf24', '#f87171', '#60a5fa',
  '#c084fc', '#2dd4bf', '#fb923c', '#e879f9', '#38bdf8',
]
function communityColor(id: number) {
  return COMMUNITY_COLORS[id % COMMUNITY_COLORS.length]
}

// ── types ─────────────────────────────────────────────────────────────────────
interface SimNode {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  pagerank: number
  community: number
  post_count: number
}

// ── Static force layout (all computed synchronously, never animated) ──────────
function computeLayout(
  nodes: NetworkNode[],
  edges: { source: string; target: string; weight: number }[],
  width: number,
  height: number,
): SimNode[] {
  if (!nodes.length || !width || !height) return []

  const sim: SimNode[] = nodes.map(n => ({
    ...n,
    x: width / 2 + (Math.random() - 0.5) * width * 0.7,
    y: height / 2 + (Math.random() - 0.5) * height * 0.7,
    vx: 0, vy: 0,
  }))

  const nodeById = new Map(sim.map(n => [n.id, n]))
  const MAX_STEPS = 200
  const alpha0 = 0.3

  for (let step = 0; step < MAX_STEPS; step++) {
    const alpha = alpha0 * Math.pow(1 - step / MAX_STEPS, 1.5)

    // Repulsion (Barnes-Hut approximation skipped for simplicity)
    for (let i = 0; i < sim.length; i++) {
      for (let j = i + 1; j < sim.length; j++) {
        const a = sim[i], b = sim[j]
        const dx = b.x - a.x || 0.01
        const dy = b.y - a.y || 0.01
        const dist2 = dx * dx + dy * dy || 1
        const dist = Math.sqrt(dist2)
        const repulse = (1400 / dist2) * alpha
        a.vx -= (dx / dist) * repulse
        a.vy -= (dy / dist) * repulse
        b.vx += (dx / dist) * repulse
        b.vy += (dy / dist) * repulse
      }
    }

    // Edge attraction
    for (const edge of edges) {
      const a = nodeById.get(edge.source), b = nodeById.get(edge.target)
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const ideal = 90
      const force = ((dist - ideal) / dist) * 0.035 * alpha * (1 + Math.log1p(edge.weight) * 0.2)
      a.vx += dx * force
      a.vy += dy * force
      b.vx -= dx * force
      b.vy -= dy * force
    }

    // Gravity
    for (const n of sim) {
      n.vx += (width / 2 - n.x) * 0.012 * alpha
      n.vy += (height / 2 - n.y) * 0.012 * alpha
    }

    // Integrate + dampen
    for (const n of sim) {
      n.vx *= 0.82
      n.vy *= 0.82
      n.x = Math.max(24, Math.min(width - 24, n.x + n.vx))
      n.y = Math.max(24, Math.min(height - 24, n.y + n.vy))
    }
  }

  return sim
}

// ── Plain-English description generator ──────────────────────────────────────
function buildDescription(nodes: NetworkNode[], numCommunities: number, numEdges: number): string {
  if (!nodes.length) return ''
  const top = nodes[0]
  const topFive = nodes.slice(0, 5).map(n => n.id).join(', ')
  const avgPosts = Math.round(nodes.reduce((s, n) => s + n.post_count, 0) / nodes.length)

  const communityWord = numCommunities === 1 ? 'one tightly-knit community' : `${numCommunities} distinct communities`
  return (
    `This graph maps ${nodes.length.toLocaleString()} authors across ${communityWord}, ` +
    `connected by ${numEdges.toLocaleString()} co-posting interactions. ` +
    `The most influential author is ${top.id} (${top.post_count} posts), followed by ${topFive}. ` +
    `On average, each author contributed ${avgPosts} posts. ` +
    `Nodes are sized by PageRank — larger nodes have more influence over information flow in the network.`
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function NetworkPage() {
  const [data, setData] = useState<NetworkResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [layoutDone, setLayoutDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [simNodes, setSimNodes] = useState<SimNode[]>([])
  const [hovered, setHovered] = useState<SimNode | null>(null)
  const [selected, setSelected] = useState<SimNode | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 700, h: 480 })
  // Store edges and visNode refs for layout trigger
  const visNodesRef = useRef<NetworkNode[]>([])
  const visEdgesRef = useRef<{ source: string; target: string; weight: number }[]>([])

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(entries => {
      const w = Math.round(entries[0].contentRect.width)
      if (!w) return
      setDims({ w, h: Math.round(Math.min(520, Math.max(360, w * 0.55))) })
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  // Fetch data
  useEffect(() => {
    narrativeLensApi.getNetwork()
      .then(d => { setData(d); setLoading(false) })
      .catch(err => {
        setError(err?.response?.data?.detail?.message ?? err?.response?.data?.detail ?? 'Failed to load network data.')
        setLoading(false)
      })
  }, [])

  // Compute layout once data + dims are ready
  useEffect(() => {
    if (!data || !dims.w || !dims.h) return

    const TOP_NODES = 80
    const nodes = data.nodes.slice(0, TOP_NODES)
    const nodeIdSet = new Set(nodes.map(n => n.id))
    const edges = data.edges.filter(e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))

    visNodesRef.current = nodes
    visEdgesRef.current = edges
    setLayoutDone(false)

    // Defer to next tick so UI renders the "Computing layout…" state first
    const tid = setTimeout(() => {
      const result = computeLayout(nodes, edges, dims.w, dims.h)
      setSimNodes(result)
      setLayoutDone(true)
    }, 50)

    return () => clearTimeout(tid)
  }, [data, dims.w, dims.h])

  const nodeMap = new Map(simNodes.map(n => [n.id, n]))
  const maxPR = data?.nodes[0]?.pagerank ?? 1
  const nodeRadius = (pr: number) => 4 + (pr / maxPR) * 16

  const description = data ? buildDescription(data.nodes, data.num_communities, data.num_edges) : ''
  const visEdges = visEdgesRef.current

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>
            Author Network Graph
          </h2>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Who talks to whom · nodes sized by PageRank influence · colored by community cluster
          </p>
        </div>
        <div
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
          style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}
        >
          <Network size={11} />
          PageRank · Louvain
        </div>
      </div>

      {/* Loading data */}
      {loading && (
        <div className="flex flex-col items-center justify-center min-h-96 gap-4">
          <Loader2 size={28} className="animate-spin" style={{ color: '#818cf8' }} />
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading network data…</p>
        </div>
      )}

      {/* Error */}
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
              {description}
            </p>
          </div>

          {/* Stat row */}
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            {[
              { icon: <Users size={14} />, label: 'Total Authors', value: data.num_nodes.toLocaleString(), color: '#818cf8' },
              { icon: <GitBranch size={14} />, label: 'Interactions', value: data.num_edges.toLocaleString(), color: '#34d399' },
              { icon: <Network size={14} />, label: 'Communities', value: data.num_communities, color: '#fbbf24' },
              { icon: <TrendingUp size={14} />, label: 'Top Influencer', value: data.nodes[0]?.id ?? '—', color: '#f87171', small: true },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-4"
                style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span style={{ color: s.color }}>{s.icon}</span>
                  <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>{s.label}</span>
                </div>
                <p className={`font-bold truncate ${s.small ? 'text-sm' : 'text-lg'}`} style={{ color: 'var(--color-text-primary)' }}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          <div className="flex gap-5" style={{ flexWrap: 'wrap' }}>
            {/* Graph canvas */}
            <div
              ref={containerRef}
              className="rounded-xl overflow-hidden flex-1"
              style={{ minWidth: 280, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', position: 'relative' }}
            >
              {/* Computing spinner (shown while layout runs in background) */}
              {!layoutDone && (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 rounded-xl"
                  style={{ background: 'rgba(15,15,25,0.7)', backdropFilter: 'blur(4px)' }}
                >
                  <Loader2 size={24} className="animate-spin" style={{ color: '#818cf8' }} />
                  <p className="text-sm font-medium" style={{ color: '#818cf8' }}>Calculating layout…</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Running force-directed placement</p>
                </div>
              )}

              <svg
                width={dims.w}
                height={dims.h}
                style={{ display: 'block', cursor: layoutDone ? 'crosshair' : 'wait' }}
                onClick={() => setSelected(null)}
              >
                {/* Edges */}
                {layoutDone && visEdges.map((e, i) => {
                  const a = nodeMap.get(e.source), b = nodeMap.get(e.target)
                  if (!a || !b) return null
                  const isActive = selected?.id === e.source || selected?.id === e.target
                  return (
                    <line key={i}
                      x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke={isActive ? '#818cf8' : 'rgba(255,255,255,0.06)'}
                      strokeWidth={isActive ? Math.min(e.weight, 3) : 0.8}
                      opacity={isActive ? 0.9 : 0.45}
                    />
                  )
                })}

                {/* Nodes */}
                {layoutDone && simNodes.map(n => {
                  const r = nodeRadius(n.pagerank)
                  const color = communityColor(n.community)
                  const isSelected = selected?.id === n.id
                  const isHovered = hovered?.id === n.id
                  return (
                    <g key={n.id} style={{ cursor: 'pointer' }}
                      onClick={ev => { ev.stopPropagation(); setSelected(n) }}
                      onMouseEnter={() => setHovered(n)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      {(isSelected || isHovered) && (
                        <circle cx={n.x} cy={n.y} r={r + 6} fill={color} opacity={0.18} />
                      )}
                      <circle cx={n.x} cy={n.y} r={r}
                        fill={color}
                        stroke={isSelected ? '#fff' : 'rgba(0,0,0,0.35)'}
                        strokeWidth={isSelected ? 2 : 1}
                        opacity={0.9}
                      />
                    </g>
                  )
                })}

                {/* Hover tooltip */}
                {hovered && !selected && layoutDone && (
                  <g>
                    <rect
                      x={Math.min(hovered.x + 12, dims.w - 170)} y={Math.max(hovered.y - 46, 0)}
                      width={158} height={52} rx={7}
                      fill="var(--color-bg-elevated)" stroke="var(--color-border)" strokeWidth={1}
                    />
                    <text x={Math.min(hovered.x + 20, dims.w - 162)} y={hovered.y - 30}
                      style={{ fontSize: 11, fontWeight: 600, fill: 'var(--color-text-primary)', fontFamily: 'inherit' }}>
                      {hovered.id.length > 18 ? hovered.id.slice(0, 17) + '…' : hovered.id}
                    </text>
                    <text x={Math.min(hovered.x + 20, dims.w - 162)} y={hovered.y - 16}
                      style={{ fontSize: 10, fill: 'var(--color-text-muted)', fontFamily: 'inherit' }}>
                      {hovered.post_count} posts · Community {hovered.community}
                    </text>
                    <text x={Math.min(hovered.x + 20, dims.w - 162)} y={hovered.y - 4}
                      style={{ fontSize: 10, fill: '#818cf8', fontFamily: 'inherit' }}>
                      PageRank: {hovered.pagerank.toExponential(2)}
                    </text>
                  </g>
                )}
              </svg>

              {/* Community legend */}
              <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
                {Array.from(new Set(simNodes.map(n => n.community))).slice(0, 8).map(c => (
                  <div key={c} className="flex items-center gap-1">
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: communityColor(c) }} />
                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>Community {c}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top influencers sidebar */}
            <div className="rounded-xl p-4 shrink-0"
              style={{ width: 210, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', maxHeight: dims.h + 8, overflowY: 'auto' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Award size={13} style={{ color: '#fbbf24' }} />
                <p className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Top Influencers</p>
              </div>
              <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>Ranked by PageRank score</p>
              {data.nodes.slice(0, 20).map((n, i) => (
                <button
                  key={n.id}
                  id={`network-node-${n.id}`}
                  onClick={() => {
                    const sn = simNodes.find(s => s.id === n.id)
                    if (sn) setSelected(sn)
                  }}
                  className="w-full text-left flex items-center gap-2 py-1.5 px-2 rounded-lg transition-colors mb-0.5"
                  style={{
                    background: selected?.id === n.id ? 'rgba(99,102,241,0.1)' : 'transparent',
                    border: selected?.id === n.id ? '1px solid rgba(99,102,241,0.25)' : '1px solid transparent',
                  }}
                >
                  <span className="text-xs font-bold shrink-0 w-5 text-right"
                    style={{ color: i < 3 ? '#fbbf24' : 'var(--color-text-muted)' }}>
                    {i + 1}
                  </span>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: communityColor(n.community), flexShrink: 0 }} />
                  <span className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
                    {n.id}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Selected node detail */}
          {selected && (
            <div className="rounded-xl p-4"
              style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(16,185,129,0.06) 100%)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: communityColor(selected.community) }} />
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>u/{selected.id}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                      This author belongs to Community {selected.community} — a group of authors who frequently post about related topics.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  <span>Posts: <b style={{ color: 'var(--color-text-primary)' }}>{selected.post_count}</b></span>
                  <span>PageRank: <b style={{ color: 'var(--color-text-primary)' }}>{selected.pagerank.toExponential(3)}</b></span>
                  <span>Community: <b style={{ color: communityColor(selected.community) }}>{selected.community}</b></span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
