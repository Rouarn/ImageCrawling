#!/bin/bash

BACKEND_PORT=5678
FRONTEND_API_TARGET="http://localhost:$BACKEND_PORT"

echo "=========================================="
echo "Backend Port: $BACKEND_PORT"
echo "API Target  : $FRONTEND_API_TARGET"
echo "=========================================="

BACKEND_CMD="cd backend && PORT=$BACKEND_PORT pnpm start:dev"

FRONTEND_CMD="wait-on tcp:$BACKEND_PORT && cd frontend && VITE_API_TARGET=$FRONTEND_API_TARGET pnpm dev"

echo "Starting services in parallel..."

pnpm exec concurrently -k -n "BACKEND,FRONTEND" -c "blue,magenta" "$BACKEND_CMD" "$FRONTEND_CMD"
