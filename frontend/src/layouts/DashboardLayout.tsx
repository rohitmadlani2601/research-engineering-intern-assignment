import { useEffect, useState } from 'react'
import Sidebar, { type NavItem } from '../components/Sidebar'
import OverviewPage from '../pages/OverviewPage'
import PlaceholderPage from '../pages/PlaceholderPage'
import TopicsPage from '../pages/TopicsPage'
import { narrativeLensApi, type HealthStatus } from '../services/api'
import { Activity } from 'lucide-react'

export default function DashboardLayout() {
  const [activeNav, setActiveNav] = useState<NavItem>('overview')
  const [query, setQuery] = useState('')
  const [subreddit, setSubreddit] = useState('')
  const [subreddits, setSubreddits] = useState<string[]>([])
  const [health, setHealth] = useState<HealthStatus | null>(null)

  useEffect(() => {
    narrativeLensApi.getHealth().then(setHealth).catch(() => null)
    narrativeLensApi.getSubreddits().then(setSubreddits).catch(() => null)
  }, [])

  const renderPage = () => {
    switch (activeNav) {
      case 'overview':
        return <OverviewPage query={query} subreddit={subreddit} />
      case 'network':
        return (
          <PlaceholderPage
            title="Network Graph"
            description="Visualize co-sharing networks between accounts and track influence propagation using PageRank and Louvain community detection."
          />
        )
      case 'topics':
        return <TopicsPage />
      case 'embeddings':
        return (
          <PlaceholderPage
            title="Embedding Visualization"
            description="Interactive 2D UMAP projection of post embeddings using Nomic Atlas or Datamapplot."
          />
        )
      case 'chat':
        return (
          <PlaceholderPage
            title="Semantic Chat"
            description="RAG-powered chatbot for querying the dataset with semantic search — zero keyword overlap required."
          />
        )
    }
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-bg-base)' }}>
      <Sidebar
        activeNav={activeNav}
        onNavChange={setActiveNav}
        query={query}
        onQueryChange={setQuery}
        subreddit={subreddit}
        onSubredditChange={setSubreddit}
        subreddits={subreddits}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header
          className="flex items-center justify-between px-6 py-3 shrink-0"
          style={{
            background: 'var(--color-bg-surface)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div>
            <h1 className="text-sm font-semibold capitalize" style={{ color: 'var(--color-text-primary)' }}>
              {activeNav}
            </h1>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {health
                ? `${health.total_posts?.toLocaleString() ?? '?'} posts loaded · ${health.environment}`
                : 'Connecting to backend…'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
              style={{
                background: health?.status === 'ok'
                  ? 'var(--color-highlight-subtle)'
                  : 'rgba(239,68,68,0.08)',
                color: health?.status === 'ok'
                  ? 'var(--color-highlight)'
                  : 'var(--color-danger)',
              }}
            >
              <Activity size={11} />
              {health?.status === 'ok' ? 'System Healthy' : 'Backend Offline'}
            </div>
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto p-6">
          {renderPage()}
        </main>
      </div>
    </div>
  )
}
