# FuzeBox

Two apps that run side by side:

| Folder | What it is | Stack | Local URL |
|---|---|---|---|
| [`fuzebox-v2/`](fuzebox-v2/README.md) | Agent workforce dashboard and webhook API | Next.js, FastAPI, Postgres | http://localhost:3000 (API on :8000) |
| [`aeos/`](aeos/README.md) | AEOS — Economic Cognition Layer | Express, React (Vite), Postgres | http://localhost:5000 |

AEOS uses the Postgres container that `fuzebox-v2`'s `docker-compose.yml` starts, so bring v2 up first.

## Run locally

Requires Docker and Node.js 20+.

### 1. fuzebox-v2

```bash
cd fuzebox-v2
cp .env.example .env          # set CLAUDE_API_KEY if you want to run agents
docker compose up --build     # dashboard :3000, API :8000, Postgres :5433
```

### 2. AEOS

```bash
cd aeos
cp .env.example .env
npm install
docker exec fuzebox-postgres createdb -U fuzebox fuzebox-aeos   # once
npm run db:push                                                 # once
npm run dev                   # http://localhost:5000
```

## Sign in

Both apps create a default account on first run:

| App | Username | Password |
|---|---|---|
| fuzebox-v2 | `admin` | `changeme` |
| AEOS | `admin` | `changeme` |

These are for local development only. Override them with `ADMIN_USERNAME` / `ADMIN_PASSWORD` in each app's `.env`.

## Demo data

- **AEOS** fills its default workspace with synthetic demo data on first run (set `SEED_DEMO_DATA=false` in `aeos/.env` to skip).
- **fuzebox-v2** starts empty: sign in and click **Load demo data** on the Overview page.
