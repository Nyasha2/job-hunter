export const JOB_OFFICE_SLUG = 'job_hunter'

export async function fetchBackendOk() {
  try {
    const r = await fetch('/api/health')
    if (r.ok) return true
  } catch (_) {}
  const r = await fetch('/api/env')
  return r.ok
}

export async function fetchEnvStatus() {
  const r = await fetch('/api/env')
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json()
}

export async function fetchOfficesList() {
  const r = await fetch('/api/offices')
  if (!r.ok) throw new Error(`list offices: ${r.status}`)
  const data = await r.json()
  return data.offices ?? []
}

export async function fetchOfficeDetail(name) {
  const r = await fetch(`/api/offices/${encodeURIComponent(name)}`)
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json()
}

export async function runOffice(name) {
  const r = await fetch(`/api/offices/${encodeURIComponent(name)}/run`, { method: 'POST' })
  if (!r.ok) {
    let detail = `${r.status}`
    try {
      const j = await r.json()
      if (j.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
    } catch (_) {}
    throw new Error(detail)
  }
  return r.json()
}

export async function stopOffice(name) {
  const r = await fetch(`/api/offices/${encodeURIComponent(name)}/stop`, { method: 'POST' })
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json()
}

export async function officeRunning(name) {
  const r = await fetch(`/api/offices/${encodeURIComponent(name)}/status`)
  if (!r.ok) return false
  const j = await r.json()
  return Boolean(j.running)
}
