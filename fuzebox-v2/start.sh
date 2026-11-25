#!/bin/bash
# All-in-one container: Nginx + FastAPI.
# Prefer docker compose for production: Next.js on :3000, API on :8000.

echo "Starting Fuzebox (monolithic image)..."

python webhook_server.py &

# For the Next.js dashboard, use: docker compose up → http://localhost:3000
nginx -g "daemon off;"
