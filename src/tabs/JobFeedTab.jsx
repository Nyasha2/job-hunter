import React, { useCallback, useEffect, useMemo, useState } from 'react'
import JobCard from '../components/JobCard.jsx'
import JobDetailModal from '../components/JobDetailModal.jsx'
import Toast from '../components/Toast.jsx'
import { getJobFeed } from '../lib/jobApi.js'
import { useJobActions } from '../hooks/useJobDiscovery.js'

const SECTIONS = [
  { id: 'recommended', label: 'Recommended', minScore: 70 },
  { id: 'review', label: 'Needs review', minScore: 0, maxScore: 69 },
  { id: 'saved', label: 'Saved', tracking: 'saved' },
  { id: 'applied', label: 'Applied', tracking: 'applied' },
]

function sortJobs(jobs, sortBy) {
  const copy = [...jobs]
  if (sortBy === 'newest') return copy.reverse()
  if (sortBy === 'score') return copy.sort((a, b) => (b.match_score || 0) - (a.match_score || 0))
  if (sortBy === 'company') return copy.sort((a, b) => (a.company || '').localeCompare(b.company || ''))
  return copy
}

export default function JobFeedTab({ slug, feedRefreshKey, onTrack, onNavigate, onOpenApply }) {
  const [jobs, setJobs] = useState([])
  const [err, setErr] = useState('')
  const [section, setSection] = useState('recommended')
  const [sortBy, setSortBy] = useState('score')
  const [platform, setPlatform] = useState('')
  const [detailId, setDetailId] = useState(null)

  const load = useCallback(async () => {
    setErr('')
    try {
      const data = await getJobFeed(slug)
      setJobs(data.jobs || [])
    } catch (e) {
      setErr(e.message || String(e))
    }
  }, [slug])

  const removeJob = useCallback((job) => {
    const key = job.url || job.id
    setJobs((prev) => prev.filter((j) => (j.url || j.id) !== key))
  }, [])

  const { busyId, err: actionErr, toast, setToast, onSave, onApply, onReject, actionState } = useJobActions(slug, {
    onTracked: () => {
      load()
      onTrack?.()
    },
    onRemove: removeJob,
    onOpenApply,
  })

  useEffect(() => {
    load()
  }, [load, feedRefreshKey])

  const platforms = useMemo(() => [...new Set(jobs.map((j) => j.platform).filter(Boolean))].sort(), [jobs])

  const filtered = useMemo(() => {
    let list = jobs
    if (platform) list = list.filter((j) => j.platform === platform)
    const cfg = SECTIONS.find((s) => s.id === section)
    if (!cfg) return sortJobs(list, sortBy)
    if (cfg.tracking) list = list.filter((j) => j.tracking_status === cfg.tracking)
    else if (cfg.maxScore != null) list = list.filter((j) => (j.match_score || 0) <= cfg.maxScore)
    else if (cfg.minScore) list = list.filter((j) => (j.match_score || 0) >= cfg.minScore)
    return sortJobs(list, sortBy)
  }, [jobs, section, sortBy, platform])

  const displayErr = err || actionErr

  return (
    <div>
      <Toast message={toast} onClear={() => setToast('')} />
      <div className="jh-toolbar">
        <div className="jh-tab-row">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`jh-tab ${section === s.id ? 'active' : ''}`}
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="jh-filter-row">
          <select className="wa-field wa-input jh-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="score">Best match</option>
            <option value="newest">Newest</option>
            <option value="company">Company</option>
          </select>
          <select className="wa-field wa-input jh-select" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="">All platforms</option>
            {platforms.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button type="button" className="wa-btn wa-btn-secondary" disabled={Boolean(busyId)} onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      {displayErr ? <p className="wa-alert">{displayErr}</p> : null}
      {filtered.length === 0 ? (
        <p className="wa-muted">
          No jobs in this view.{' '}
          {onNavigate ? (
            <>
              Run a{' '}
              <button type="button" className="wa-inline-link" onClick={() => onNavigate('search')}>
                search
              </button>{' '}
              to discover roles.
            </>
          ) : null}
        </p>
      ) : (
        <div className="wa-job-list">
          {filtered.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              busyId={busyId}
              actionState={actionState(job)}
              onSave={onSave}
              onApply={onApply}
              onReject={onReject}
              onDetails={() => setDetailId(job.id)}
            />
          ))}
        </div>
      )}

      <JobDetailModal
        slug={slug}
        jobId={detailId}
        onClose={() => setDetailId(null)}
        onOpenApply={(job) => {
          setDetailId(null)
          onOpenApply?.(job)
        }}
        onSave={onSave}
        onApply={onApply}
        onReject={onReject}
        actionState={actionState}
        busyId={busyId}
      />
    </div>
  )
}
