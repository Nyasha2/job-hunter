import React, { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import { groupActivityImages, useJobStream } from '../hooks/useJobStream.js'

export default function StreamPanel({ officeName, running }) {
  const entries = useJobStream(officeName, running)
  const rows = useMemo(() => groupActivityImages(entries), [entries])

  return (
    <div className="wa-stream">
      {rows.length === 0 ? (
        <p style={{ color: '#78716c', margin: 0 }}>{running ? 'Waiting for agent output…' : 'Start the pipeline to see live output.'}</p>
      ) : (
        rows.map((row) => {
          if (row.kind === 'image-row') {
            return (
              <div key={row.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                {row.imgs.map((img) => (
                  <img key={img.id} src={img.src} alt={img.alt || ''} style={{ maxHeight: 120, borderRadius: 8 }} />
                ))}
              </div>
            )
          }
          if (row.kind === 'markdown') {
            return (
              <div key={row.id} className="wa-md" style={{ marginBottom: 14 }}>
                <ReactMarkdown>{row.body}</ReactMarkdown>
              </div>
            )
          }
          return (
            <pre key={row.id} style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: '0 0 8px' }}>
              {row.text}
            </pre>
          )
        })
      )}
    </div>
  )
}
