"""Service-health and browser-map configuration endpoints."""

from fastapi import APIRouter

from ..api_models import ErrorResponse, HealthResponse, MapConfigResponse
from ..settings import APP_VERSION, amap_js_credentials, amap_web_service_key


router = APIRouter()


@router.get(
    "/api/health",
    tags=["system"],
    response_model=HealthResponse,
    responses={500: {"model": ErrorResponse}},
)
def health_check() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "nanjing-travel-webgis-backend",
        "version": APP_VERSION,
    }


@router.get(
    "/api/map/config",
    tags=["map"],
    response_model=MapConfigResponse,
)
def map_config() -> dict[str, str | bool | None]:
    js_key, security_code = amap_js_credentials()
    required = {
        "VITE_AMAP_JS_KEY": js_key,
        "AMAP_JS_SECURITY_CODE": security_code,
        "AMAP_WEB_SERVICE_KEY": amap_web_service_key(),
    }
    missing = [name for name, value in required.items() if not value]
    enabled = not missing
    return {
        "enabled": enabled,
        "js_key": js_key if enabled else None,
        "security_proxy_url": "/_AMapService" if enabled else None,
        "message": "地图配置可用" if enabled else "请先在根目录 .env 填写：" + "、".join(missing) + "。保存后重启前后端。",
    }
