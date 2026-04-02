/**
 * HelpModal — tab-specific contextual help
 *
 * Renders a floating modal with sections:
 *   Overview · How it works · Why it matters · How to use
 *
 * Triggered by a "?" button rendered alongside the component.
 * Closes on Esc, backdrop click, or the × button.
 */

import { useEffect, useState } from 'react'
import { HelpCircle, X } from 'lucide-react'
import type { TabKey } from './InfoPanel'

interface HelpSection {
  overview: string
  howItWorks: string[]   // bullet points
  whyItMatters: string
  howToUse: string[]     // step-by-step bullets
}

const HELP: Record<TabKey, { title: string } & HelpSection> = {
  overview: {
    title: 'Overview — Post Explorer',
    overview:
      'The Overview tab is your starting point for exploring the dataset. It combines a search interface with a volume-over-time chart and a paginated post feed, giving you an immediate sense of what the dataset contains and how to navigate it.',
    howItWorks: [
      'Type any natural language query in the sidebar search box — e.g., "climate change", "AI regulation", or "economic anxiety".',
      'The system converts your query into a 384-dimension semantic embedding using the all-MiniLM-L6-v2 model.',
      'All posts are ranked by cosine similarity to your query — posts that are semantically close appear first, even if they don\'t share exact keywords.',
      'The chart shows a daily post count for the matched results, letting you see narrative volume over time.',
    ],
    whyItMatters:
      'Traditional keyword search misses synonyms, paraphrases, and cross-lingual variations. Semantic search captures meaning — so "conflict" also surfaces posts about "war", "tension", and "clashes" without you having to list every synonym.',
    howToUse: [
      'Use the sidebar search to filter posts semantically.',
      'Use the subreddit dropdown to narrow to a specific community.',
      'Observe the trend chart to identify when a topic peaked.',
      'Click any post row to expand its full content.',
    ],
  },

  topics: {
    title: 'Topics — Cluster Explorer',
    overview:
      'The Topics tab groups all posts into thematic clusters discovered automatically — no manual tagging required. Each cluster represents a distinct discussion thread identified by machine learning.',
    howItWorks: [
      'Each post is encoded into a semantic vector by the embedding model.',
      'KMeans clustering groups these vectors into K clusters, minimising within-cluster variance.',
      'TF-IDF extracts the most distinctive words in each cluster relative to the rest — these become the cluster keywords.',
      'Cluster sizes reflect how prominent each theme is in the dataset.',
    ],
    whyItMatters:
      'Clustering reveals the dominant narratives in a dataset without any prior knowledge. You can discover unexpected topics, find thematic overlap between communities, and understand which discussion threads are the most active.',
    howToUse: [
      'Scan the cluster grid to identify the major themes in the dataset.',
      'Click a cluster card to drill down into the posts it contains.',
      'Compare keyword badges across clusters to understand what distinguishes one theme from another.',
      'Small clusters (marked) are niche sub-communities — often the most focused discussions.',
    ],
  },

  timeseries: {
    title: 'Time Series — Narrative Activity',
    overview:
      'The Time Series tab visualises how posting activity changes day-by-day, revealing when a topic surged, faded, or remained stable. You can filter by topic to see topic-specific activity curves.',
    howItWorks: [
      'Without a query, all posts are aggregated by their UTC creation timestamp into daily buckets.',
      'With a query, only semantically relevant posts (retrieved by embedding similarity) are included in the daily counts.',
      'The trend direction (Rising / Stable / Falling) is computed by comparing the average activity in the first and last thirds of the time range.',
      'The amber peak marker highlights the single busiest day in the dataset.',
    ],
    whyItMatters:
      'Narrative analysis is inherently temporal. Knowing when a conversation exploded — and whether it sustained — is often as important as knowing what was said. Time series can reveal connections to real-world events.',
    howToUse: [
      'Start with no query to see overall dataset activity.',
      'Type a topic in the search bar and click Search to see topic-specific volume.',
      'Hover over the line chart to inspect individual day counts.',
      'Look for the amber peak spike — research what happened on that date.',
    ],
  },

  network: {
    title: 'Network — Author Influence Graph',
    overview:
      'The Network tab maps the social structure of the dataset as a force-directed graph. Authors are nodes; edges connect authors who participated in overlapping discussions.',
    howItWorks: [
      'PageRank (the same algorithm behind early Google) is applied to the author graph to score relative influence.',
      'The Louvain algorithm detects communities — groups of authors more densely connected to each other than to the rest of the network.',
      'A custom force-directed layout algorithm positions nodes so connected authors cluster together visually.',
      'Only the top 100 authors by PageRank are shown to reduce visual noise.',
    ],
    whyItMatters:
      'In social media analysis, understanding who drives narratives is as important as what those narratives say. High-PageRank authors act as amplifiers — their posts reach more of the network. Communities often correspond to ideological or topical subgroups.',
    howToUse: [
      'Hover any node to see the author\'s username, post count, and community assignment.',
      'Click a node to select it — its connections are highlighted in the graph and details appear below.',
      'Use the community filter to isolate a specific sub-network.',
      'The top influencers sidebar on the right ranks authors by PageRank — click to highlight them.',
    ],
  },

  embeddings: {
    title: 'Embeddings — Semantic Landscape',
    overview:
      'The Embedding Map plots the entire post corpus in 2D space. Each dot is a post. Proximity = semantic similarity. The map reveals the thematic shape of the dataset at a glance.',
    howItWorks: [
      'Each post is embedded into a 384-dimension dense vector by the MiniLM sentence transformer.',
      'Principal Component Analysis (PCA) projects this high-dimensional space down to 2 dimensions, preserving as much variance as possible.',
      'Points are coloured by their KMeans cluster assignment for easy topical identification.',
      'Up to 3,000 points are sampled for performance while maintaining the overall visual structure.',
    ],
    whyItMatters:
      'The embedding map makes the abstract structure of language tangible. You can visually confirm whether topic clusters are distinct or overlapping, spot outlier posts, and understand the topical diversity of the corpus.',
    howToUse: [
      'Hover over any dot to see the post title, cluster label, and coordinates.',
      'Click a dot to view the full post details in the panel below the chart.',
      'Click clusters in the legend to isolate specific topics — all other dots dim.',
      'Use the scroll wheel to zoom in on interesting regions.',
    ],
  },

  chat: {
    title: 'Chat — RAG-Powered Q&A',
    overview:
      'The Chat tab is a question-answering interface grounded entirely in the dataset. Ask anything in natural language and get a cited, extractive summary synthesised from the most relevant posts.',
    howItWorks: [
      'Your question is encoded into a semantic embedding.',
      'The top 30 posts with similarity ≥ 18% are retrieved. Only posts ≥ 50% similarity are surfaced as sources.',
      'Sentences are scored on four axes: query relevance (TF-IDF), informativeness (sentence length sweet-spot), source credibility (upvotes), and semantic weight (post similarity).',
      'MMR deduplication selects 3–5 maximally diverse, non-redundant sentences and assembles them into a coherent 2–5 sentence answer.',
    ],
    whyItMatters:
      'This is a local RAG (Retrieval-Augmented Generation) pipeline — no external API calls, no LLM, no hallucination risk. Every sentence in the answer comes directly from a real post you can click through and verify.',
    howToUse: [
      'Type a specific question like "What do people say about vaccine mandates?" or "How is inflation discussed?"',
      'Read the answer, then expand the source cards below to verify and explore the originating posts.',
      'The match percentage on each source shows how semantically close that post is to your question.',
      'Click a source card to open the original Reddit post in a new tab.',
    ],
  },
}

interface HelpModalProps {
  tab: TabKey
}

export default function HelpModal({ tab }: HelpModalProps) {
  const [open, setOpen] = useState(false)
  const help = HELP[tab]

  // Close on Esc
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        title="Help"
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          border: '1px solid var(--color-border)',
          background: 'var(--color-bg-elevated)',
          color: 'var(--color-text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.18s',
          flexShrink: 0,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = '#818cf8'
          e.currentTarget.style.color = '#818cf8'
          e.currentTarget.style.background = 'rgba(99,102,241,0.1)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'var(--color-border)'
          e.currentTarget.style.color = 'var(--color-text-muted)'
          e.currentTarget.style.background = 'var(--color-bg-elevated)'
        }}
      >
        <HelpCircle size={14} />
      </button>

      {/* Modal */}
      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'flex-end',
            padding: '1rem',
          }}
        >
          {/* Backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(3px)',
              animation: 'hm-fade-in 0.18s ease',
            }}
          />

          {/* Panel */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 460,
              maxHeight: 'calc(100vh - 2rem)',
              overflowY: 'auto',
              background: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 16,
              boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
              animation: 'hm-slide-in 0.22s ease',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1rem 1.25rem',
                borderBottom: '1px solid var(--color-border)',
                position: 'sticky',
                top: 0,
                background: 'var(--color-bg-surface)',
                zIndex: 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <HelpCircle size={15} style={{ color: '#818cf8' }} />
                <h2 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {help.title}
                </h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-elevated)',
                  color: 'var(--color-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={13} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <HelpSection title="Overview" content={help.overview} variant="text" />
              <HelpSection title="How it works" content={help.howItWorks} variant="bullets" />
              <HelpSection title="Why it matters" content={help.whyItMatters} variant="text" />
              <HelpSection title="How to use" content={help.howToUse} variant="bullets" numbered />
            </div>
          </div>

          {/* Animations */}
          <style>{`
            @keyframes hm-fade-in { from { opacity:0 } to { opacity:1 } }
            @keyframes hm-slide-in { from { opacity:0; transform:translateX(16px) } to { opacity:1; transform:none } }
          `}</style>
        </div>
      )}
    </>
  )
}

// ── Section sub-component ─────────────────────────────────────────────────────

function HelpSection({
  title,
  content,
  variant,
  numbered = false,
}: {
  title: string
  content: string | string[]
  variant: 'text' | 'bullets'
  numbered?: boolean
}) {
  return (
    <section>
      <h3
        style={{
          margin: '0 0 0.5rem',
          fontSize: '0.7rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: '#818cf8',
        }}
      >
        {title}
      </h3>

      {variant === 'text' ? (
        <p style={{ margin: 0, fontSize: '0.8rem', lineHeight: 1.65, color: 'var(--color-text-secondary)' }}>
          {content as string}
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {(content as string[]).map((item, i) => (
            <li key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <span
                style={{
                  flexShrink: 0,
                  width: 18,
                  height: 18,
                  borderRadius: numbered ? 5 : '50%',
                  background: 'rgba(99,102,241,0.12)',
                  color: '#818cf8',
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 1,
                }}
              >
                {numbered ? i + 1 : '·'}
              </span>
              <span style={{ fontSize: '0.78rem', lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
                {item}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
