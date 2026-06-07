import React, { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { generateAnswers } from '../lib/jobApi.js'

export default function ApplyAssistantTab({ slug, applyContext, onClearContext }) {
  const [jobTitle, setJobTitle] = useState('')
  const [company, setCompany] = useState('')
  const [url, setUrl] = useState('')
  const [questions, setQuestions] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!applyContext) return
    setJobTitle(applyContext.title || '')
    setCompany(applyContext.company || '')
    setUrl(applyContext.url || '')
    setMarkdown('')
  }, [applyContext])

  const onGenerate = async () => {
    if (!questions.trim()) return
    setBusy(true)
    setErr('')
    try {
      const data = await generateAnswers(slug, {
        job_title: jobTitle,
        company,
        extra_context: url ? `Application URL: ${url}` : '',
        questions,
      })
      setMarkdown(data.markdown || '')
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {applyContext ? (
        <p className="wa-success-msg" style={{ marginTop: 0 }}>
          Answering for <strong>{applyContext.title}</strong> at {applyContext.company || '—'}.
          {onClearContext ? (
            <>
              {' '}
              <button type="button" className="wa-inline-link" onClick={onClearContext}>
                Clear
              </button>
            </>
          ) : null}
        </p>
      ) : (
        <p className="wa-muted" style={{ marginTop: 0, marginBottom: 16 }}>
          Open the application in your browser, then paste each question here for tailored answers from your profile.
        </p>
      )}
      <div className="wa-form-grid">
        <div>
          <label className="wa-label">Job title</label>
          <input className="wa-field wa-input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </div>
        <div>
          <label className="wa-label">Company</label>
          <input className="wa-field wa-input" value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
      </div>
      <label className="wa-label" style={{ marginTop: 12 }}>Application URL</label>
      <input className="wa-field wa-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="wa-btn wa-btn-secondary" style={{ marginTop: 10, display: 'inline-block', textDecoration: 'none' }}>
          Open application ↗
        </a>
      ) : null}
      <label className="wa-label" style={{ marginTop: 16 }}>Questions from the form</label>
      <textarea
        className="wa-field"
        rows={8}
        value={questions}
        onChange={(e) => setQuestions(e.target.value)}
        placeholder="Paste each application question here (one per line or numbered)…"
      />
      <button type="button" className="wa-btn wa-btn-primary" style={{ marginTop: 14 }} disabled={busy || !questions.trim()} onClick={onGenerate}>
        Generate answers
      </button>
      {err ? <p className="wa-alert" style={{ marginTop: 14 }}>{err}</p> : null}
      {markdown ? (
        <div className="wa-panel" style={{ marginTop: 20 }}>
          <h3 className="wa-panel-title">Suggested answers</h3>
          <div className="wa-md">
            <ReactMarkdown>{markdown}</ReactMarkdown>
          </div>
        </div>
      ) : null}
    </div>
  )
}
