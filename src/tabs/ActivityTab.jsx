import React from 'react'
import StreamPanel from '../components/StreamPanel.jsx'

export default function ActivityTab({ slug, running }) {
  return (
    <div>
      <p className="wa-muted" style={{ marginTop: 0, marginBottom: 16 }}>
        Technical activity from DisSysLab sources and agents. This is a filtered stream — your main workflow lives in
        Jobs and Applications.
      </p>
      {!running ? (
        <p className="wa-muted" style={{ marginBottom: 12 }}>
          Start a search run to see live agent activity here.
        </p>
      ) : null}
      <StreamPanel officeName={slug} running={running} />
    </div>
  )
}
