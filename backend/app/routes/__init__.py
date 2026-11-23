from app.routes.health import router as health_router
from app.routes.accidents import router as accidents_router
from app.routes.ambulances import router as ambulances_router
from app.routes.emergencies import router as emergencies_router
from app.routes.hospitals import router as hospitals_router
from app.routes.notifications import router as notifications_router
from app.routes.routing import router as routing_router
from app.routes.coordination import router as coordination_router

__all__ = [
    "health_router",
    "accidents_router",
    "ambulances_router",
    "emergencies_router",
    "hospitals_router",
    "notifications_router",
    "routing_router",
    "coordination_router",
]

