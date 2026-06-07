import React, { useCallback, useState } from 'react'
import AssistantChat from './AssistantChat.jsx'
import { sendAssistantMessage } from '../lib/jobApi.js'

let msgId = 0
const nextId = () => `m-${++msgId}`

const WELCOME =
  "Hello — welcome to **Job Hunter**.\n\nI'm here to help you get set up. Paste your resume (or tell me about your experience), and I'll build your profile. You can also ask how job matching, applications, or the apply assistant work."

const SUGGESTIONS = [
  'Paste my resume and set up my profile',
  'What roles should I target as a new grad?',
  'How does application tracking work?',
]

export default function HomeAssistant({ slug, apiOk, onNavigate, onProfileSaved }) {
  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const onSend = useCallback(
    async (text) => {
      const userMsg = { id: nextId(), role: 'user', content: text }
      const next = [...messages, userMsg]
      setMessages(next)
      setBusy(true)
      setErr('')
      try {
        const data = await sendAssistantMessage(
          slug,
          next.map(({ role, content }) => ({ role, content }))
        )
        setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', content: data.reply }])
        if (data.profile_saved) {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: 'assistant',
              content:
                'Your profile has been updated. **Start a new search** on Search runs — Alex and Morgan load your latest focus from the profile at the start of each run.',
            },
          ])
          onProfileSaved?.()
        }
      } catch (e) {
        setErr(e.message || String(e))
      } finally {
        setBusy(false)
      }
    },
    [slug, messages, onProfileSaved]
  )

  return (
    <div className="home-assistant">
      <header className="wa-hero wa-hero-compact">
        <h1 className="wa-hero-title">Find roles. Track everything. Apply faster.</h1>
        <p className="wa-hero-lead">
          Your AI assistant handles setup, matching, and application answers — start with a conversation.
        </p>
      </header>

      {err ? <p className="wa-alert">{err}</p> : null}

      <div className="chat-card">
        <AssistantChat
          welcomeMessage={WELCOME}
          placeholder="Paste your resume or ask a question…"
          messages={messages}
          busy={busy}
          disabled={apiOk === false}
          onSend={onSend}
          suggestions={SUGGESTIONS}
        />
      </div>

      <section className="wa-quick-links">
        <h2 className="wa-quick-links-title">Jump to</h2>
        <div className="wa-quick-links-grid">
          {[
            { id: 'jobs', label: 'Browse jobs', desc: 'Review and filter matched roles' },
            { id: 'search', label: 'Run search', desc: 'Scan job boards for new matches' },
            { id: 'applications', label: 'Applications', desc: 'Track saved → offer' },
            { id: 'profile', label: 'Edit profile', desc: 'Fine-tune preferences' },
          ].map((link) => (
            <button key={link.id} type="button" className="wa-quick-link" onClick={() => onNavigate(link.id)}>
              <strong>{link.label}</strong>
              <span>{link.desc}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
