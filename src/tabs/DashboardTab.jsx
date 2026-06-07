import React, { useCallback, useEffect, useState } from 'react'
import { getDashboard } from '../lib/jobApi.js'

const STATUS_LABELS = {
  saved: 'Saved',
  applied: 'Applied',
  offer: 'Offer',
  rejected: 'Rejected',
  technical_interview: 'Interview',
  interview: 'Interview',
}

export default function DashboardTab({ slug, onNavigate }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setErr('')
    try {
      setData(await getDashboard(slug))
    } catch (e) {
      setErr(e.message || String(e))
    }
  }, [slug])

  useEffect(() => {
    load()
    const iv = setInterval(load, 8000)
    return () => clearInterval(iv)
  }, [load])

  if (err) return <p className="wa-alert">{err}</p>
  if (!data) return <p className="wa-muted">Loading dashboard…</p>

  const byStatus = data.applications_by_status || {}

  return (
    <div className="jh-dashboard">
      <div className="jh-stat-grid">
        <article className="jh-stat-card">
          <p className="jh-stat-label">Recommended matches</p>
          <p className="jh-stat-value">{data.jobs_recommended}</p>
          <p className="wa-muted">{data.jobs_total} total discovered</p>
        </article>
        <article className="jh-stat-card">
          <p className="jh-stat-label">Applications</p>
          <p className="jh-stat-value">{data.applications_total}</p>
          <p className="wa-muted">{data.applications_need_action} need action</p>
        </article>
        <article className="jh-stat-card">
          <p className="jh-stat-label">Search</p>
          <p className="jh-stat-value">{data.search_running ? 'Running' : 'Idle'}</p>
          <button type="button" className="wa-inline-link" onClick={() => onNavigate?.('search')}>
            {data.search_running ? 'View search run' : 'Start search'}
          </button>
        </article>
      </div>

      {Object.keys(byStatus).length > 0 ? (
        <section className="jh-dash-section">
          <h2 className="jh-section-title">Applications by stage</h2>
          <div className="jh-pill-row">
            {Object.entries(byStatus).map(([st, n]) => (
              <span key={st} className="jh-pill">
                {STATUS_LABELS[st] || st.replace(/_/g, ' ')} · {n}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {data.recent_jobs?.length ? (
        <section className="jh-dash-section">
          <div className="jh-section-head">
            <h2 className="jh-section-title">Recent matches</h2>
            <button type="button" className="wa-btn wa-btn-ghost wa-btn-sm" onClick={() => onNavigate?.('jobs')}>
              View all jobs
            </button>
          </div>
          <ul className="jh-dash-list">
            {data.recent_jobs.map((job) => (
              <li key={job.id}>
                <strong>{job.title}</strong>
                <span className="wa-muted"> — {job.company}</span>
                {job.match_score ? <span className="jh-score-badge">{job.match_score}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="wa-muted">
          No jobs yet.{' '}
          <button type="button" className="wa-inline-link" onClick={() => onNavigate?.('search')}>
            Run a search
          </button>{' '}
          to populate your dashboard.
        </p>
      )}
    </div>
  )
}
