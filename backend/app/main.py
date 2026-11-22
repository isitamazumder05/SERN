import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database.connection import engine
from app.database.base import Base
import app.models  # Ensure all SQLAlchemy models are registered
from app.routes import (
    health_router,
    accidents_router,
    ambulances_router,
    emergencies_router,
    hospitals_router,
    notifications_router,
    routing_router,
    coordination_router,
)

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("sern.app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Application startup: Create database tables
    logger.info("Initializing database tables for SERN MVP...")
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables initialized successfully.")
    yield
    # Application shutdown
    logger.info("Shutting down SERN application...")


app = FastAPI(
    title=settings.APP_NAME,
    description=(
        "SERN (Smart Emergency Response Network) Backend MVP API. "
        "Coordinates vehicle accident detection, explicit confirmation, nearest-ambulance dispatch, "
        "emergency lifecycle management, hospital alerts, and Member 4 routing boundary integration."
    ),
    version="1.0.0",
    lifespan=lifespan
)

# CORS Middleware
# Standard CORS security: allow_credentials=True cannot be combined with wildcard origins ["*"].
origins = settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else [settings.CORS_ORIGINS]
is_wildcard = origins == ["*"] or (len(origins) == 1 and origins[0] == "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False if is_wildcard else True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Exception handler for unhandled errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception at %s %s: %s", request.method, request.url, exc, exc_info=True)
    content = {"detail": "Internal server error occurred."}
    if settings.DEBUG:
        content["error"] = str(exc)
    return JSONResponse(
        status_code=500,
        content=content
    )


# Register API Routers under /api
app.include_router(health_router, prefix="/api")
app.include_router(accidents_router, prefix="/api")
app.include_router(ambulances_router, prefix="/api")
app.include_router(emergencies_router, prefix="/api")
app.include_router(hospitals_router, prefix="/api")
app.include_router(notifications_router, prefix="/api")
app.include_router(routing_router, prefix="/api")
app.include_router(coordination_router, prefix="/api")


@app.get("/")
def root():
    return {
        "service": settings.APP_NAME,
        "docs_url": "/docs",
        "health_url": "/api/health"
    }

