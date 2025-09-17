# Skylark Labs: Real-Time Multi-Camera Face Detection Dashboard

This repository contains a microservices setup:

- Backend API (Hono + TypeScript + Prisma + PostgreSQL)
- Frontend (React + Vite + MUI)
- Worker (Golang + Gin + OpenCV + FFmpeg)
- MediaMTX (WebRTC/RTSP proxy)
- PostgreSQL

## Quick start (Docker)

1. Clone the repo and ensure Docker is installed.
2. Start services:

```bash
docker compose up -d --build
```

3. Run database migrations and seed user:

```bash
docker compose exec backend npx prisma migrate deploy
docker compose exec -e SEED_USERNAME=admin -e SEED_PASSWORD=admin123 backend node -e "import('./dist/index.js');"  # warms container
docker compose exec backend npx tsx prisma/seed.ts
```

4. Open the app: `http://localhost:5173` (login: `admin` / `admin123`).

Backend API: `http://localhost:8080`

MediaMTX WebRTC: `http://localhost:8888`

## Development (local)

- Backend:
  - `cd backend && npm i && npm run dev`
  - copy `.env.example` to `.env` and set `DATABASE_URL`
  - `npx prisma migrate dev`
- Frontend:
  - `cd frontend && npm i && npm run dev`
- Worker:
  - Requires OpenCV and FFmpeg installed locally, or run via Docker.

## Notes

- Worker publishes processed streams to `rtsp://mediamtx:8554/camera-<id>`. The frontend connects via MediaMTX WHEP to play WebRTC.
- Alerts are pushed to clients over a WebSocket at `/ws` authenticated with the JWT token query param.

## Tests (basic idea)

- Add API route tests with a supertest-like library (not included to keep setup minimal). Frontend component tests can be added with Vitest/RTL.
