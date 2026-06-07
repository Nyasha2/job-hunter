import React, { useEffect, useState } from 'react'
import JobDiscoveryPanel from '../components/JobDiscoveryPanel.jsx'
import { fetchEnvStatus } from '../lib/api.js'
import { getProfile } from '../lib/jobApi.js'

export default function PipelineTab({ slug, hasOffice, running, busy, onRun, onStop, apiOk, onTracked, onOpenApply, onOfficeDone }) {
  const [keyMsg, setKeyMsg] = useState('')
  const [focus, setFocus] = useState('')

  useEffect(() => {
    if (apiOk === false) return
    fetchEnvStatus()
      .then((data) => {
        const a = data.anthropic
        if (a?.valid === false) setKeyMsg(a.message || 'Anthropic API key is not valid.')
        else setKeyMsg('')
      })
      .catch(() => {})
    getProfile(slug)
      .then((data) => setFocus((data.profile?.search_focus?.instructions || '').trim()))
      .catch(() => {})
  }, [apiOk, running, slug])

  return (
    <div>
      {keyMsg ? <p className="wa-alert">{keyMsg}</p> : null}
      {focus ? (
        <p className="wa-success-msg" style={{ marginTop: 0 }}>
          Active search focus: {focus}
        </p>
      ) : (
        <p className="wa-muted" style={{ marginTop: 0 }}>
          Tip: tell the Assistant your focus (e.g. &quot;backend only&quot;) — Alex updates on the next search run.
        </p>
      )}
      <p className="wa-muted" style={{ marginTop: 0, marginBottom: 16 }}>
        Scan job boards (Python Jobs, Hacker News). Matches show up as cards — save, apply, or reject each one.
        Each match takes about a minute (two AI screening steps per posting).
      </p>
      <div className="wa-pick-row" style={{ marginBottom: 16 }}>
        <button type="button" className="wa-btn wa-btn-primary" disabled={busy || apiOk === false || hasOffice === false} onClick={onRun}>
          {running ? 'Searching…' : 'Start search'}
        </button>
        <button type="button" className="wa-btn wa-btn-secondary" disabled={busy || !running} onClick={onStop}>
          Stop
        </button>
      </div>
      <JobDiscoveryPanel slug={slug} running={running} onTracked={onTracked} onOfficeDone={onOfficeDone} onOpenApply={onOpenApply} />
    </div>
  )
}
