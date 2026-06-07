import React from 'react'

const RATING_CLASS = {
  EXCELLENT: 'wa-rating-excellent',
  STRONG: 'wa-rating-strong',
  GOOD: 'wa-rating-good',
  FAIR: 'wa-rating-fair',
}

const STATUS_LABEL = {
  saved: 'Saved to Applications',
  applying: 'Applying…',
  applied: 'Marked as applied',
  rejected: 'Rejected',
  interview: 'Interview',
  offer: 'Offer',
}

export default function JobCard({ job, busyId, actionState, onSave, onApply, onReject, onDetails }) {
  const state = actionState || {}
  const tracking = state.tracking_status || job.tracking_status || null
  const cardKey = job.url || job.id
  const isBusy = busyId === cardKey

  const status = state.rejected
    ? 'rejected'
    : state.applied
      ? 'applied'
      : state.applying || tracking === 'applying'
        ? 'applying'
        : state.saved
          ? 'saved'
          : tracking

  if (status === 'rejected') {
    return null
  }

  return (
    <article className={`wa-job-card wa-job-card-live ${status ? 'wa-job-card-tracked' : ''}`}>
      {status ? (
        <p className={`wa-job-status wa-job-status-${status}`}>{STATUS_LABEL[status] || status}</p>
      ) : null}
      <div className="wa-job-card-head">
        <div>
          <h3>{job.title || 'Untitled role'}</h3>
          <p className="wa-job-meta">
            {job.company}
            {job.summary ? ` · ${job.summary}` : null}
          </p>
        </div>
        {job.match_rating ? (
          <span className={`wa-rating ${RATING_CLASS[job.match_rating] || ''}`}>{job.match_rating}</span>
        ) : job.match_score ? (
          <span className="jh-score-badge">{job.match_score}</span>
        ) : null}
      </div>
      {job.match_reasons?.length ? (
        <ul className="wa-job-bullets">
          {job.match_reasons.slice(0, 2).map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : job.bullets?.length ? (
        <ul className="wa-job-bullets">
          {job.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : null}
      {job.risk_flags?.length ? (
        <p className="jh-risk-hint">⚠ {job.risk_flags[0]}</p>
      ) : null}
      <div className="wa-pick-row wa-job-actions">
        <button
          type="button"
          className="wa-btn wa-btn-primary"
          disabled={isBusy || status === 'saved' || status === 'applied'}
          onClick={() => onSave?.(job)}
        >
          {status === 'saved' || status === 'applied' ? 'Saved' : 'Save'}
        </button>
        <button
          type="button"
          className="wa-btn wa-btn-secondary"
          disabled={isBusy || !job.url || status === 'applied'}
          onClick={() => onApply?.(job)}
        >
          {status === 'applied' ? 'Applied' : status === 'applying' ? 'Continue applying' : 'Apply now'}
        </button>
        <button type="button" className="wa-btn wa-btn-ghost" disabled={isBusy} onClick={() => onReject?.(job)}>
          Reject
        </button>
        {onDetails ? (
          <button type="button" className="wa-btn wa-btn-ghost" disabled={isBusy} onClick={() => onDetails(job)}>
            Details
          </button>
        ) : null}
      </div>
    </article>
  )
}
