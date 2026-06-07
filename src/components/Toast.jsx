import React, { useEffect } from 'react'

export default function Toast({ message, onClear }) {
  useEffect(() => {
    if (!message) return undefined
    const t = setTimeout(() => onClear?.(), 3200)
    return () => clearTimeout(t)
  }, [message, onClear])

  if (!message) return null
  return (
    <div className="wa-toast" role="status">
      {message}
    </div>
  )
}
