/** Shown only when the app cannot reach its API — no debug jargon. */
export default function ConnectionBanner({ online, onRetry }) {
  if (online !== false) return null
  return (
    <div className="conn-banner" role="alert">
      <span>We couldn&apos;t connect right now. Check that the app service is running, then try again.</span>
      {onRetry ? (
        <button type="button" className="conn-banner-btn" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  )
}
