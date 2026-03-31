import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  page: number
  pages: number
  total: number
  pageSize: number
  onPageChange: (p: number) => void
}

export default function Pagination({ page, pages, total, pageSize, onPageChange }: PaginationProps) {
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  if (pages <= 1) return null

  return (
    <div className="flex items-center justify-between py-3 px-1">
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {start}–{end} of {total.toLocaleString()} posts
      </p>

      <div className="flex items-center gap-1">
        <button
          id="pagination-prev"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="p-1.5 rounded transition-opacity disabled:opacity-30"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseEnter={e => { if (page > 1) e.currentTarget.style.background = 'var(--color-bg-elevated)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          <ChevronLeft size={15} />
        </button>

        {Array.from({ length: Math.min(5, pages) }, (_, i) => {
          let p: number
          if (pages <= 5) {
            p = i + 1
          } else if (page <= 3) {
            p = i + 1
          } else if (page >= pages - 2) {
            p = pages - 4 + i
          } else {
            p = page - 2 + i
          }
          return (
            <button
              key={p}
              id={`pagination-page-${p}`}
              onClick={() => onPageChange(p)}
              className="w-7 h-7 rounded text-xs font-medium transition-colors"
              style={{
                background: page === p ? 'var(--color-accent)' : 'transparent',
                color: page === p ? '#fff' : 'var(--color-text-secondary)',
              }}
              onMouseEnter={e => {
                if (page !== p) e.currentTarget.style.background = 'var(--color-bg-elevated)'
              }}
              onMouseLeave={e => {
                if (page !== p) e.currentTarget.style.background = 'transparent'
              }}
            >
              {p}
            </button>
          )
        })}

        <button
          id="pagination-next"
          onClick={() => onPageChange(page + 1)}
          disabled={page === pages}
          className="p-1.5 rounded transition-opacity disabled:opacity-30"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseEnter={e => { if (page < pages) e.currentTarget.style.background = 'var(--color-bg-elevated)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  )
}
