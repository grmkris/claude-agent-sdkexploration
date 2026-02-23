#!/bin/bash
set -e

# Start Tailscale if auth key present (needs root)
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

# Ensure volume dir ownership (Railway volume mounts as root)
chown -R bun:bun /home/bun/.claude 2>/dev/null || true

# Provision Claude config from baked-in defaults
CONFIG_SRC=/opt/claude-config
CONFIG_DST=/home/bun/.claude

if [ -d "$CONFIG_SRC" ]; then
    cp -f "$CONFIG_SRC/settings.json" "$CONFIG_DST/settings.json"
    cp -f "$CONFIG_SRC/statusline-wrapper.sh" "$CONFIG_DST/statusline-wrapper.sh"
    cp -f "$CONFIG_SRC/statusline-command.sh" "$CONFIG_DST/statusline-command.sh"
    chmod +x "$CONFIG_DST/statusline-wrapper.sh" "$CONFIG_DST/statusline-command.sh"
    chown bun:bun "$CONFIG_DST/settings.json" "$CONFIG_DST/statusline-wrapper.sh" "$CONFIG_DST/statusline-command.sh"
    echo "[claude-config] status line provisioned"
fi

# App processes run as root from /app (bun user has no access to /app)
cd /app
bun cron-worker.ts &
CRON_PID=$!

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
