import { useEffect, useState, useCallback } from 'react'
import {
  Layers,
  ChevronRight,
  ArrowLeft,
  Tag,
  AlertCircle,
  Loader2,
  Hash,
  Users,
  BarChart3,
} from 'lucide-react'
import { narrativeLensApi, type ClusterSummary, type ClusterPostsResponse } from '../services/api'
import PostRow from '../components/PostRow'

// ── colour palette for cluster chips (cycles) ────────────────────────────────
const CHIP_COLORS = [
  { bg: 'rgba(99,102,241,0.12)',  border: 'rgba(99,102,241,0.30)',  text: '#818cf8' },
  { bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.28)',  text: '#34d399' },
  { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.28)',  text: '#fbbf24' },
  { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.28)',   text: '#f87171' },
  { bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.28)',  text: '#60a5fa' },
  { bg: 'rgba(168,85,247,0.10)', border: 'rgba(168,85,247,0.28)', text: '#c084fc' },
  { bg: 'rgba(20,184,166,0.10)', border: 'rgba(20,184,166,0.28)', text: '#2dd4bf' },
  { bg: 'rgba(249,115,22,0.10)', border: 'rgba(249,115,22,0.28)', text: '#fb923c' },
]

function chipColor(index: number) {
  return CHIP_COLORS[index % CHIP_COLORS.length]
}

// ── helpers ───────────────────────────────────────────────────────────────────
function pct(size: number, total: number) {
  if (!total) return 0
  return Math.round((size / total) * 100)
}

// ── sub-components ────────────────────────────────────────────────────────────

function ClusterCard({
  cluster,
  index,
  total,
  onClick,
}: {
  cluster: ClusterSummary
  index: number
  total: number
  onClick: () => void
}) {
  const color = chipColor(index)
  const share = pct(cluster.size, total)

  return (
    <button
      id={`cluster-card-${cluster.cluster_id}`}
      onClick={onClick}
      className="w-full text-left rounded-xl p-5 transition-all group"
      style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = color.text
        e.currentTarget.style.background = 'var(--color-bg-elevated)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--color-border)'
        e.currentTarget.style.background = 'var(--color-bg-surface)'
      }}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
            style={{ background: color.bg, color: color.text, border: `1px solid ${color.border}` }}
          >
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>
              {cluster.label}
            </p>
            {cluster.is_small && (
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Small cluster</span>
            )}
          </div>
        </div>
        <ChevronRight
          size={15}
          className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: color.text }}
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 mb-3">
        <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <Users size={11} />
          {cluster.size.toLocaleString()} posts
        </span>
        <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <BarChart3 size={11} />
          {share}% of dataset
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="w-full h-1 rounded-full mb-3 overflow-hidden"
        style={{ background: 'var(--color-bg-elevated)' }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${share}%`, background: color.text }}
        />
      </div>

      {/* Keywords */}
      <div className="flex flex-wrap gap-1.5">
        {cluster.top_keywords.slice(0, 5).map(kw => (
          <span
            key={kw}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
            style={{ background: color.bg, color: color.text, border: `1px solid ${color.border}` }}
          >
            <Hash size={9} />
            {kw}
          </span>
        ))}
      </div>
    </button>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

type PageState = 'list' | 'loading-posts' | 'posts' | 'error'

export default function TopicsPage() {
  const [state, setState] = useState<PageState>('list')
  const [clusters, setClusters] = useState<ClusterSummary[]>([])
  const [totalPosts, setTotalPosts] = useState(0)
  const [loadingClusters, setLoadingClusters] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [selectedCluster, setSelectedCluster] = useState<ClusterSummary | null>(null)
  const [clusterDetail, setClusterDetail] = useState<ClusterPostsResponse | null>(null)

  // Fetch cluster list once
  useEffect(() => {
    setLoadingClusters(true)
    narrativeLensApi
      .getClusters()
      .then(res => {
        setClusters(res.clusters)
        setTotalPosts(res.total_posts_clustered)
        setLoadingClusters(false)
      })
      .catch(err => {
        const msg =
          err?.response?.data?.detail?.message ??
          err?.response?.data?.detail ??
          'Failed to load topic clusters. Is the backend running?'
        setErrorMsg(msg)
        setState('error')
        setLoadingClusters(false)
      })
  }, [])

  const handleClusterClick = useCallback(
    async (cluster: ClusterSummary) => {
      setSelectedCluster(cluster)
      setState('loading-posts')
      try {
        const detail = await narrativeLensApi.getClusterPosts(cluster.cluster_id)
        setClusterDetail(detail)
        setState('posts')
      } catch (err: any) {
        const msg =
          err?.response?.data?.detail?.message ??
          err?.response?.data?.detail ??
          'Failed to load posts for this cluster.'
        setErrorMsg(msg)
        setState('error')
      }
    },
    []
  )

  const handleBack = () => {
    setState('list')
    setSelectedCluster(null)
    setClusterDetail(null)
    setErrorMsg(null)
  }

  // ── Cluster list view ──────────────────────────────────────────────────────
  if (loadingClusters) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-4">
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
        <div className="text-center">
          <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
            Building topic clusters…
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            This may take a moment on first load
          </p>
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          <AlertCircle size={20} style={{ color: '#f87171' }} />
        </div>
        <div className="text-center max-w-sm">
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
            Could not load clusters
          </p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            {errorMsg}
          </p>
        </div>
        {selectedCluster && (
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg transition-colors"
            style={{
              background: 'var(--color-bg-elevated)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
            }}
          >
            <ArrowLeft size={14} /> Back to clusters
          </button>
        )}
      </div>
    )
  }

  // ── Drill-down: posts inside a cluster ────────────────────────────────────
  if (state === 'loading-posts' || state === 'posts') {
    const color = selectedCluster ? chipColor(clusters.findIndex(c => c.cluster_id === selectedCluster.cluster_id)) : CHIP_COLORS[0]

    return (
      <div>
        {/* Back bar */}
        <div className="flex items-center gap-3 mb-6">
          <button
            id="topics-back-btn"
            onClick={handleBack}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: 'var(--color-bg-elevated)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-secondary)' }}
          >
            <ArrowLeft size={13} /> All Topics
          </button>
          <ChevronRight size={13} style={{ color: 'var(--color-text-muted)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {selectedCluster?.label}
          </span>
        </div>

        {/* Cluster header card */}
        {selectedCluster && (
          <div
            className="rounded-xl p-5 mb-6"
            style={{
              background: color.bg,
              border: `1px solid ${color.border}`,
            }}
          >
            <div className="flex items-start gap-4">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'var(--color-bg-surface)', border: `1px solid ${color.border}` }}
              >
                <Layers size={18} style={{ color: color.text }} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>
                  {selectedCluster.label}
                </h2>
                <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
                  {selectedCluster.size.toLocaleString()} posts · {pct(selectedCluster.size, totalPosts)}% of dataset
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedCluster.top_keywords.map(kw => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: 'var(--color-bg-surface)',
                        color: color.text,
                        border: `1px solid ${color.border}`,
                      }}
                    >
                      <Tag size={9} />
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Posts list */}
        {state === 'loading-posts' ? (
          <div className="flex items-center justify-center py-20 gap-3">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading posts…</span>
          </div>
        ) : (
          <div className="space-y-3">
            {clusterDetail && clusterDetail.posts.length === 0 && (
              <p className="text-sm text-center py-12" style={{ color: 'var(--color-text-muted)' }}>
                No posts found in this cluster.
              </p>
            )}
            {clusterDetail?.posts.map(post => (
              <PostRow key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Default: clusters grid ─────────────────────────────────────────────────
  return (
    <div>
      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>
            Topic Clusters
          </h2>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {clusters.length} clusters · {totalPosts.toLocaleString()} posts auto-grouped by semantic similarity
          </p>
        </div>
        <div
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
          style={{
            background: 'var(--color-accent-subtle)',
            color: 'var(--color-accent)',
            border: '1px solid rgba(99,102,241,0.2)',
          }}
        >
          <Layers size={11} />
          KMeans · TF-IDF
        </div>
      </div>

      {/* Cluster cards grid */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}
      >
        {clusters.map((cluster, idx) => (
          <ClusterCard
            key={cluster.cluster_id}
            cluster={cluster}
            index={idx}
            total={totalPosts}
            onClick={() => handleClusterClick(cluster)}
          />
        ))}
      </div>

      {clusters.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-64 gap-3">
          <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Clustering is still running — please wait a moment and refresh.
          </p>
        </div>
      )}
    </div>
  )
}
