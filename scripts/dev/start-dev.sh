#!/bin/bash

BACKEND_PORT=5678
FRONTEND_API_TARGET="http://127.0.0.1:$BACKEND_PORT"

echo "=========================================="
echo "Backend Port: $BACKEND_PORT"
echo "API Target  : $FRONTEND_API_TARGET"
echo "=========================================="

BACKEND_CMD="cd packages/backend && PORT=$BACKEND_PORT pnpm start:dev"

FRONTEND_CMD="wait-on tcp:127.0.0.1:$BACKEND_PORT && cd packages/frontend && VITE_API_TARGET=$FRONTEND_API_TARGET pnpm dev"

echo "Starting services in parallel..."

pnpm exec concurrently -k -n "BACKEND,FRONTEND" -c "blue,magenta" "$BACKEND_CMD" "$FRONTEND_CMD"
