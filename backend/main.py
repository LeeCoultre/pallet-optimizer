from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from .routers import auftraege, history, packing, users, xlsx_import

app = FastAPI(title="Pallet Loading Optimizer", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(packing.router, prefix="/api", tags=["packing"])
app.include_router(xlsx_import.router, prefix="/api", tags=["import"])
app.include_router(auftraege.router)  # /api/auftraege
app.include_router(users.router)      # /api/users, /api/me
app.include_router(history.router)    # /api/history


@app.get("/health")
async def health():
    return {"status": "ok"}


# Serve built frontend if present (single-service deploy on Railway).
# In dev (no dist/) the frontend runs on Vite at :5176 and just hits /api here.
dist_dir = Path(__file__).resolve().parent.parent / "dist"
if dist_dir.exists():
    assets_dir = dist_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    index_file = dist_dir / "index.html"

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        candidate = dist_dir / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index_file)
