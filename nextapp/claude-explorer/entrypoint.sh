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

# Ensure skeleton dirs exist (volume starts empty on first mount)
mkdir -p /home/bun/.claude /home/bun/projects /home/bun/.local/bin
chown -R bun:bun /home/bun/.claude /home/bun/projects /home/bun/.local

# Provision .bashrc if missing (volume replaces build-time home)
if [ ! -f /home/bun/.bashrc ]; then
    cat > /home/bun/.bashrc <<'BASHRC'
export PATH="/home/bun/.local/bin:$PATH"
export LANG=en_GB.UTF-8
export LC_ALL=en_GB.UTF-8
alias ll="ls -la"
alias la="ls -A"
alias l="ls -CF"
export CLAUDE_CONFIG_DIR=/home/bun/.claude
BASHRC
    chown bun:bun /home/bun/.bashrc
fi

# Install Claude CLI if missing (volume replaces .local/bin from image)
if [ ! -f /home/bun/.local/bin/claude ]; then
    su bun -c 'curl -fsSL https://claude.ai/install.sh | bash' || true
fi

# Provision Claude config — only on first boot
CONFIG_SRC=/opt/claude-config
CONFIG_DST=/home/bun/.claude

if [ -d "$CONFIG_SRC" ]; then
    [ -f "$CONFIG_DST/settings.json" ] || cp "$CONFIG_SRC/settings.json" "$CONFIG_DST/settings.json"
    [ -f "$CONFIG_DST/statusline-wrapper.sh" ] || cp "$CONFIG_SRC/statusline-wrapper.sh" "$CONFIG_DST/statusline-wrapper.sh"
    [ -f "$CONFIG_DST/statusline-command.sh" ] || cp "$CONFIG_SRC/statusline-command.sh" "$CONFIG_DST/statusline-command.sh"
    chmod +x "$CONFIG_DST/statusline-wrapper.sh" "$CONFIG_DST/statusline-command.sh" 2>/dev/null
    chown bun:bun "$CONFIG_DST/settings.json" "$CONFIG_DST/statusline-wrapper.sh" "$CONFIG_DST/statusline-command.sh" 2>/dev/null
    echo "[claude-config] provisioned"
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
