from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.settings import settings
from .routers import auth, health, audit

app = FastAPI(title="Confianet API")

# CORS for frontend at http://localhost:3000 by default
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["health"])
def read_root() -> dict[str, str]:
    """Return service health message."""
    return {"message": "ok"}


app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(audit.router, prefix="/api/audit", tags=["audit"])
