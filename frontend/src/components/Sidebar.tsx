import { useState } from 'react'
import {
  Search,
  LayoutDashboard,
  Network,
  MessageCircle,
  Layers,
  Braces,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react'

export type NavItem = 'overview' | 'network' | 'topics' | 'embeddings' | 'chat'

interface SidebarProps {
  activeNav: NavItem
  onNavChange: (nav: NavItem) => void
  query: string
  onQueryChange: (q: string) => void
  subreddit: string
  onSubredditChange: (s: string) => void
  clusterCount: number
  onClusterCountChange: (n: number) => void
  subreddits: string[]
}

const NAV_ITEMS: { id: NavItem; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={15} /> },
  { id: 'network', label: 'Network', icon: <Network size={15} /> },
  { id: 'topics', label: 'Topics', icon: <Layers size={15} /> },
  { id: 'embeddings', label: 'Embeddings', icon: <Braces size={15} /> },
  { id: 'chat', label: 'Chat', icon: <MessageCircle size={15} /> },
]

export default function Sidebar({
  activeNav,
  onNavChange,
  query,
  onQueryChange,
  subreddit,
  onSubredditChange,
  clusterCount,
  onClusterCountChange,
  subreddits,
}: SidebarProps) {
  const [filtersOpen, setFiltersOpen] = useState(true)

  return (
    <aside
      className="flex flex-col h-screen border-r shrink-0 overflow-hidden"
      style={{
        width: 'var(--sidebar-width)',
        background: 'var(--color-bg-surface)',
        borderColor: 'var(--color-border)',
      }}
    >
      {/* Brand */}
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold"
            style={{ background: 'var(--color-accent)', color: '#fff' }}
          >
            NL
          </div>
          <span className="font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            NarrativeLens
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="relative">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--color-text-muted)' }}
          />
          <input
            id="sidebar-search"
            type="text"
            placeholder="Search narratives…"
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            className="w-full pl-8 pr-8 py-2 rounded text-sm outline-none transition-colors"
            style={{
              background: 'var(--color-bg-elevated)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border)',
            }}
            onFocus={e => {
              e.currentTarget.style.borderColor = 'var(--color-accent)'
            }}
            onBlur={e => {
              e.currentTarget.style.borderColor = 'var(--color-border)'
            }}
          />
          {query && (
            <button
              onClick={() => onQueryChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100"
            >
              <X size={12} style={{ color: 'var(--color-text-secondary)' }} />
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="px-3 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <p className="text-xs mb-2 px-2 uppercase tracking-widest font-medium" style={{ color: 'var(--color-text-muted)' }}>
          Views
        </p>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            id={`nav-${item.id}`}
            onClick={() => onNavChange(item.id)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-all mb-0.5 text-left"
            style={{
              background: activeNav === item.id ? 'var(--color-accent-subtle)' : 'transparent',
              color: activeNav === item.id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              fontWeight: activeNav === item.id ? 500 : 400,
            }}
            onMouseEnter={e => {
              if (activeNav !== item.id) {
                e.currentTarget.style.background = 'var(--color-bg-elevated)'
                e.currentTarget.style.color = 'var(--color-text-primary)'
              }
            }}
            onMouseLeave={e => {
              if (activeNav !== item.id) {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--color-text-secondary)'
              }
            }}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      {/* Filters */}
      <div className="px-3 py-3 flex-1 overflow-y-auto">
        <button
          onClick={() => setFiltersOpen(o => !o)}
          className="w-full flex items-center justify-between px-2 py-1 mb-2 text-xs uppercase tracking-widest font-medium rounded transition-opacity hover:opacity-80"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal size={11} />
            Filters
          </div>
          {filtersOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>

        {filtersOpen && (
          <div className="space-y-4 px-1">
            {/* Subreddit filter */}
            <div>
              <label
                htmlFor="filter-subreddit"
                className="block text-xs mb-1.5 font-medium"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Subreddit
              </label>
              <select
                id="filter-subreddit"
                value={subreddit}
                onChange={e => onSubredditChange(e.target.value)}
                className="w-full px-3 py-2 rounded text-sm outline-none"
                style={{
                  background: 'var(--color-bg-elevated)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <option value="">All subreddits</option>
                {subreddits.map(sr => (
                  <option key={sr} value={sr}>
                    r/{sr}
                  </option>
                ))}
              </select>
            </div>

            {/* Cluster slider */}
            <div>
              <label
                htmlFor="filter-clusters"
                className="block text-xs mb-1.5 font-medium"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Topic Clusters
                <span
                  className="ml-auto float-right font-mono"
                  style={{ color: 'var(--color-accent)' }}
                >
                  {clusterCount}
                </span>
              </label>
              <input
                id="filter-clusters"
                type="range"
                min={2}
                max={20}
                value={clusterCount}
                onChange={e => onClusterCountChange(Number(e.target.value))}
                className="w-full h-1 rounded appearance-none cursor-pointer"
                style={{ accentColor: 'var(--color-accent)' }}
              />
              <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                <span>2</span>
                <span>20</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3" style={{ borderTop: '1px solid var(--color-border)' }}>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Phase 1 · v1.0.0
        </p>
      </div>
    </aside>
  )
}
