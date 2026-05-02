# Single-service deploy: builds Vite frontend, then runs FastAPI backend
# which also serves the built static files. One Railway service, one URL.

# ---------- Stage 1: build frontend ----------
FROM node:20-slim AS frontend
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js eslint.config.js ./
COPY public ./public
COPY src ./src

# Vite reads VITE_* env vars at build time and bakes them into the bundle.
# Railway exposes service env vars to the build via --build-arg; we must
# re-declare each one as ARG, then promote to ENV so `npm run build` sees it.
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY}

# Empty VITE_API_URL → api.js uses relative URLs → same origin as backend.
ENV VITE_API_URL=""
RUN npm run build

# ---------- Stage 2: python runtime ----------
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

# OR-Tools needs libstdc++; build-essential covers any wheel fallbacks
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --upgrade pip && pip install -r backend/requirements.txt

COPY backend ./backend
COPY --from=frontend /app/dist ./dist

EXPOSE 8000

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
