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
    TS_PID=$!

    # Wait for tailscaled ready (up to 15s)
    for i in $(seq 1 30); do
        tailscale status --socket=/var/run/tailscale/tailscaled.sock >/dev/null 2>&1 && break
        sleep 0.5
    done

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
trap "kill $TS_PID $CRON_PID $NEXT_PID 2>/dev/null; exit 0" SIGTERM SIGINT

# Wait for either to exit
wait -n $CRON_PID $NEXT_PID
EXIT_CODE=$?

# If one dies, kill the other
kill $TS_PID $CRON_PID $NEXT_PID 2>/dev/null
exit $EXIT_CODE
