"""Production entry point: API and built frontend share one HTTPS origin."""

from pathlib import Path

from fastapi.staticfiles import StaticFiles

from .main import app


FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

# Register last so API routes and the AMap security proxy retain their behavior.
app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
