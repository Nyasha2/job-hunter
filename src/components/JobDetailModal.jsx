import React, { useEffect, useState } from 'react'
import { getJobDetail } from '../lib/jobApi.js'

export default function JobDetailModal({ slug, jobId, onClose, onOpenApply, onSave, onApply, onReject, actionState, busyId }) {
  const [job, setJob] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    ;(async () => {
      setErr('')
      try {
        const data = await getJobDetail(slug, jobId, jobId?.startsWith('http') ? jobId : '')
        if (!cancelled) setJob(data.job)
      } catch (e) {
        if (!cancelled) setErr(e.message || String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, jobId])

  if (!jobId) return null

  const state = actionState?.(job) || {}
  const cardKey = job?.url || job?.id
  const isBusy = busyId === cardKey

  return (
    <div className="jh-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="jh-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="jh-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {err ? <p className="wa-alert">{err}</p> : null}
        {!job ? (
          <p className="wa-muted">Loading job details…</p>
        ) : (
          <>
            <header className="jh-modal-head">
              <div>
                <h2>{job.title}</h2>
                <p className="wa-job-meta">
                  {job.company}
                  {job.location ? ` · ${job.location}` : ''}
                  {job.platform ? ` · ${job.platform}` : ''}
                </p>
              </div>
              {job.match_score ? <span className="jh-score-badge lg">{job.match_score}</span> : null}
            </header>

            {job.match_reasons?.length ? (
              <section className="jh-modal-section">
                <h3>Why this match</h3>
                <ul className="wa-job-bullets">
                  {job.match_reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {job.risk_flags?.length ? (
              <section className="jh-modal-section">
                <h3>Potential concerns</h3>
                <ul className="jh-risk-list">
                  {job.risk_flags.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {job.full_text ? (
              <section className="jh-modal-section">
                <h3>Full analysis</h3>
                <pre className="jh-pre">{job.full_text}</pre>
              </section>
            ) : null}

            <div className="wa-pick-row jh-modal-actions">
              <button type="button" className="wa-btn wa-btn-primary" disabled={isBusy} onClick={() => onSave?.(job)}>
                Save
              </button>
              <button type="button" className="wa-btn wa-btn-secondary" disabled={isBusy || !job.url} onClick={() => onApply?.(job)}>
                Apply now
              </button>
              <button type="button" className="wa-btn wa-btn-ghost" disabled={isBusy} onClick={() => onReject?.(job)}>
                Reject
              </button>
              <button type="button" className="wa-btn wa-btn-ghost" disabled={isBusy} onClick={() => onOpenApply?.(job)}>
                Generate answers
              </button>
              {job.url ? (
                <a href={job.url} target="_blank" rel="noopener noreferrer" className="wa-link-btn">
                  Open posting →
                </a>
              ) : null}
            </div>
            {state.tracking_status ? (
              <p className="wa-muted" style={{ marginTop: 12 }}>
                Tracking: {state.tracking_status.replace(/_/g, ' ')}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
