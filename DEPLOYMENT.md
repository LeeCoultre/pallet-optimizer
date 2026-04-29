# Deployment

Зачем 2 платформы: Cloudflare Workers не поддерживает Python+OR-Tools.
Решение: статика на Cloudflare, Python-бэкенд на Railway/Render.

## 1. Backend → Railway.app (рекомендую)

```bash
# 1. Зарегистрируйся на railway.app (через GitHub)
# 2. New Project → Deploy from GitHub repo → выбираешь pallet-optimizer
# 3. Настройки сервиса:
#    Root Directory:  backend
#    Start Command:   (auto-detect из Dockerfile)
# 4. Дождись деплоя → откроется https://<твой-проект>.up.railway.app
# 5. В Settings → Networking → "Generate Domain" чтобы получить публичный URL
```

Альтернативы: **Render.com** (есть бесплатный тариф), **Fly.io** (требует CLI).

После деплоя проверь:
```bash
curl https://<твой-backend>.up.railway.app/healthz   # 200 OK
```

## 2. Frontend → Cloudflare Pages

```bash
# Вариант A: через GitHub
# 1. Cloudflare Dashboard → Pages → Connect to Git
# 2. Выбираешь репо pallet-optimizer
# 3. Build settings:
#      Framework preset:  None / Vite
#      Build command:     npm run build
#      Output directory:  dist
# 4. Environment variables:
#      VITE_API_URL = https://<твой-backend>.up.railway.app
# 5. Deploy

# Вариант B: вручную через wrangler CLI
npm install -g wrangler
npm run build
wrangler pages deploy dist --project-name pallet-optimizer
```

После деплоя получишь `https://pallet-optimizer.pages.dev`.

## 3. Локальная проверка прод-сборки

```bash
# Frontend
cd /path/to/pallet-optimizer
VITE_API_URL=http://localhost:8000 npm run build
npx serve dist -p 4173

# Backend (в отдельном терминале)
cd backend
docker build -t pallet-backend .
docker run -p 8000:8000 pallet-backend
```

## 4. Файлы для деплоя (уже подготовлены)

- `backend/Dockerfile` — Docker для Railway/Render
- `backend/.dockerignore` — exclude неважных файлов
- `public/_redirects` — SPA fallback для Cloudflare Pages
- `public/_headers` — security headers + cache для assets
- `src/api.js` — читает `VITE_API_URL` из env

## 5. Что не работает на чистом Cloudflare без backend

- `/api/pack` — 3D-bin packing (использует CP-SAT)
- `/api/single-layer` — single-layer optimization

Эти эндпоинты доступны только если backend задеплоен.

**Lagerauftrag страница** — полностью клиент-сайд (mammoth.js парсит .docx
прямо в браузере), работает БЕЗ бэкенда.
