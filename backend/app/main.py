"""FastAPI application assembly.

Business endpoints and error handling live in focused modules; this file remains
the stable Uvicorn entry point: ``backend.app.main:app``.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .errors import register_exception_handlers
from .routers.attractions import router as attractions_router
from .routers.duck_culture import router as duck_culture_router
from .routers.duck_restaurants import router as duck_restaurants_router
from .routers.map_services import router as map_services_router
from .routers.plans import router as plans_router
from .routers.plan_trace import router as plan_trace_router
from .routers.system import router as system_router
from .settings import APP_VERSION, frontend_origins
from .amap_transport import AMapTransportMiddleware, amap_session


@asynccontextmanager
async def lifespan(application: FastAPI):
    async with amap_session() as transport:
        application.state.amap_transport = transport
        yield


app = FastAPI(
    title="Nanjing Travel WebGIS API",
    lifespan=lifespan,
    version=APP_VERSION,
    description=(
        "Stable local backend boundary for the Nanjing travel planning WebGIS "
        "project."
    ),
)

app.add_middleware(AMapTransportMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

register_exception_handlers(app)
app.include_router(system_router)
app.include_router(map_services_router)
app.include_router(attractions_router)
app.include_router(plans_router)
app.include_router(plan_trace_router)
app.include_router(duck_culture_router)
app.include_router(duck_restaurants_router)
