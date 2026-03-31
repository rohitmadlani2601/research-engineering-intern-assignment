import { Construction } from 'lucide-react'

interface PlaceholderPageProps {
  title: string
  description: string
  phase?: string
}

export default function PlaceholderPage({ title, description, phase = 'Phase 2' }: PlaceholderPageProps) {
  return (
    <div className="flex-1 flex items-center justify-center min-h-96">
      <div className="text-center max-w-sm">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
          style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }}
        >
          <Construction size={20} style={{ color: 'var(--color-text-muted)' }} />
        </div>
        <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
          {title}
        </h2>
        <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--color-text-secondary)' }}>
          {description}
        </p>
        <span
          className="inline-block text-xs px-2.5 py-1 rounded-full font-medium"
          style={{
            background: 'var(--color-accent-subtle)',
            color: 'var(--color-accent)',
          }}
        >
          Planned for {phase}
        </span>
      </div>
    </div>
  )
}
