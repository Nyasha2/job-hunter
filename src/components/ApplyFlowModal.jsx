import React, { useCallback, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { generateAnswers, startApply, updateApplication } from '../lib/jobApi.js'

function copyText(text) {
  if (!text) return Promise.reject(new Error('Nothing to copy'))
  return navigator.clipboard?.writeText(text) ?? Promise.reject(new Error('Clipboard unavailable'))
}

export default function ApplyFlowModal({ slug, job, onClose, onComplete }) {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [application, setApplication] = useState(null)
  const [platform, setPlatform] = useState('')
  const [canAutofill, setCanAutofill] = useState(false)
  const [autofillFields, setAutofillFields] = useState([])
  const [extractError, setExtractError] = useState('')
  const [questions, setQuestions] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [generating, setGenerating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState('')

  const init = useCallback(async () => {
    if (!job) return
    setLoading(true)
    setErr('')
    setMarkdown('')
    setQuestions('')
    setApplication(null)

    if (job.url) {
      window.open(job.url, '_blank', 'noopener,noreferrer')
    }

    try {
      const data = await startApply(slug, {
        job_id: job.id,
        title: job.title,
        company: job.company,
        url: job.url,
      })
      setApplication(data.application)
      setPlatform(data.platform || '')
      setCanAutofill(Boolean(data.can_autofill))
      setAutofillFields(data.autofill_fields || [])
      setExtractError(data.extract_error || '')
      const extracted = (data.extracted_questions || []).join('\n\n')
      if (extracted) setQuestions(extracted)
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [slug, job])

  useEffect(() => {
    init()
  }, [init])

  if (!job) return null

  const onGenerate = async () => {
    if (!questions.trim()) return
    setGenerating(true)
    setErr('')
    try {
      const data = await generateAnswers(slug, {
        job_title: job.title,
        company: job.company,
        extra_context: job.url ? `Application URL: ${job.url}` : '',
        questions,
      })
      const md = data.markdown || ''
      setMarkdown(md)
      if (application?.id) {
        const updated = await updateApplication(slug, application.id, {
          answers: {
            questions: questions.trim(),
            markdown: md,
            generated_at: new Date().toISOString(),
          },
        })
        setApplication(updated.application)
      }
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setGenerating(false)
    }
  }

  const onMarkSubmitted = async () => {
    if (!application?.id) {
      onComplete?.(job)
      onClose?.()
      return
    }
    setSubmitting(true)
    setErr('')
    try {
      await updateApplication(slug, application.id, { status: 'applied' })
      onComplete?.(job)
      onClose?.()
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const onCopyField = async (value, label) => {
    try {
      await copyText(value)
      setCopied(label)
      setTimeout(() => setCopied(''), 1500)
    } catch (_) {}
  }

  const onCopyAnswers = async () => {
    try {
      await copyText(markdown)
      setCopied('answers')
      setTimeout(() => setCopied(''), 1500)
    } catch (_) {}
  }

  return (
    <div className="jh-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="jh-modal jh-apply-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="jh-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <header className="jh-modal-head">
          <div>
            <h2>Apply to {job.title}</h2>
            <p className="wa-job-meta">
              {job.company || '—'}
              {platform ? ` · ${platform}` : ''}
            </p>
          </div>
        </header>

        {loading ? (
          <p className="wa-muted">Opening application and loading your profile fields…</p>
        ) : (
          <>
            <section className="jh-modal-section jh-apply-step">
              <h3>1. Application form</h3>
              <p className="wa-muted" style={{ marginTop: 0 }}>
                {job.url
                  ? 'The application page should have opened in a new tab. Fill standard fields using the copy buttons below.'
                  : 'No application URL on this job — paste questions in step 3 if you have a link elsewhere.'}
              </p>
              {job.url ? (
                <a href={job.url} target="_blank" rel="noopener noreferrer" className="wa-btn wa-btn-secondary" style={{ textDecoration: 'none' }}>
                  Reopen application ↗
                </a>
              ) : null}
            </section>

            {autofillFields.length > 0 ? (
              <section className="jh-modal-section jh-apply-step">
                <h3>2. Profile fields {canAutofill ? '(assisted autofill)' : ''}</h3>
                <p className="wa-muted" style={{ marginTop: 0 }}>
                  {canAutofill
                    ? 'Greenhouse/Lever-style forms: copy each value into the matching field. Full one-click autofill needs a browser extension (coming later).'
                    : 'Copy these from your profile into the application form.'}
                </p>
                <div className="jh-autofill-table">
                  {autofillFields.map(({ field, value }) => (
                    <div key={field} className="jh-autofill-row">
                      <span className="jh-autofill-label">{field}</span>
                      <span className="jh-autofill-value">{value}</span>
                      <button type="button" className="wa-btn wa-btn-ghost jh-copy-btn" onClick={() => onCopyField(value, field)}>
                        {copied === field ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="jh-modal-section jh-apply-step">
              <h3>{autofillFields.length ? '3' : '2'}. Application questions</h3>
              {extractError && !questions ? (
                <p className="wa-muted" style={{ marginTop: 0 }}>
                  {extractError} Paste every question from the form below — we&apos;ll draft answers from your profile.
                </p>
              ) : extractError && questions ? (
                <p className="wa-success-msg" style={{ marginTop: 0 }}>
                  Found some questions from the page. Review and add any we missed before generating answers.
                </p>
              ) : questions ? (
                <p className="wa-success-msg" style={{ marginTop: 0 }}>
                  Questions detected from the application page. Edit or add more before generating.
                </p>
              ) : (
                <p className="wa-muted" style={{ marginTop: 0 }}>
                  Paste each question from the application form (one per line or numbered).
                </p>
              )}
              <textarea
                className="wa-field"
                rows={7}
                value={questions}
                onChange={(e) => setQuestions(e.target.value)}
                placeholder="Why do you want to work here?&#10;Describe a project you're proud of…"
              />
              <button
                type="button"
                className="wa-btn wa-btn-primary"
                style={{ marginTop: 12 }}
                disabled={generating || !questions.trim()}
                onClick={onGenerate}
              >
                {generating ? 'Generating…' : 'Generate answers'}
              </button>
            </section>

            {markdown ? (
              <section className="jh-modal-section jh-apply-step">
                <div className="jh-apply-answers-head">
                  <h3>Ready to paste</h3>
                  <button type="button" className="wa-btn wa-btn-secondary" onClick={onCopyAnswers}>
                    {copied === 'answers' ? 'Copied!' : 'Copy all'}
                  </button>
                </div>
                <div className="wa-panel">
                  <div className="wa-md">
                    <ReactMarkdown>{markdown}</ReactMarkdown>
                  </div>
                </div>
              </section>
            ) : null}

            {err ? <p className="wa-alert">{err}</p> : null}

            <div className="wa-pick-row jh-modal-actions">
              <button type="button" className="wa-btn wa-btn-primary" disabled={submitting} onClick={onMarkSubmitted}>
                {submitting ? 'Saving…' : 'Mark as submitted'}
              </button>
              <button type="button" className="wa-btn wa-btn-ghost" onClick={onClose}>
                Close (keep in progress)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
