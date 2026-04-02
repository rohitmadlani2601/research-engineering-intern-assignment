/**
 * InfoPanel — tab-specific storytelling card
 *
 * Shows: What this shows · How it works · What to observe
 * Rendered at the top of every tab before main content.
 */

import { Lightbulb } from 'lucide-react'

export type TabKey = 'overview' | 'topics' | 'timeseries' | 'network' | 'embeddings' | 'chat'

interface PanelContent {
  what: string
  how: string
  observe: string
}

const CONTENT: Record<TabKey, PanelContent> = {
  overview: {
    what: 'A live feed of Reddit posts filtered by your search query or subreddit selection, with a post-volume trend chart showing when the conversation spiked.',
    how: 'Queries use semantic embedding similarity (not keywords) — so "conflict" also surfaces "war", "dispute", and "tension". The chart aggregates daily post counts across the matched corpus.',
    observe: 'Look for date spikes in the chart that might correlate with real-world events. Compare a broad query vs. a specific one to see how the dataset narrows.',
  },
  topics: {
    what: 'Automatically discovered discussion themes — groupings of posts that share semantic meaning, even if they use different words.',
    how: 'Post embeddings are clustered with KMeans. TF-IDF then extracts the most distinctive keywords per cluster to produce human-readable labels.',
    observe: 'Large clusters dominate the dataset. Small clusters are niche communities. Click any cluster to drill into its posts and see what exactly people are saying.',
  },
  timeseries: {
    what: 'Daily post volume plotted as a timeline, showing when community activity peaked or dipped. Supports optional topic filtering.',
    how: 'Without a query, all posts are counted per day. With a query, only semantically relevant posts are included — enabling topic-specific trend analysis.',
    observe: 'Sharp spikes often signal breaking news or viral discussions. The peak day marker (amber) shows the highest-activity date. Try filtering by a topic to see when that narrative was most active.',
  },
  network: {
    what: 'A graph of authors connected by shared posting behaviour. Nodes are authors; edges represent co-posting in the same discussions.',
    how: 'PageRank measures each author\'s influence in the network. The Louvain algorithm detects communities — groups of authors who interact more with each other than with outsiders.',
    observe: 'Large nodes are high-influence authors. Tightly connected cliques are discussion communities. Isolated nodes post independently. Click a node to inspect that author\'s details.',
  },
  embeddings: {
    what: 'Every post plotted as a dot in 2D space — posts that discuss similar topics appear close together, regardless of exact wording.',
    how: 'Each post is encoded into a 384-dimension semantic vector by the MiniLM language model. PCA reduces this to 2D while preserving cluster separation.',
    observe: 'Dense clusters of same-coloured dots = posts in the same topic group. Outlier dots discuss unique or cross-cutting topics. Hover a dot to see the post. Click a cluster in the legend to isolate it.',
  },
  chat: {
    what: 'A question-answering interface that searches the dataset for relevant posts and synthesises an extractive summary answer from their content.',
    how: 'Your question is encoded into a semantic embedding. The 30 most similar posts are retrieved (cosine similarity ≥ 50%), then the most informative, non-redundant sentences are selected via MMR to form the answer.',
    observe: 'Answers are grounded in real posts — each source card below shows the originating post with its match score. Try specific questions ("What do people say about X?") for targeted results.',
  },
}

interface InfoPanelProps {
  tab: TabKey
}

export default function InfoPanel({ tab }: InfoPanelProps) {
  const { what, how, observe } = CONTENT[tab]

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.75rem',
        padding: '0.875rem 1rem',
        borderRadius: '12px',
        background: 'rgba(99,102,241,0.05)',
        border: '1px solid rgba(99,102,241,0.15)',
        marginBottom: '1.25rem',
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: 'rgba(99,102,241,0.12)',
          border: '1px solid rgba(99,102,241,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 1,
          color: '#818cf8',
        }}
      >
        <Lightbulb size={13} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: 0 }}>
        <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <InfoRow label="What" text={what} />
          <InfoRow label="How" text={how} />
          <InfoRow label="Observe" text={observe} />
        </dl>
      </div>
    </div>
  )
}

function InfoRow({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
      <dt
        style={{
          fontSize: '0.65rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: '#818cf8',
          flexShrink: 0,
          minWidth: 48,
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          margin: 0,
          fontSize: '0.78rem',
          lineHeight: 1.55,
          color: 'var(--color-text-secondary)',
        }}
      >
        {text}
      </dd>
    </div>
  )
}
