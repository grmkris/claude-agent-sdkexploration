#!/bin/bash
set -e

# Start cron-worker in background
bun cron-worker.ts &
CRON_PID=$!

# Start Next.js
bun --bun next start -p ${PORT:-3000} &
NEXT_PID=$!

# Trap signals to shut down both
trap "kill $CRON_PID $NEXT_PID 2>/dev/null; exit 0" SIGTERM SIGINT

# Wait for either to exit
wait -n $CRON_PID $NEXT_PID
EXIT_CODE=$?

# If one dies, kill the other
kill $CRON_PID $NEXT_PID 2>/dev/null
exit $EXIT_CODE
