import React, { useCallback, useEffect, useState } from 'react'
import { getProfile, putProfile } from '../lib/jobApi.js'

const emptyExperience = () => ({ title: '', org: '', dates: '', bullets: [''] })

function profileToForm(profile) {
  const p = profile || {}
  const pref = p.preferences || {}
  const constraints = p.application_constraints || {}
  const style = p.answer_style || {}
  return {
    name: p.name || '',
    email: p.email || '',
    headline: p.headline || '',
    roles: (pref.roles || []).join(', '),
    locations: (pref.locations || []).join(', '),
    remote_ok: pref.remote_ok !== false,
    min_salary: pref.min_salary ?? '',
    industries: (pref.industries || []).join(', '),
    keywords_prioritize: (pref.keywords_prioritize || []).join(', '),
    keywords_reject: (pref.keywords_reject || []).join(', '),
    skills: (p.skills || []).join(', '),
    experiences: (p.experiences || []).length ? p.experiences : [emptyExperience()],
    education: (p.education || []).length ? p.education : [{ school: '', degree: '', graduation: '', gpa: '' }],
    projects: (p.projects || []).length ? p.projects : [{ name: '', tech: '', description: '' }],
    visa_needed: Boolean(constraints.visa_sponsorship_needed),
    work_authorization: constraints.work_authorization || '',
    start_date: constraints.start_date || '',
    answer_tone: style.tone || 'professional',
    answer_notes: style.notes || '',
  }
}

function formToProfile(form, baseProfile = {}) {
  const pref = { ...(baseProfile.preferences || {}) }
  return {
    ...baseProfile,
    version: baseProfile.version || 1,
    name: form.name.trim(),
    email: form.email.trim(),
    headline: form.headline.trim(),
    preferences: {
      ...pref,
      roles: form.roles.split(',').map((s) => s.trim()).filter(Boolean),
      locations: form.locations.split(',').map((s) => s.trim()).filter(Boolean),
      remote_ok: form.remote_ok,
      min_salary: form.min_salary === '' ? null : Number(form.min_salary) || null,
      industries: form.industries.split(',').map((s) => s.trim()).filter(Boolean),
      keywords_prioritize: form.keywords_prioritize.split(',').map((s) => s.trim()).filter(Boolean),
      keywords_reject: form.keywords_reject.split(',').map((s) => s.trim()).filter(Boolean),
    },
    skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
    education: form.education.filter((e) => e.school?.trim() || e.degree?.trim()),
    projects: form.projects.filter((p) => p.name?.trim()),
    experiences: form.experiences
      .filter((e) => e.title?.trim() || e.org?.trim())
      .map((e) => ({
        title: e.title.trim(),
        org: e.org.trim(),
        dates: e.dates.trim(),
        bullets: (e.bullets || []).map((b) => b.trim()).filter(Boolean),
      })),
    application_constraints: {
      ...(baseProfile.application_constraints || {}),
      visa_sponsorship_needed: form.visa_needed,
      work_authorization: form.work_authorization.trim(),
      start_date: form.start_date.trim(),
    },
    answer_style: {
      ...(baseProfile.answer_style || {}),
      tone: form.answer_tone,
      notes: form.answer_notes.trim(),
    },
  }
}

export default function ProfileTab({ slug }) {
  const [form, setForm] = useState(null)
  const [rawProfile, setRawProfile] = useState(null)
  const [resume, setResume] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setErr('')
    try {
      const data = await getProfile(slug)
      setRawProfile(data.profile || {})
      setForm(profileToForm(data.profile))
      setResume(data.resume_md || '')
    } catch (e) {
      setErr(e.message || String(e))
    }
  }, [slug])

  useEffect(() => {
    load()
  }, [load])

  const setField = (key, val) => setForm((f) => ({ ...f, [key]: val }))

  const setExp = (idx, patch) => {
    setForm((f) => {
      const ex = [...f.experiences]
      ex[idx] = { ...ex[idx], ...patch }
      return { ...f, experiences: ex }
    })
  }

  const onSave = async () => {
    if (!form) return
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      await putProfile(slug, { profile: formToProfile(form, rawProfile || {}), resume_md: resume })
      setMsg('Your profile has been saved.')
      await load()
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!form) {
    return <p className="wa-muted">Loading your profile…</p>
  }

  return (
    <div className="profile-form">
      {err ? <p className="wa-alert">{err}</p> : null}
      {msg ? <p className="wa-success-msg">{msg}</p> : null}

      <section className="wa-form-section">
        <h2 className="wa-form-section-title">About you</h2>
        <div className="wa-form-grid">
          <div>
            <label className="wa-label">Full name</label>
            <input className="wa-field wa-input" value={form.name} onChange={(e) => setField('name', e.target.value)} />
          </div>
          <div>
            <label className="wa-label">Email</label>
            <input className="wa-field wa-input" type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} />
          </div>
        </div>
        <label className="wa-label" style={{ marginTop: 14 }}>Headline</label>
        <input
          className="wa-field wa-input"
          value={form.headline}
          onChange={(e) => setField('headline', e.target.value)}
          placeholder="CS grad · ML & backend · open to remote roles"
        />
      </section>

      <section className="wa-form-section">
        <h2 className="wa-form-section-title">Job preferences</h2>
        <label className="wa-label">Target roles</label>
        <input
          className="wa-field wa-input"
          value={form.roles}
          onChange={(e) => setField('roles', e.target.value)}
          placeholder="Software Engineer, ML Engineer, …"
        />
        <label className="wa-label" style={{ marginTop: 14 }}>Preferred locations</label>
        <input
          className="wa-field wa-input"
          value={form.locations}
          onChange={(e) => setField('locations', e.target.value)}
          placeholder="Remote, San Francisco, …"
        />
        <label className="wa-check" style={{ marginTop: 14 }}>
          <input type="checkbox" checked={form.remote_ok} onChange={(e) => setField('remote_ok', e.target.checked)} />
          Open to remote roles
        </label>
        <label className="wa-label" style={{ marginTop: 14 }}>Target industries</label>
        <input className="wa-field wa-input" value={form.industries} onChange={(e) => setField('industries', e.target.value)} />
        <label className="wa-label" style={{ marginTop: 14 }}>Min salary (USD)</label>
        <input className="wa-field wa-input" type="number" value={form.min_salary} onChange={(e) => setField('min_salary', e.target.value)} />
        <label className="wa-label" style={{ marginTop: 14 }}>Keywords to prioritize</label>
        <input className="wa-field wa-input" value={form.keywords_prioritize} onChange={(e) => setField('keywords_prioritize', e.target.value)} />
        <label className="wa-label" style={{ marginTop: 14 }}>Keywords to reject</label>
        <input className="wa-field wa-input" value={form.keywords_reject} onChange={(e) => setField('keywords_reject', e.target.value)} />
      </section>

      <section className="wa-form-section">
        <h2 className="wa-form-section-title">Work authorization</h2>
        <label className="wa-check">
          <input type="checkbox" checked={form.visa_needed} onChange={(e) => setField('visa_needed', e.target.checked)} />
          Need visa sponsorship
        </label>
        <label className="wa-label" style={{ marginTop: 14 }}>Work authorization</label>
        <input className="wa-field wa-input" value={form.work_authorization} onChange={(e) => setField('work_authorization', e.target.value)} placeholder="e.g. F-1 OPT eligible" />
        <label className="wa-label" style={{ marginTop: 14 }}>Earliest start date</label>
        <input className="wa-field wa-input" value={form.start_date} onChange={(e) => setField('start_date', e.target.value)} placeholder="June 2026" />
      </section>

      <section className="wa-form-section">
        <h2 className="wa-form-section-title">Skills</h2>
        <input
          className="wa-field wa-input"
          value={form.skills}
          onChange={(e) => setField('skills', e.target.value)}
          placeholder="Python, React, PyTorch, …"
        />
      </section>

      <section className="wa-form-section">
        <div className="wa-form-section-head">
          <h2 className="wa-form-section-title">Experience</h2>
          <button
            type="button"
            className="wa-btn wa-btn-ghost wa-btn-sm"
            onClick={() => setField('experiences', [...form.experiences, emptyExperience()])}
          >
            Add role
          </button>
        </div>
        {form.experiences.map((exp, idx) => (
          <div key={idx} className="exp-card">
            <div className="wa-form-grid">
              <div>
                <label className="wa-label">Title</label>
                <input className="wa-field wa-input" value={exp.title} onChange={(e) => setExp(idx, { title: e.target.value })} />
              </div>
              <div>
                <label className="wa-label">Organization</label>
                <input className="wa-field wa-input" value={exp.org} onChange={(e) => setExp(idx, { org: e.target.value })} />
              </div>
            </div>
            <label className="wa-label" style={{ marginTop: 10 }}>Dates</label>
            <input className="wa-field wa-input" value={exp.dates} onChange={(e) => setExp(idx, { dates: e.target.value })} placeholder="Summer 2025" />
            <label className="wa-label" style={{ marginTop: 10 }}>Highlights</label>
            {(exp.bullets || ['']).map((b, bi) => (
              <input
                key={bi}
                className="wa-field wa-input"
                style={{ marginBottom: 8 }}
                value={b}
                onChange={(e) => {
                  const bullets = [...(exp.bullets || [''])]
                  bullets[bi] = e.target.value
                  setExp(idx, { bullets })
                }}
                placeholder="What you accomplished"
              />
            ))}
          </div>
        ))}
      </section>

      <section className="wa-form-section">
        <div className="wa-form-section-head">
          <h2 className="wa-form-section-title">Education</h2>
          <button
            type="button"
            className="wa-btn wa-btn-ghost wa-btn-sm"
            onClick={() => setField('education', [...form.education, { school: '', degree: '', graduation: '', gpa: '' }])}
          >
            Add school
          </button>
        </div>
        {form.education.map((ed, idx) => (
          <div key={idx} className="exp-card">
            <input className="wa-field wa-input" placeholder="School" value={ed.school} onChange={(e) => {
              const education = [...form.education]; education[idx] = { ...ed, school: e.target.value }; setField('education', education)
            }} />
            <input className="wa-field wa-input" style={{ marginTop: 8 }} placeholder="Degree" value={ed.degree} onChange={(e) => {
              const education = [...form.education]; education[idx] = { ...ed, degree: e.target.value }; setField('education', education)
            }} />
          </div>
        ))}
      </section>

      <section className="wa-form-section">
        <div className="wa-form-section-head">
          <h2 className="wa-form-section-title">Projects</h2>
          <button
            type="button"
            className="wa-btn wa-btn-ghost wa-btn-sm"
            onClick={() => setField('projects', [...form.projects, { name: '', tech: '', description: '' }])}
          >
            Add project
          </button>
        </div>
        {form.projects.map((pr, idx) => (
          <div key={idx} className="exp-card">
            <input className="wa-field wa-input" placeholder="Project name" value={pr.name} onChange={(e) => {
              const projects = [...form.projects]; projects[idx] = { ...pr, name: e.target.value }; setField('projects', projects)
            }} />
            <input className="wa-field wa-input" style={{ marginTop: 8 }} placeholder="Tech stack" value={pr.tech} onChange={(e) => {
              const projects = [...form.projects]; projects[idx] = { ...pr, tech: e.target.value }; setField('projects', projects)
            }} />
          </div>
        ))}
      </section>

      <section className="wa-form-section">
        <h2 className="wa-form-section-title">Answer style</h2>
        <label className="wa-label">Tone</label>
        <select className="wa-field wa-input" value={form.answer_tone} onChange={(e) => setField('answer_tone', e.target.value)}>
          <option value="professional">Professional</option>
          <option value="concise">Concise</option>
          <option value="warm">Warm</option>
        </select>
        <label className="wa-label" style={{ marginTop: 14 }}>Notes for generated answers</label>
        <textarea className="wa-field" rows={3} value={form.answer_notes} onChange={(e) => setField('answer_notes', e.target.value)} />
      </section>

      <section className="wa-form-section">
        <h2 className="wa-form-section-title">Resume</h2>
        <p className="wa-muted" style={{ marginTop: 0, marginBottom: 10 }}>
          Paste or edit the full text used for matching and application answers.
        </p>
        <textarea className="wa-field" rows={12} value={resume} onChange={(e) => setResume(e.target.value)} />
      </section>

      <button type="button" className="wa-btn wa-btn-primary" disabled={busy} onClick={onSave}>
        Save profile
      </button>
    </div>
  )
}
