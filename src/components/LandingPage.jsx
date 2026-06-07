import React from 'react'

export default function LandingPage({ onNavigate, apiOk, hasOffice }) {
  return (
    <div className="wa-landing">
      <header className="wa-hero">
        <p className="wa-hero-kicker">Continuous search · DisSysLab powered</p>
        <h1 className="wa-hero-title">Find roles. Track everything. Apply faster.</h1>
        <p className="wa-hero-lead">
          Agents poll job boards against your profile, surface matches, and help you answer application
          questions — with a Simplify-style tracker for every stage.
        </p>
        <div className="wa-hero-actions">
          <button type="button" className="wa-btn wa-btn-primary" onClick={() => onNavigate('feed')}>
            Browse matches
          </button>
          <button type="button" className="wa-btn wa-btn-secondary" onClick={() => onNavigate('profile')}>
            Edit profile
          </button>
        </div>
        <div className="wa-hero-status">
          <span className={`wa-pill ${apiOk ? 'wa-pill-ok' : 'wa-pill-bad'}`}>
            {apiOk == null ? 'Connecting…' : apiOk ? 'Backend online' : 'Backend offline'}
          </span>
          {hasOffice === false && apiOk ? <span className="wa-pill wa-pill-warn">Office missing</span> : null}
        </div>
      </header>
      <section className="wa-feature-grid">
        {[
          { t: 'Profile', d: 'Resume, skills, preferences — ground truth for matchers.', id: 'profile' },
          { t: 'Job feed', d: 'Review agent-matched roles; save, reject, or open postings.', id: 'feed' },
          { t: 'Applications', d: 'Pipeline tracker: saved → applied → interview → offer.', id: 'applications' },
          { t: 'Apply assistant', d: 'Paste form questions; get answers from your profile.', id: 'apply' },
        ].map((f) => (
          <article key={f.id} className="wa-feature-card">
            <h2>{f.t}</h2>
            <p>{f.d}</p>
            <button type="button" className="wa-link-btn" onClick={() => onNavigate(f.id)}>Open →</button>
          </article>
        ))}
      </section>
    </div>
  )
}
