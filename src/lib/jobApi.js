const base = (slug) => `/api/offices/${encodeURIComponent(slug)}/jobs`

export async function getProfile(slug) {
  const r = await fetch(`${base(slug)}/profile`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function putProfile(slug, { profile, resume_md }) {
  const r = await fetch(`${base(slug)}/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, resume_md }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function getJobFeed(slug) {
  const r = await fetch(`${base(slug)}/feed`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function getDashboard(slug) {
  const r = await fetch(`${base(slug)}/dashboard`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function getJobDetail(slug, jobId, jobUrl = '') {
  const params = new URLSearchParams()
  if (jobId) params.set('job_id', jobId)
  if (jobUrl) params.set('url', jobUrl)
  const r = await fetch(`${base(slug)}/detail?${params}`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function getDiscoverProgress(slug) {
  const r = await fetch(`${base(slug)}/discover/progress`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function getDiscoverCards(slug) {
  const r = await fetch(`${base(slug)}/discover/cards`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function resetDiscover(slug) {
  const r = await fetch(`${base(slug)}/discover/reset`, { method: 'POST' })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function getApplications(slug) {
  const r = await fetch(`${base(slug)}/applications`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function createApplication(slug, body) {
  const r = await fetch(`${base(slug)}/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function updateApplication(slug, appId, body) {
  const r = await fetch(`${base(slug)}/applications/${encodeURIComponent(appId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function deleteApplication(slug, appId) {
  const r = await fetch(`${base(slug)}/applications/${encodeURIComponent(appId)}`, { method: 'DELETE' })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function addApplicationEvent(slug, appId, body) {
  const r = await fetch(`${base(slug)}/applications/${encodeURIComponent(appId)}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function getSearchRuns(slug) {
  const r = await fetch(`${base(slug)}/search_runs`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function generateAnswers(slug, body) {
  const r = await fetch(`${base(slug)}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function startApply(slug, body) {
  const r = await fetch(`${base(slug)}/apply/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function sendAssistantMessage(slug, messages) {
  const r = await fetch(`${base(slug)}/assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}
