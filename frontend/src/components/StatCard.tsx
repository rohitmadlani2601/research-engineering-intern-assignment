interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  accent?: boolean
  highlight?: boolean
}

export default function StatCard({ label, value, sub, accent, highlight }: StatCardProps) {
  const accentColor = accent
    ? 'var(--color-accent)'
    : highlight
    ? 'var(--color-highlight)'
    : 'var(--color-text-primary)'

  return (
    <div
      className="rounded-lg p-4 flex flex-col gap-1 transition-colors"
      style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--color-border-hover)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--color-border)'
      }}
    >
      <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </p>
      <p className="text-2xl font-bold font-mono" style={{ color: accentColor }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {sub && (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {sub}
        </p>
      )}
    </div>
  )
}
