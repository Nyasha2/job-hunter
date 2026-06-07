import React, { useCallback, useEffect, useState } from 'react'
import AppShell, { PageHeader } from './components/AppShell.jsx'
import ConnectionBanner from './components/ConnectionBanner.jsx'
import HomeAssistant from './components/HomeAssistant.jsx'
import DashboardTab from './tabs/DashboardTab.jsx'
import ProfileTab from './tabs/ProfileTab.jsx'
import JobFeedTab from './tabs/JobFeedTab.jsx'
import ApplicationsTab from './tabs/ApplicationsTab.jsx'
import ApplyAssistantTab from './tabs/ApplyAssistantTab.jsx'
import ApplyFlowModal from './components/ApplyFlowModal.jsx'
import PipelineTab from './tabs/PipelineTab.jsx'
import ActivityTab from './tabs/ActivityTab.jsx'
import { JOB_OFFICE_SLUG, fetchBackendOk, fetchOfficesList, runOffice, stopOffice, officeRunning } from './lib/api.js'
import { resetDiscover } from './lib/jobApi.js'

const SLUG = JOB_OFFICE_SLUG

const NAV = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'applications', label: 'Applications' },
  { id: 'home', label: 'Assistant' },
  { id: 'profile', label: 'Profile' },
  { id: 'search', label: 'Search runs' },
  { id: 'activity', label: 'Activity' },
]

const META = {
  dashboard: { title: 'Dashboard', subtitle: 'Overview of matches, applications, and search health.' },
  jobs: { title: 'Jobs', subtitle: 'Review, filter, and act on discovered roles.' },
  applications: { title: 'Applications', subtitle: 'Track every role from saved through offer.' },
  apply: { title: 'Apply help', subtitle: 'Paste form questions and get ready-to-use answers.' },
  profile: { title: 'Your profile', subtitle: 'Resume, experience, preferences, and constraints.' },
  search: { title: 'Search runs', subtitle: 'Scan job boards and refresh your match list.' },
  activity: { title: 'Activity', subtitle: 'DisSysLab source and agent events (technical stream).' },
}

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [apiOk, setApiOk] = useState(null)
  const [hasOffice, setHasOffice] = useState(null)
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [appsRefresh, setAppsRefresh] = useState(0)
  const [profileRefresh, setProfileRefresh] = useState(0)
  const [applyContext, setApplyContext] = useState(null)
  const [applyJob, setApplyJob] = useState(null)
  const [feedRefresh, setFeedRefresh] = useState(0)

  const refresh = useCallback(async () => {
    setErr('')
    try {
      const ok = await fetchBackendOk()
      setApiOk(ok)
      if (!ok) {
        setHasOffice(false)
        return
      }
      const offices = await fetchOfficesList()
      setHasOffice(new Set(offices.map((o) => o.name)).has(SLUG))
      setRunning(await officeRunning(SLUG))
    } catch (e) {
      setApiOk(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if ((page !== 'search' && page !== 'activity') || !running) return undefined
    const iv = setInterval(async () => {
      try {
        const still = await officeRunning(SLUG)
        if (!still) setRunning(false)
      } catch (_) {}
    }, 3000)
    return () => clearInterval(iv)
  }, [page, running])

  const onNavigate = (id) => {
    setPage(id)
    setSidebarOpen(false)
  }

  const openApplyHelp = (job) => {
    setApplyJob(job)
  }

  const handleApplyComplete = () => {
    setAppsRefresh((k) => k + 1)
    setFeedRefresh((k) => k + 1)
    setApplyJob(null)
  }

  const meta = META[page]

  return (
    <AppShell
      page={page}
      onNavigate={onNavigate}
      navItems={NAV}
      sidebarOpen={sidebarOpen}
      onToggleSidebar={() => setSidebarOpen((v) => !v)}
    >
      <ConnectionBanner online={apiOk} onRetry={refresh} />
      {err ? <p className="wa-alert">{err}</p> : null}

      {page === 'home' ? (
        <HomeAssistant
          slug={SLUG}
          apiOk={apiOk}
          onNavigate={onNavigate}
          onProfileSaved={() => setProfileRefresh((k) => k + 1)}
        />
      ) : (
        <>
          {meta ? <PageHeader {...meta} /> : null}
          {page === 'dashboard' && <DashboardTab slug={SLUG} onNavigate={onNavigate} />}
          {page === 'profile' && <ProfileTab slug={SLUG} key={profileRefresh} />}
          {page === 'jobs' && (
            <JobFeedTab
              slug={SLUG}
              feedRefreshKey={feedRefresh}
              onTrack={() => setAppsRefresh((k) => k + 1)}
              onNavigate={onNavigate}
              onOpenApply={openApplyHelp}
            />
          )}
          {page === 'applications' && <ApplicationsTab slug={SLUG} refreshKey={appsRefresh} />}
          {page === 'apply' && (
            <ApplyAssistantTab slug={SLUG} applyContext={applyContext} onClearContext={() => setApplyContext(null)} />
          )}
          {page === 'activity' && <ActivityTab slug={SLUG} running={running} />}
          {page === 'search' && (
            <PipelineTab
              slug={SLUG}
              hasOffice={hasOffice}
              running={running}
              busy={busy}
              apiOk={apiOk}
              onTracked={() => setAppsRefresh((k) => k + 1)}
              onOpenApply={openApplyHelp}
              onOfficeDone={() => setRunning(false)}
              onRun={async () => {
                setBusy(true)
                setErr('')
                try {
                  await resetDiscover(SLUG)
                  await runOffice(SLUG)
                  setRunning(true)
                } catch (e) {
                  const msg = e.message || String(e)
                  if (msg.includes('409') || /already running/i.test(msg)) {
                    setRunning(true)
                  } else {
                    setErr(msg)
                  }
                } finally {
                  setBusy(false)
                }
              }}
              onStop={async () => {
                setBusy(true)
                try {
                  await stopOffice(SLUG)
                } catch (_) {}
                setRunning(false)
                setBusy(false)
              }}
            />
          )}
        </>
      )}
      <ApplyFlowModal
        slug={SLUG}
        job={applyJob}
        onClose={() => setApplyJob(null)}
        onComplete={handleApplyComplete}
      />
    </AppShell>
  )
}
