from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
APP_ROOT = BACKEND_DIR.parent
LIB_ROOT = APP_ROOT / "lib"
OFFICES_DIR = APP_ROOT / "office"

if str(LIB_ROOT) not in sys.path:
    sys.path.insert(0, str(LIB_ROOT))

from office_server import create_office_app  # noqa: E402
from job_routes import router as job_router  # noqa: E402

app = create_office_app(
    title="Job Hunter API",
    user_offices_dir=OFFICES_DIR,
    backend_dir=BACKEND_DIR,
    extra_routers=[job_router],
)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "app": "Job Hunter API",
        "ui": "http://localhost:5174",
        "health": "/api/health",
        "docs": "/docs",
    }
