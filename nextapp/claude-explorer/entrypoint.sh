#!/bin/bash
set -e

# Make bun globals available to all child processes (Claude Code, cron, etc.)
export PATH="/home/bun/.bun/bin:/home/bun/.local/bin:$PATH"

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
mkdir -p /home/bun/.claude /home/bun/.local/bin
chown -R bun:bun /home/bun/.claude /home/bun/.local

# Clean up stale files from earlier deploys (before CLAUDE_CONFIG_DIR was set in shell)
# These are Claude CLI artifacts that got written to ~ instead of ~/.claude
for stale in .claude.json .credentials.json history.jsonl explorer.json \
             settings.json statusline-command.sh statusline-wrapper.sh; do
    [ -f "/home/bun/$stale" ] && rm -f "/home/bun/$stale"
done
for stale_dir in backups cache debug plans plugins session-env shell-snapshots todos; do
    [ -d "/home/bun/$stale_dir" ] && rm -rf "/home/bun/$stale_dir"
done

# Clean up Claude CLI session dirs that landed in ~/projects instead of ~/.claude/projects
for d in /home/bun/projects/-home-bun*; do
    [ -d "$d" ] && rm -rf "$d"
done

# Always write .bashrc (we own this file; ensures updates reach existing volumes)
cat > /home/bun/.bashrc <<'BASHRC'
export PATH="/home/bun/.bun/bin:/home/bun/.local/bin:$PATH"
export LANG=en_GB.UTF-8
export LC_ALL=en_GB.UTF-8
export CLAUDE_CONFIG_DIR=/home/bun/.claude

# Colors + prompt
export PS1='\[\033[1;32m\]\u\[\033[0m\]@\[\033[1;34m\]claude-explorer\[\033[0m\]:\[\033[1;33m\]\w\[\033[0m\]\$ '
export LS_COLORS='di=1;34:ln=1;36:so=1;35:pi=33:ex=1;32:bd=1;33:cd=1;33'
alias ls="ls --color=auto"
alias ll="ls -la --color=auto"
alias la="ls -A --color=auto"
alias l="ls -CF --color=auto"
alias grep="grep --color=auto"
BASHRC
chown bun:bun /home/bun/.bashrc

# Always write .profile (sources .bashrc for login shells)
cat > /home/bun/.profile <<'PROFILE'
[ -f ~/.bashrc ] && . ~/.bashrc
PROFILE
chown bun:bun /home/bun/.profile

# Always write .tmux.conf (enable mouse scrolling in tmux sessions)
cat > /home/bun/.tmux.conf <<'TMUX'
set -g mouse on
TMUX
chown bun:bun /home/bun/.tmux.conf

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

# Strip CLAUDECODE so Agent SDK and Railway CLI work inside this container
unset CLAUDECODE

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
