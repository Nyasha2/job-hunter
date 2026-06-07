import React from 'react'

const ICONS = {
  home: '⌂',
  dashboard: '◫',
  profile: '◎',
  jobs: '▤',
  applications: '☰',
  apply: '✎',
  search: '◷',
  activity: '⚡',
}

export default function AppShell({ page, onNavigate, navItems, children, sidebarOpen, onToggleSidebar }) {
  return (
    <div className="wa-app">
      <header className="wa-topbar">
        <button type="button" className="wa-menu-btn" onClick={onToggleSidebar} aria-label="Toggle menu">
          ☰
        </button>
        <span className="wa-topbar-brand">Job Hunter</span>
      </header>
      <div className="wa-body">
        <aside className={`wa-sidebar ${sidebarOpen ? 'wa-sidebar-open' : ''}`}>
          <div className="wa-sidebar-head">
            <div className="wa-logo-mark">J</div>
            <div>
              <div className="wa-logo-title">Job Hunter</div>
              <div className="wa-logo-sub">Your search companion</div>
            </div>
          </div>
          <nav className="wa-sidebar-nav">
            {navItems.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={`wa-sidebar-link ${page === id ? 'active' : ''}`}
                onClick={() => onNavigate(id)}
              >
                <span className="wa-sidebar-icon">{ICONS[id] || '·'}</span>
                {label}
              </button>
            ))}
          </nav>
        </aside>
        {sidebarOpen ? (
          <button type="button" className="wa-backdrop" onClick={onToggleSidebar} aria-label="Close menu" />
        ) : null}
        <main className="wa-content">{children}</main>
      </div>
    </div>
  )
}

export function PageHeader({ title, subtitle }) {
  return (
    <header className="wa-page-header">
      <h1 className="wa-page-title">{title}</h1>
      {subtitle ? <p className="wa-page-sub">{subtitle}</p> : null}
    </header>
  )
}
