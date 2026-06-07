import React from 'react'
import JobCard from './JobCard.jsx'
import Toast from './Toast.jsx'
import { useJobActions, useJobDiscovery } from '../hooks/useJobDiscovery.js'

export default function JobDiscoveryPanel({ slug, running, onTracked, onOfficeDone, onOpenApply }) {
  const { jobs, status, progress, done, removeJob } = useJobDiscovery(slug, running, onOfficeDone)
  const { busyId, err, toast, setToast, onSave, onApply, onReject, actionState } = useJobActions(slug, {
    onTracked,
    onRemove: removeJob,
    onOpenApply,
  })

  return (
    <div className="wa-discovery">
      <Toast message={toast} onClear={() => setToast('')} />
      {running || jobs.length > 0 ? (
        <p className="wa-discovery-status" aria-live="polite">
          {status || (running ? 'Searching…' : 'Ready')}
          {done && jobs.length === 0 ? ' — no new matches this run.' : null}
        </p>
      ) : null}
      {running && progress?.screened > 0 && progress.matched <= 1 ? (
        <p className="wa-muted" style={{ marginTop: 0, marginBottom: 12 }}>
          Most python.org listings are senior roles — Alex filters those out. Matches trickle in slowly (~30–60s
          each) while agents screen and score postings.
        </p>
      ) : null}
      {err ? <p className="wa-alert">{err}</p> : null}

      {jobs.length === 0 ? (
        running ? (
          <p className="wa-muted">Matches appear here as they are found — usually within a minute.</p>
        ) : null
      ) : (
        <div className="wa-job-list">
          {jobs.map((job) => (
            <JobCard
              key={job.url || job.id}
              job={job}
              busyId={busyId}
              actionState={actionState(job)}
              onSave={onSave}
              onApply={onApply}
              onReject={onReject}
            />
          ))}
        </div>
      )}
    </div>
  )
}
