import React, { useCallback, useEffect, useState } from 'react'
import { addApplicationEvent, deleteApplication, getApplications, updateApplication } from '../lib/jobApi.js'

const KANBAN_COLUMNS = [
  { id: 'saved', title: 'Saved', statuses: ['found', 'saved'] },
  {
    id: 'active',
    title: 'In progress',
    statuses: [
      'applying',
      'applied',
      'in_progress',
      'recruiter_screen',
      'online_assessment',
      'technical_interview',
      'interview',
      'hiring_manager_interview',
      'final_round',
    ],
  },
  { id: 'offer', title: 'Offer', statuses: ['offer'] },
  { id: 'closed', title: 'Closed', statuses: ['rejected', 'withdrawn', 'archived'] },
]

function labelStatus(st) {
  return (st || 'saved').replace(/_/g, ' ')
}

export default function ApplicationsTab({ slug, refreshKey }) {
  const [apps, setApps] = useState([])
  const [statuses, setStatuses] = useState([])
  const [view, setView] = useState('kanban')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [noteDraft, setNoteDraft] = useState('')

  const load = useCallback(async () => {
    setErr('')
    try {
      const data = await getApplications(slug)
      setApps(data.applications || [])
      setStatuses(data.statuses || [])
    } catch (e) {
      setErr(e.message || String(e))
    }
  }, [slug])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const onStatus = async (app, status) => {
    setBusy(true)
    try {
      await updateApplication(slug, app.id, { status })
      await load()
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const onAddNote = async (app) => {
    if (!noteDraft.trim()) return
    setBusy(true)
    try {
      await addApplicationEvent(slug, app.id, { event_type: 'note', message: noteDraft.trim() })
      setNoteDraft('')
      await load()
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async (app) => {
    if (!window.confirm(`Remove “${app.title}” from tracker?`)) return
    setBusy(true)
    try {
      await deleteApplication(slug, app.id)
      await load()
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const statusOptions = statuses.length
    ? statuses
    : ['saved', 'applied', 'technical_interview', 'offer', 'rejected', 'withdrawn']

  const renderCard = (app) => (
    <article key={app.id} className="jh-app-card">
      <div className="jh-app-card-head">
        <div className="jh-app-card-title">
          <h3>{app.title}</h3>
          <p className="wa-job-meta">{app.company || '—'}</p>
        </div>
        <select
          className="wa-status-select jh-app-status-select"
          value={app.status || 'saved'}
          disabled={busy}
          onChange={(e) => onStatus(app, e.target.value)}
        >
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {labelStatus(s)}
            </option>
          ))}
        </select>
      </div>
      {app.url ? (
        <a href={app.url} target="_blank" rel="noopener noreferrer" className="wa-link-btn">
          Application link →
        </a>
      ) : null}
      {app.stage_notes ? <p className="wa-muted jh-app-note">{app.stage_notes}</p> : null}
      <div className="wa-pick-row" style={{ marginTop: 8 }}>
        <button type="button" className="wa-btn wa-btn-ghost wa-btn-sm" onClick={() => {
          setExpanded(expanded === app.id ? null : app.id)
          setNoteDraft('')
        }}>
          {expanded === app.id ? 'Hide timeline' : 'Timeline'}
        </button>
        <button type="button" className="wa-btn wa-btn-ghost wa-btn-sm" disabled={busy} onClick={() => onDelete(app)}>
          Remove
        </button>
      </div>
      {expanded === app.id ? (
        <div className="jh-timeline">
          {(app.timeline_events || []).length === 0 ? (
            <p className="wa-muted">No events yet.</p>
          ) : (
            <ul>
              {[...(app.timeline_events || [])].reverse().map((ev, i) => (
                <li key={`${ev.at}-${i}`}>
                  <time>{ev.at?.slice(0, 16)?.replace('T', ' ')}</time>
                  <span>{ev.message}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="jh-note-row">
            <input
              className="wa-field wa-input"
              placeholder="Add a note…"
              value={expanded === app.id ? noteDraft : ''}
              onChange={(e) => setNoteDraft(e.target.value)}
            />
            <button type="button" className="wa-btn wa-btn-secondary wa-btn-sm" disabled={busy} onClick={() => onAddNote(app)}>
              Add
            </button>
          </div>
        </div>
      ) : null}
    </article>
  )

  return (
    <div>
      <div className="jh-toolbar">
        <div className="jh-tab-row">
          <button type="button" className={`jh-tab ${view === 'kanban' ? 'active' : ''}`} onClick={() => setView('kanban')}>
            Kanban
          </button>
          <button type="button" className={`jh-tab ${view === 'table' ? 'active' : ''}`} onClick={() => setView('table')}>
            Table
          </button>
        </div>
        <button type="button" className="wa-btn wa-btn-secondary" disabled={busy} onClick={load}>
          Refresh
        </button>
      </div>
      {err ? <p className="wa-alert">{err}</p> : null}
      {apps.length === 0 ? (
        <p className="wa-muted">No applications yet. Save roles from the Jobs tab to start tracking.</p>
      ) : view === 'table' ? (
        <div className="wa-job-list">{apps.map(renderCard)}</div>
      ) : (
        <div className="jh-kanban">
          {KANBAN_COLUMNS.map((col) => {
            const colApps = apps.filter((a) => col.statuses.includes(a.status || 'saved'))
            return (
              <section key={col.id} className="jh-kanban-col">
                <h3>
                  {col.title} <span className="jh-col-count">{colApps.length}</span>
                </h3>
                {colApps.length === 0 ? (
                  <p className="jh-kanban-empty">No applications in this stage.</p>
                ) : (
                  colApps.map(renderCard)
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
