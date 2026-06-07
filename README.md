# Job Hunter

AI job search assistant built on [DisSysLab](https://github.com/kmchandy/DisSysLab). Continuously scans job boards, screens and matches postings to your profile, tracks applications in a kanban, and generates tailored apply answers.

**Stack:** React (Vite) + FastAPI + DisSysLab office agents

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Python | 3.11+ |
| Node.js | 18+ |
| npm | 9+ |
| Anthropic API key | Required for matching + assistant |

---

## Quick start (clone → run)

```bash
git clone https://github.com/Nyasha2/job-hunter.git
cd job-hunter
chmod +x run_dev.sh backend/run_dev.sh
./run_dev.sh
```

Open **http://localhost:5174**

Set your API key in `backend/.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

---

## First-time setup (manual)

```bash
cd job-hunter

cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
cd ..

npm install
./run_dev.sh
```

**Ports:** API `8001` · UI `5174`

> Wardrobe Assistant uses `8000` / `5173` — all three DisDylab apps can run together on different ports.

---

## Using the app

| Tab | Purpose |
|-----|---------|
| **Dashboard** | Match counts, pipeline stages, recent jobs |
| **Jobs** | Filter/sort cards; accept, save, reject; job detail modal |
| **Applications** | Kanban + table; stage changes, notes, timeline |
| **Assistant** | Onboarding chat; resume → profile; career Q&A |
| **Profile** | Preferences, education, visa, answer style, resume upload |
| **Search runs** | Start/stop DisSysLab office; live job cards during search |
| **Activity** | Technical agent stream |

**Apply help:** Jobs → **Details** → **Generate answers** — paste form questions, get tailored responses (for manual paste on Greenhouse/Lever/etc.).

---

## Office pipeline

```
Sources: Hacker News, Python Jobs, TechCrunch, VentureBeat AI
    → Alex (screener) → Morgan (matcher) → job cards + matched_jobs.jsonl
```

**Rebuild office after editing `office.md`:**

```bash
cd backend
.venv/bin/python -m dissyslab.cli build ../office/job_hunter
```

---

## Architecture

```
job-hunter/
├── backend/              FastAPI — job_routes, job_service
├── lib/
│   ├── office_server/    Bundled DisSysLab web server
│   └── ui/               Shared UI components
├── office/
│   └── job_hunter/       DisSysLab office + roles
└── src/                  React frontend
```

---

## Smoke test

```bash
cd backend
.venv/bin/python smoke_test.py
.venv/bin/python smoke_test.py --api http://127.0.0.1:8001   # if server is up
```

---

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | Yes | Screener/matcher agents + assistant |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Old dissyslab / import errors | Use **venv** uvicorn only: `./run_dev.sh` (not conda/base Python) |
| No jobs after search | Check API key; open **Activity** for agent errors |
| Search stuck | **Search runs** → Stop, then start again |
| `dissyslab>=1.4.0` required | `backend/.venv/bin/pip install -r requirements.txt` |

---

## Roadmap (not yet implemented)

See `job_hunter_app_spec.md` in the monorepo for: browser extension autofill, Postgres domain DB, email/calendar sources, trusted auto-apply.

---

## License

MIT (app code). DisSysLab is a separate dependency — see [DisSysLab](https://github.com/kmchandy/DisSysLab).
