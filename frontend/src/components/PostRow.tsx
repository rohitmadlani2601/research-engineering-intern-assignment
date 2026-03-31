import { formatDistanceToNow } from 'date-fns'
import { ExternalLink, ArrowUp, MessageSquare, Repeat2 } from 'lucide-react'
import type { RedditPost } from '../services/api'

interface PostRowProps {
  post: RedditPost
}

export default function PostRow({ post }: PostRowProps) {
  const relativeTime = formatDistanceToNow(new Date(post.created_utc), { addSuffix: true })

  return (
    <div
      className="rounded-lg p-4 transition-colors"
      style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--color-border-hover)'
        e.currentTarget.style.background = 'var(--color-bg-elevated)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--color-border)'
        e.currentTarget.style.background = 'var(--color-bg-surface)'
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <a
          href={`https://reddit.com${post.permalink}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium leading-snug hover:underline flex-1"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {post.title}
        </a>
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 opacity-40 hover:opacity-100 transition-opacity"
        >
          <ExternalLink size={13} style={{ color: 'var(--color-text-secondary)' }} />
        </a>
      </div>

      {/* Body preview */}
      {post.text && post.text.length > 10 && (
        <p
          className="text-xs mb-3 line-clamp-2 leading-relaxed"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {post.text}
        </p>
      )}

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <span
          className="px-2 py-0.5 rounded font-medium"
          style={{
            background: 'var(--color-accent-subtle)',
            color: 'var(--color-accent)',
          }}
        >
          r/{post.subreddit}
        </span>
        <span>u/{post.author}</span>
        <span>{relativeTime}</span>

        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-1">
            <ArrowUp size={11} style={{ color: 'var(--color-highlight)' }} />
            {post.score.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <MessageSquare size={11} />
            {post.num_comments.toLocaleString()}
          </span>
          {post.num_crossposts > 0 && (
            <span className="flex items-center gap-1">
              <Repeat2 size={11} />
              {post.num_crossposts}
            </span>
          )}
        </div>
      </div>

      {/* Hashtags */}
      {post.hashtags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {post.hashtags.slice(0, 5).map(tag => (
            <span
              key={tag}
              className="text-xs px-1.5 py-0.5 rounded"
              style={{
                background: 'var(--color-bg-overlay)',
                color: 'var(--color-text-muted)',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
