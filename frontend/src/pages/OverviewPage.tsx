import { useEffect, useState, useCallback } from 'react'
import { narrativeLensApi, type PaginatedPosts, type RedditPost } from '../services/api'
import PostRow from '../components/PostRow'
import Pagination from '../components/Pagination'
import StatCard from '../components/StatCard'
import { Loader2, AlertCircle } from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { format, parseISO } from 'date-fns'

interface OverviewPageProps {
  query: string
  subreddit: string
  clusterCount: number
}

interface DailyCount {
  date: string
  posts: number
}

function buildTimeSeries(posts: RedditPost[]): DailyCount[] {
  const counts: Record<string, number> = {}
  posts.forEach(p => {
    const day = p.created_utc.slice(0, 10)
    counts[day] = (counts[day] ?? 0) + 1
  })
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, posts]) => ({ date, posts }))
}

const PAGE_SIZE = 10

export default function OverviewPage({ query, subreddit, clusterCount }: OverviewPageProps) {
  const [result, setResult] = useState<PaginatedPosts | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [allPosts, setAllPosts] = useState<RedditPost[]>([])

  const fetchPage = useCallback(async (p: number) => {
    setLoading(true)
    setError(null)
    try {
      if (query.trim()) {
        // Use semantic search for active queries
        const data = await narrativeLensApi.semanticSearch(query, 10000, 0.20)
        let items = data.results as RedditPost[]
        
        // Frontend filtering for subreddit if selected
        if (subreddit) {
          items = items.filter(post => post.subreddit.toLowerCase() === subreddit.toLowerCase())
        }
        
        // Semantic search doesn't do traditional pagination, just top-K
        // Wrap it back into PaginatedPosts format so UI doesn't break
        const total = items.length
        const totalPages = Math.ceil(total / PAGE_SIZE) || 1
        
        setResult({
          total: total,
          page: p,
          page_size: PAGE_SIZE,
          pages: totalPages,
          items: items.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE)
        })
      } else {
        // Fallback to normal listing/filtering
        const data = await narrativeLensApi.getPosts({
          page: p,
          page_size: PAGE_SIZE,
          subreddit: subreddit || undefined,
        })
        setResult(data)
      }
    } catch {
      setError('Failed to load posts. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }, [query, subreddit])

  const fetchAllForChart = useCallback(async () => {
    try {
      if (query.trim()) {
        const data = await narrativeLensApi.semanticSearch(query, 10000, 0.20)
        let items = data.results as RedditPost[]
        if (subreddit) {
          items = items.filter(post => post.subreddit.toLowerCase() === subreddit.toLowerCase())
        }
        setAllPosts(items)
      } else {
        const data = await narrativeLensApi.getPosts({
          page: 1,
          page_size: 100,
          subreddit: subreddit || undefined,
        })
        setAllPosts(data.items)
      }
    } catch {
      /* non-critical */
    }
  }, [query, subreddit])

  useEffect(() => {
    setPage(1)
    fetchPage(1)
    fetchAllForChart()
  }, [query, subreddit, fetchPage, fetchAllForChart])

  useEffect(() => {
    fetchPage(page)
  }, [page, fetchPage])

  const timeSeries = buildTimeSeries(allPosts)
  const totalScore = allPosts.reduce((s, p) => s + p.score, 0)
  const avgComments = allPosts.length
    ? Math.round(allPosts.reduce((s, p) => s + p.num_comments, 0) / allPosts.length)
    : 0

  return (
    <div className="flex flex-col gap-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total Posts"
          value={result?.total ?? 0}
          sub="matching current filters"
          accent
        />
        <StatCard
          label="Total Score"
          value={totalScore}
          sub="sum of upvotes (sample)"
          highlight
        />
        <StatCard
          label="Avg Comments"
          value={avgComments}
          sub="per post (sample)"
        />
        <StatCard
          label="Topic Clusters"
          value={clusterCount}
          sub="tunable via sidebar"
        />
      </div>

      {/* Time-series chart */}
      <section
        className="rounded-lg p-5"
        style={{
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
        }}
      >
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
          Post Volume Over Time
        </h2>
        {timeSeries.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={timeSeries} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="postGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#5E6778' }}
                tickFormatter={d => {
                  try { return format(parseISO(d), 'MMM d') } catch { return d }
                }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#5E6778' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--color-bg-elevated)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  fontSize: '11px',
                  color: 'var(--color-text-primary)',
                }}
                labelFormatter={d => {
                  try { return format(parseISO(d), 'MMM d, yyyy') } catch { return d }
                }}
              />
              <Area
                type="monotone"
                dataKey="posts"
                stroke="#3B82F6"
                strokeWidth={1.5}
                fill="url(#postGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div
            className="h-32 flex items-center justify-center rounded text-sm"
            style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg-elevated)' }}
          >
            No data available for current filters
          </div>
        )}
      </section>

      {/* Post list */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Search Results
          </h2>
          {loading && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-accent)' }} />}
        </div>

        {error ? (
          <div
            className="rounded-lg p-4 flex items-center gap-2 text-sm"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}
          >
            <AlertCircle size={14} />
            {error}
          </div>
        ) : result?.items.length === 0 ? (
          <div
            className="rounded-lg p-8 text-center text-sm"
            style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            No posts match your query.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {result?.items.map(post => (
                <PostRow key={post.id} post={post} />
              ))}
            </div>

            {result && (
              <Pagination
                page={result.page}
                pages={result.pages}
                total={result.total}
                pageSize={result.page_size}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </section>
    </div>
  )
}
