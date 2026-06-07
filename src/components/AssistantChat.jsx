import React, { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'

/**
 * Conversational assistant panel — product-facing onboarding & help.
 */
export default function AssistantChat({
  welcomeMessage,
  placeholder = 'Type a message…',
  busy = false,
  disabled = false,
  messages = [],
  onSend,
  suggestions = [],
}) {
  const [draft, setDraft] = useState('')
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  const submit = () => {
    const text = draft.trim()
    if (!text || busy || disabled) return
    setDraft('')
    onSend(text)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const displayMessages =
    messages.length > 0
      ? messages
      : [{ id: 'welcome', role: 'assistant', content: welcomeMessage }]

  return (
    <div className="chat-shell">
      <div className="chat-thread" role="log" aria-live="polite">
        {displayMessages.map((m) => (
          <div key={m.id} className={`chat-bubble chat-bubble-${m.role}`}>
            {m.role === 'assistant' ? (
              <div className="chat-md">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
            ) : (
              <p className="chat-user-text">{m.content}</p>
            )}
          </div>
        ))}
        {busy ? (
          <div className="chat-bubble chat-bubble-assistant chat-typing">
            <span /><span /><span />
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {suggestions.length > 0 && messages.length <= 1 ? (
        <div className="chat-suggestions">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="chat-suggestion-chip"
              disabled={busy || disabled}
              onClick={() => onSend(s)}
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <div className="chat-composer">
        <textarea
          ref={inputRef}
          className="chat-input"
          rows={2}
          value={draft}
          disabled={busy || disabled}
          placeholder={disabled ? 'Connect to start chatting…' : placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="wa-btn wa-btn-primary chat-send"
          disabled={busy || disabled || !draft.trim()}
          onClick={submit}
        >
          Send
        </button>
      </div>
    </div>
  )
}
