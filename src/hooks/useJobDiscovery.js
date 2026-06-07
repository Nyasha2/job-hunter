import { useCallback, useEffect, useRef, useState } from 'react'
import { createApplication, getDiscoverCards, getDiscoverProgress, resetDiscover } from '../lib/jobApi.js'
import { officeRunning } from '../lib/api.js'

export function useJobDiscovery(slug, running, onOfficeDone) {
  const [jobs, setJobs] = useState([])
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState(null)
  const [done, setDone] = useState(false)
  const esRef = useRef(null)
  const seenRef = useRef(new Set())

  const mergeJob = useCallback((job) => {
    const key = job.url || job.id
    if (!key || seenRef.current.has(key)) return
    seenRef.current.add(key)
    setJobs((prev) => [...prev, job])
    setStatus(`${seenRef.current.size} match${seenRef.current.size === 1 ? '' : 'es'} found`)
  }, [])

  const removeJob = useCallback((job) => {
    const key = job.url || job.id
    setJobs((prev) => prev.filter((j) => (j.url || j.id) !== key))
  }, [])

  useEffect(() => {
    if (!slug || !running) {
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
      return undefined
    }

    setJobs([])
    setDone(false)
    setStatus('Starting search…')
    seenRef.current = new Set()

    const es = new EventSource(`/api/offices/${encodeURIComponent(slug)}/jobs/discover/stream`)
    esRef.current = es

    es.addEventListener('status', (e) => {
      try {
        const o = JSON.parse(e.data)
        if (o.text) setStatus(o.text)
        if (o.phase === 'done') {
          setDone(true)
          onOfficeDone?.()
        }
      } catch (_) {}
    })

    es.addEventListener('job', (e) => {
      try {
        mergeJob(JSON.parse(e.data))
      } catch (_) {}
    })

    es.onerror = () => {
      es.close()
      esRef.current = null
    }

    const pollFeed = async () => {
      try {
        const [data, prog] = await Promise.all([getDiscoverCards(slug), getDiscoverProgress(slug)])
        setProgress(prog)
        for (const job of data.jobs || []) mergeJob(job)
        if (prog.search_running) {
          const n = prog.matched ?? seenRef.current.size
          setStatus(
            `Screened ${prog.screened} postings · ${n} match${n === 1 ? '' : 'es'} (agents still working…)`
          )
        }
      } catch (_) {}
    }

    const pollIv = setInterval(pollFeed, 2500)
    pollFeed()

    const statusIv = setInterval(async () => {
      try {
        const still = await officeRunning(slug)
        if (!still) {
          setDone(true)
          onOfficeDone?.()
        }
      } catch (_) {}
    }, 3000)

    return () => {
      es.close()
      esRef.current = null
      clearInterval(pollIv)
      clearInterval(statusIv)
    }
  }, [slug, running, mergeJob, onOfficeDone])

  return { jobs, status, progress, done, removeJob }
}

export function useJobActions(slug, { onTracked, onRemove, onOpenApply } = {}) {
  const [busyId, setBusyId] = useState(null)
  const [actions, setActions] = useState({})
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')

  const keyFor = (job) => job.url || job.id

  const mark = (job, patch) => {
    const key = keyFor(job)
    setActions((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  const runAction = useCallback(
    async (job, status, message, { openUrl = false, remove = false } = {}) => {
      const key = keyFor(job)
      setBusyId(key)
      setErr('')
      try {
        await createApplication(slug, {
          job_id: job.id,
          title: job.title,
          company: job.company,
          url: job.url,
          status,
          auto_apply_eligible: /greenhouse\.io|lever\.co/i.test(job.url || ''),
        })
        if (status === 'saved') mark(job, { saved: true, tracking_status: 'saved' })
        if (status === 'applied') mark(job, { applied: true, tracking_status: 'applied' })
        if (status === 'rejected') mark(job, { rejected: true, tracking_status: 'rejected' })
        setToast(message)
        onTracked?.()
        if (remove) {
          setTimeout(() => onRemove?.(job), 400)
        }
        if (openUrl && job.url) {
          window.open(job.url, '_blank', 'noopener,noreferrer')
        }
      } catch (e) {
        setErr(e.message || String(e))
        setToast('')
      } finally {
        setBusyId(null)
      }
    },
    [slug, onTracked, onRemove]
  )

  const onSave = useCallback((job) => runAction(job, 'saved', `Saved “${job.title}” to Applications`), [runAction])
  const onApply = useCallback(
    (job) => {
      mark(job, { applying: true, tracking_status: 'applying' })
      onOpenApply?.(job)
    },
    [onOpenApply]
  )
  const onReject = useCallback(
    (job) => runAction(job, 'rejected', `Removed “${job.title}” from matches`, { remove: true }),
    [runAction]
  )

  const actionState = (job) => {
    const key = keyFor(job)
    const local = actions[key] || {}
    return {
      ...local,
      tracking_status: local.tracking_status || job.tracking_status || null,
    }
  }

  return { busyId, err, toast, setToast, onSave, onApply, onReject, actionState }
}
