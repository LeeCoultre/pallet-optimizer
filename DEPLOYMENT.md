# Deployment

Проект разворачивается одним сервисом на **Railway**: тот же контейнер
собирает Vite-фронтенд и поднимает FastAPI-бэкенд, который отдаёт и
`/api/*`, и собранную статику из `dist/`. Один URL, без CORS-проблем.

## Файлы деплоя

- `Dockerfile` (корень) — multi-stage: Node 20 (build frontend) → Python 3.11 (runtime)
- `.dockerignore` — исключает `node_modules`, `dist`, `.git`, кэш Python
- `railway.json` — указывает Railway использовать корневой Dockerfile + healthcheck `/health`

## Деплой на Railway (через GitHub)

1. Залогинься на https://railway.app через GitHub.
2. **New Project** → **Deploy from GitHub repo** → выбери репозиторий.
3. Railway увидит `railway.json` и `Dockerfile` в корне и начнёт билд.
   - Builder: `DOCKERFILE`
   - Healthcheck: `GET /health` (вернёт `{"status":"ok"}`)
4. После успешного деплоя: **Settings → Networking → Generate Domain** —
   получишь публичный URL вида `https://<project>.up.railway.app`.
5. Открывай URL — фронтенд загрузится, и его `fetch('/api/...')` пойдёт
   в тот же контейнер.

### Переменные окружения

Ничего обязательного. Railway сам подставит `$PORT`. Если когда-нибудь
понадобится разделить фронт и бэк — пересобрать фронт с
`VITE_API_URL=https://<backend>.up.railway.app`.

## Локальная проверка прод-сборки

```bash
docker build -t pallet-optimizer .
docker run --rm -p 8000:8000 -e PORT=8000 pallet-optimizer
# открой http://localhost:8000
# проверь: curl http://localhost:8000/health  → {"status":"ok"}
```

## Локальная разработка (без Docker)

```bash
# Терминал 1 — backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# (для dev-режима import в main.py при необходимости поменяй
#  `from .routers` на `from routers`, либо запусти из корня:
#   uvicorn backend.main:app --reload --port 8000)

# Терминал 2 — frontend
npm install
npm run dev   # http://localhost:5176, ходит на http://localhost:8000
```

## Эндпоинты

- `GET /health` — healthcheck для Railway
- `POST /api/pack` — 3D bin packing (CP-SAT через OR-Tools)
- `POST /api/single-layer` — single-layer optimization
- `POST /api/import-xlsx` — парсинг XLSX-заказов
- `GET /*` — отдача SPA (всё, что не `/api/*` и не `/health`)
