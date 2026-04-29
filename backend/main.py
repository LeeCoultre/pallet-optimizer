import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .routers import packing, xlsx_import

app = FastAPI(title="Pallet Loading Optimizer", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(packing.router, prefix="/api", tags=["packing"])
app.include_router(xlsx_import.router, prefix="/api", tags=["import"])


@app.get("/health")
async def health():
    return {"status": "ok"}


# Serve built frontend LAST (catches remaining paths with html=True)
dist_dir = Path(__file__).parent.parent / "dist"
if dist_dir.exists():
    app.mount("/", StaticFiles(directory=str(dist_dir), html=True), name="static")
