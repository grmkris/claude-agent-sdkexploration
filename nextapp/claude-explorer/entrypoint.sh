#!/bin/bash
set -e

# Start Tailscale if auth key present
if [ -n "$TS_AUTHKEY" ]; then
    mkdir -p "${TS_STATE_DIR:-/home/bun/.claude/tailscale}"
    mkdir -p /var/run/tailscale
    tailscaled \
        --tun=userspace-networking \
        --statedir="${TS_STATE_DIR:-/home/bun/.claude/tailscale}" \
        --socket=/var/run/tailscale/tailscaled.sock &

    sleep 2

    tailscale up \
        --authkey="$TS_AUTHKEY" \
        --hostname="${TS_HOSTNAME:-claude-explorer}" \
        --ssh \
        --accept-dns=false

    echo "[tailscale] up: $(tailscale ip -4)"
fi

# Start cron-worker in background
bun cron-worker.ts &
CRON_PID=$!

# Start Next.js
bun --bun next start -p ${PORT:-3000} &
NEXT_PID=$!

# Trap signals to shut down all
trap "kill $CRON_PID $NEXT_PID 2>/dev/null; exit 0" SIGTERM SIGINT

# Wait for either to exit
wait -n $CRON_PID $NEXT_PID
EXIT_CODE=$?

# If one dies, kill the other
kill $CRON_PID $NEXT_PID 2>/dev/null
exit $EXIT_CODE
