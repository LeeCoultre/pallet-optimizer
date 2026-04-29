# Backend für Pallet Optimizer / Lagerauftrag-Parser
# Deploy-Targets: Railway.app, Render, Fly.io (alles was Docker kann)

FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

# System dependencies for OR-Tools (CP-SAT solver) and uvicorn
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps separately for better layer caching
COPY requirements.txt ./
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

# Copy app source
COPY . .

# Railway/Render injects $PORT env var; default to 8000 locally
EXPOSE 8000

# Production server (uvicorn standard variant has uvloop + httptools)
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
