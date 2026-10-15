"""Backend process settings shared by the application assembly and routers."""

import os
from pathlib import Path

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")

APP_VERSION = "0.6.0"
FRONTEND_HOST = os.getenv("FRONTEND_HOST", "127.0.0.1")
FRONTEND_PORT = os.getenv("FRONTEND_PORT", "5173")
FRONTEND_PREVIEW_PORT = os.getenv("FRONTEND_PREVIEW_PORT", "4173")

# Reserve ten seconds before the browser's 120-second planning timeout.
PLAN_TIMEOUT_SECONDS = 110.0
AMAP_REQUEST_TIMEOUT_SECONDS = 15.0
AMAP_WEB_CONCURRENCY = 6
AMAP_WEB_MAX_CONNECTIONS = 12
AMAP_WEB_KEEPALIVE_CONNECTIONS = 6
AMAP_PROXY_MAX_CONNECTIONS = 16
AMAP_PROXY_KEEPALIVE_CONNECTIONS = 8
AMAP_POI_CACHE_SECONDS = 300.0
AMAP_ROUTE_CACHE_SECONDS = 60.0
AMAP_CACHE_CAPACITY = 128


def frontend_origins() -> list[str]:
    """Return the local development and preview origins accepted by CORS."""
    return [
        f"http://{FRONTEND_HOST}:{FRONTEND_PORT}",
        f"http://localhost:{FRONTEND_PORT}",
        f"http://{FRONTEND_HOST}:{FRONTEND_PREVIEW_PORT}",
        f"http://localhost:{FRONTEND_PREVIEW_PORT}",
    ]


def amap_js_credentials() -> tuple[str, str]:
    """Read browser credentials without exposing the security code to the frontend."""
    return (
        os.getenv("VITE_AMAP_JS_KEY", "").strip(),
        os.getenv("AMAP_JS_SECURITY_CODE", "").strip(),
    )


def amap_web_service_key() -> str:
    """Read the separate server-side Web Service credential."""
    return os.getenv("AMAP_WEB_SERVICE_KEY", "").strip()


def qweather_credentials() -> tuple[str, str]:
    """Read weather credentials only on the backend, never in Vite's public config."""
    return (
        os.getenv("QWEATHER_API_HOST", "").strip(),
        os.getenv("QWEATHER_API_KEY", "").strip(),
    )
