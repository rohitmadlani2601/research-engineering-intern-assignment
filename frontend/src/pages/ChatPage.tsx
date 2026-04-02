import { useEffect, useRef, useState } from 'react'
import { SendHorizonal, Bot, User, ExternalLink, Sparkles, AlertCircle, RotateCcw } from 'lucide-react'
import { narrativeLensApi, type ChatResponse, type ChatSource } from '../services/api'
import InfoPanel from '../components/InfoPanel'
import HelpModal from '../components/HelpModal'

// ── Types ─────────────────────────────────────────────────────────────────────

type MessageRole = 'user' | 'assistant'

interface Message {
  id: string
  role: MessageRole
  content: string
  sources?: ChatSource[]
  isError?: boolean
  warning?: string | null
  totalRetrieved?: number
  timestamp: Date
}

// ── Utility ───────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2)
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function similarityColor(s: number): string {
  if (s >= 0.80) return '#22c55e'   // green — very strong
  if (s >= 0.65) return 'var(--color-highlight)'
  if (s >= 0.50) return 'var(--color-accent)'
  return 'var(--color-text-muted)'
}

function similarityLabel(s: number): string {
  if (s >= 0.80) return 'Excellent'
  if (s >= 0.65) return 'Strong'
  if (s >= 0.50) return 'Good'
  return 'Weak'
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface SourceCardProps {
  source: ChatSource
  index: number
}

function SourceCard({ source, index }: SourceCardProps) {
  const href = source.url || `https://reddit.com${source.permalink}`
  const pct = Math.round(source.similarity * 100)
  const label = similarityLabel(source.similarity)
  const color = similarityColor(source.similarity)
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="chat-source-card"
      title={source.title}
    >
      <div className="chat-source-header">
        <span className="chat-source-index">{index + 1}</span>
        <span className="chat-source-subreddit">r/{source.subreddit}</span>
        <span className="chat-source-sim-badge" style={{ background: `${color}18`, color }}>
          {pct}% · {label}
        </span>
        <ExternalLink size={11} style={{ marginLeft: 'auto', opacity: 0.4, flexShrink: 0 }} />
      </div>
      <p className="chat-source-title">{source.title}</p>
      {source.text && (
        <p className="chat-source-text">{source.text}</p>
      )}
    </a>
  )
}

interface ChatBubbleProps {
  message: Message
}

function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === 'user'
  const isError = message.isError

  return (
    <div className={`chat-bubble-row ${isUser ? 'chat-bubble-row--user' : ''}`}>
      {/* Avatar */}
      <div className={`chat-avatar ${isUser ? 'chat-avatar--user' : 'chat-avatar--bot'}`}>
        {isUser
          ? <User size={14} />
          : <Bot size={14} />
        }
      </div>

      <div className="chat-bubble-content">
        {/* Message text */}
        <div
          className={`chat-bubble ${
            isUser
              ? 'chat-bubble--user'
              : isError
              ? 'chat-bubble--error'
              : 'chat-bubble--assistant'
          }`}
        >
          {isError && <AlertCircle size={14} style={{ marginRight: 6, flexShrink: 0, marginTop: 1 }} />}
          <span>{message.content}</span>
        </div>

        {/* Degraded warning */}
        {!isUser && message.warning && (
          <div className="chat-warning">
            <AlertCircle size={12} style={{ flexShrink: 0 }} />
            <span>{message.warning}</span>
          </div>
        )}

        {/* Sources */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <SourceList sources={message.sources} totalRetrieved={message.totalRetrieved} />
        )}

        {/* Timestamp */}
        <span className="chat-timestamp">{formatTime(message.timestamp)}</span>
      </div>
    </div>
  )
}

// ── Source list (collapsible) ─────────────────────────────────────────────────

interface SourceListProps {
  sources: ChatSource[]
  totalRetrieved?: number
}

function SourceList({ sources, totalRetrieved }: SourceListProps) {
  const INITIAL_SHOW = 3
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? sources : sources.slice(0, INITIAL_SHOW)
  const hasMore = sources.length > INITIAL_SHOW

  return (
    <div className="chat-sources">
      <div className="chat-sources-header">
        <span className="chat-sources-label">
          Sources
          <span className="chat-sources-count">
            {sources.length} post{sources.length !== 1 ? 's' : ''} · ≥50% match
          </span>
        </span>
        {totalRetrieved !== undefined && totalRetrieved > sources.length && (
          <span className="chat-sources-meta">
            {totalRetrieved} retrieved total
          </span>
        )}
      </div>
      <div className="chat-sources-grid">
        {visible.map((src, i) => (
          <SourceCard key={i} source={src} index={i} />
        ))}
      </div>
      {hasMore && (
        <button
          className="chat-sources-toggle"
          onClick={() => setExpanded(e => !e)}
        >
          {expanded
            ? `Show fewer`
            : `Show ${sources.length - INITIAL_SHOW} more source${sources.length - INITIAL_SHOW !== 1 ? 's' : ''}`
          }
        </button>
      )}
    </div>
  )
}

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="chat-bubble-row">
      <div className="chat-avatar chat-avatar--bot">
        <Bot size={14} />
      </div>
      <div className="chat-bubble chat-bubble--assistant chat-typing">
        <span className="chat-dot" />
        <span className="chat-dot" />
        <span className="chat-dot" />
      </div>
    </div>
  )
}

// ── Suggested prompts ─────────────────────────────────────────────────────────

const SUGGESTED_PROMPTS = [
  'What are the most discussed topics?',
  'Tell me about climate change posts',
  'What do people think about AI?',
  'Summarise the sentiment around politics',
]

// ── Main component ────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, loading])

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
  }

  const sendMessage = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    setInput('')
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }

    const userMsg: Message = {
      id: uid(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const resp: ChatResponse = await narrativeLensApi.chat(trimmed)
      const botMsg: Message = {
        id: uid(),
        role: 'assistant',
        content: resp.answer,
        sources: resp.sources,
        warning: resp.message,
        totalRetrieved: resp.total_retrieved,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, botMsg])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
      const errorMsg: Message = {
        id: uid(),
        role: 'assistant',
        content: `Failed to get a response: ${msg}`,
        isError: true,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const clearChat = () => {
    setMessages([])
    setInput('')
  }

  const isEmpty = messages.length === 0

  return (
    <div className="chat-root">
      {/* ── Styles ── */}
      <style>{CHAT_STYLES}</style>

      {/* ── Storytelling info panel ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
        <div style={{ flex: 1 }}><InfoPanel tab="chat" /></div>
        <HelpModal tab="chat" />
      </div>

      {/* ── Empty state / welcome ── */}
      {isEmpty && (
        <div className="chat-empty">
          <div className="chat-empty-icon">
            <Sparkles size={22} />
          </div>
          <h2 className="chat-empty-title">Semantic Chat</h2>
          <p className="chat-empty-subtitle">
            Ask anything about the dataset. I'll retrieve the most relevant posts
            and generate a concise, cited answer — no LLMs, pure local reasoning.
          </p>
          <div className="chat-suggestions">
            {SUGGESTED_PROMPTS.map(prompt => (
              <button
                key={prompt}
                className="chat-suggestion-btn"
                onClick={() => sendMessage(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Message list ── */}
      {!isEmpty && (
        <div className="chat-list" ref={listRef}>
          {messages.map(msg => (
            <ChatBubble key={msg.id} message={msg} />
          ))}
          {loading && <TypingIndicator />}
        </div>
      )}

      {/* ── Input bar ── */}
      <div className="chat-input-bar">
        {!isEmpty && (
          <button
            className="chat-clear-btn"
            onClick={clearChat}
            title="Clear conversation"
          >
            <RotateCcw size={14} />
          </button>
        )}

        <div className="chat-input-wrap">
          <textarea
            ref={inputRef}
            id="chat-input"
            className="chat-textarea"
            placeholder="Ask a question about the dataset…"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={loading}
            autoFocus
          />
          <button
            id="chat-send-btn"
            className={`chat-send-btn ${input.trim() && !loading ? 'chat-send-btn--active' : ''}`}
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            title="Send (Enter)"
          >
            <SendHorizonal size={16} />
          </button>
        </div>

        <p className="chat-hint">
          Press <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for newline
        </p>
      </div>
    </div>
  )
}

// ── Scoped styles ─────────────────────────────────────────────────────────────

const CHAT_STYLES = `
/* Root */
.chat-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: calc(100vh - 57px);
  max-width: 820px;
  margin: 0 auto;
  width: 100%;
}

/* Empty state */
.chat-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem 1rem;
}

.chat-empty-icon {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.25rem;
  background: var(--color-accent-subtle, rgba(99,102,241,0.1));
  color: var(--color-accent, #6366f1);
}

.chat-empty-title {
  font-size: 1.2rem;
  font-weight: 600;
  margin: 0 0 0.5rem;
  color: var(--color-text-primary);
}

.chat-empty-subtitle {
  font-size: 0.8rem;
  line-height: 1.6;
  max-width: 440px;
  margin: 0 0 1.75rem;
  color: var(--color-text-secondary);
}

/* Suggestion chips */
.chat-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
  max-width: 560px;
}

.chat-suggestion-btn {
  font-size: 0.75rem;
  padding: 0.45rem 0.85rem;
  border-radius: 20px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.18s ease;
  font-family: inherit;
}
.chat-suggestion-btn:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
  background: var(--color-accent-subtle);
  transform: translateY(-1px);
}

/* Message list */
.chat-list {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 0;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  scroll-behavior: smooth;
}
.chat-list::-webkit-scrollbar { width: 4px; }
.chat-list::-webkit-scrollbar-track { background: transparent; }
.chat-list::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 4px;
}

/* Bubble row */
.chat-bubble-row {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
}
.chat-bubble-row--user {
  flex-direction: row-reverse;
}

/* Avatar */
.chat-avatar {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
}
.chat-avatar--bot {
  background: var(--color-accent-subtle, rgba(99,102,241,0.1));
  color: var(--color-accent, #6366f1);
}
.chat-avatar--user {
  background: var(--color-bg-elevated);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}

/* Bubble content wrapper */
.chat-bubble-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: calc(100% - 46px);
}
.chat-bubble-row--user .chat-bubble-content {
  align-items: flex-end;
}

/* Bubble */
.chat-bubble {
  display: inline-flex;
  align-items: flex-start;
  font-size: 0.83rem;
  line-height: 1.65;
  padding: 0.65rem 0.9rem;
  border-radius: 14px;
  max-width: 620px;
  word-break: break-word;
}
.chat-bubble--assistant {
  background: var(--color-bg-elevated);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  border-top-left-radius: 4px;
}
.chat-bubble--user {
  background: var(--color-accent, #6366f1);
  color: #fff;
  border-top-right-radius: 4px;
}
.chat-bubble--error {
  background: rgba(239,68,68,0.08);
  color: var(--color-danger, #ef4444);
  border: 1px solid rgba(239,68,68,0.2);
}

/* Typing indicator */
.chat-typing {
  gap: 4px;
  padding: 0.7rem 1rem;
}
.chat-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-text-muted);
  display: inline-block;
  animation: chat-bounce 1.2s infinite ease-in-out;
}
.chat-dot:nth-child(2) { animation-delay: 0.2s; }
.chat-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes chat-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40%           { transform: translateY(-6px); opacity: 1; }
}

/* Timestamp */
.chat-timestamp {
  font-size: 0.68rem;
  color: var(--color-text-muted);
  padding: 0 0.2rem;
}

/* Warning banner */
.chat-warning {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  font-size: 0.71rem;
  line-height: 1.5;
  padding: 0.45rem 0.65rem;
  border-radius: 8px;
  background: rgba(234,179,8,0.08);
  color: #b45309;
  border: 1px solid rgba(234,179,8,0.2);
  max-width: 620px;
}

/* Sources section */
.chat-sources {
  width: 100%;
  max-width: 680px;
}
.chat-sources-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.45rem;
}
.chat-sources-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}
.chat-sources-count {
  font-size: 0.65rem;
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--color-accent-subtle);
  color: var(--color-accent);
}
.chat-sources-meta {
  font-size: 0.65rem;
  color: var(--color-text-muted);
}
.chat-sources-grid {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.chat-sources-toggle {
  margin-top: 0.4rem;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.3rem 0.75rem;
  font-size: 0.7rem;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-family: inherit;
  transition: all 0.18s;
  width: 100%;
}
.chat-sources-toggle:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
  background: var(--color-accent-subtle);
}

/* Source card */
.chat-source-card {
  display: block;
  padding: 0.6rem 0.75rem;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  text-decoration: none;
  transition: border-color 0.18s, background 0.18s, transform 0.15s;
  cursor: pointer;
}
.chat-source-card:hover {
  border-color: var(--color-accent);
  background: var(--color-accent-subtle);
  transform: translateX(2px);
}
.chat-source-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.25rem;
}
.chat-source-index {
  font-size: 0.65rem;
  font-weight: 700;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  background: var(--color-accent-subtle);
  color: var(--color-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.chat-source-subreddit {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}
.chat-source-sim-badge {
  font-size: 0.64rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 5px;
  letter-spacing: 0.02em;
  margin-left: auto;
  white-space: nowrap;
}
.chat-source-title {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-primary);
  margin: 0 0 0.25rem;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.chat-source-text {
  font-size: 0.71rem;
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Input bar */
.chat-input-bar {
  padding: 0.85rem 0 0;
  border-top: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  flex-shrink: 0;
}

.chat-clear-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: none;
  border: none;
  padding: 0.2rem 0.1rem;
  font-size: 0.7rem;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color 0.18s;
  font-family: inherit;
  align-self: flex-start;
}
.chat-clear-btn:hover {
  color: var(--color-text-secondary);
}

.chat-input-wrap {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 0.55rem 0.55rem 0.55rem 0.9rem;
  transition: border-color 0.18s;
}
.chat-input-wrap:focus-within {
  border-color: var(--color-accent);
}

.chat-textarea {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  resize: none;
  font-size: 0.82rem;
  line-height: 1.55;
  color: var(--color-text-primary);
  font-family: inherit;
  min-height: 22px;
  max-height: 140px;
  overflow-y: auto;
}
.chat-textarea::placeholder {
  color: var(--color-text-muted);
}
.chat-textarea:disabled {
  opacity: 0.6;
}

.chat-send-btn {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: none;
  background: var(--color-bg-surface);
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: not-allowed;
  flex-shrink: 0;
  transition: all 0.18s ease;
}
.chat-send-btn--active {
  background: var(--color-accent, #6366f1);
  color: #fff;
  cursor: pointer;
}
.chat-send-btn--active:hover {
  transform: scale(1.08);
  filter: brightness(1.1);
}
.chat-send-btn:disabled {
  opacity: 0.5;
}

.chat-hint {
  font-size: 0.67rem;
  color: var(--color-text-muted);
  margin: 0;
  padding: 0 0.1rem;
}
.chat-hint kbd {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 3px;
  padding: 1px 4px;
  font-family: inherit;
  font-size: 0.65rem;
  color: var(--color-text-secondary);
}
`
