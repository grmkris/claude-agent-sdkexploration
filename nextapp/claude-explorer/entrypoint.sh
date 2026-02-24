#!/bin/bash
set -e

# Make bun globals + postgres binaries available to all child processes
export PATH="/usr/lib/postgresql/17/bin:/home/bun/.bun/bin:/home/bun/.local/bin:$PATH"

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

    DESIRED_HOSTNAME="${TS_HOSTNAME:-${INSTANCE_NAME:-claude-explorer}}"

    tailscale up \
        --authkey="$TS_AUTHKEY" \
        --hostname="$DESIRED_HOSTNAME" \
        --ssh \
        --accept-dns=false

    # Fix hostname conflict: if Tailscale appended a suffix (-1, -2), force the desired name
    ACTUAL_HOSTNAME=$(tailscale status --self --json | jq -r '.Self.HostName // empty')
    if [ -n "$ACTUAL_HOSTNAME" ] && [ "$ACTUAL_HOSTNAME" != "$DESIRED_HOSTNAME" ]; then
        echo "[tailscale] hostname mismatch: got '$ACTUAL_HOSTNAME', forcing '$DESIRED_HOSTNAME'"
        tailscale set --hostname="$DESIRED_HOSTNAME"
    fi

    echo "[tailscale] up: $(tailscale ip -4)"
fi

# Ensure skeleton dirs exist (volume starts empty on first mount)
mkdir -p /home/bun/.claude /home/bun/.local/bin
chown -R bun:bun /home/bun/.claude /home/bun/.local

# Clean up stale files from earlier deploys (before CLAUDE_CONFIG_DIR was set in shell)
# These are Claude CLI artifacts that got written to ~ instead of ~/.claude
for stale in .credentials.json history.jsonl explorer.json \
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
cat > /home/bun/.bashrc <<BASHRC
export PATH="/home/bun/.bun/bin:/home/bun/.local/bin:\$PATH"
export LANG=en_GB.UTF-8
export LC_ALL=en_GB.UTF-8
export CLAUDE_CONFIG_DIR=/home/bun/.claude

# Colors + prompt
export PS1='\[\033[1;32m\]\u\[\033[0m\]@\[\033[1;34m\]${INSTANCE_NAME:-claude-explorer}\[\033[0m\]:\[\033[1;33m\]\w\[\033[0m\]\\\$ '
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

# ── Postgres ──────────────────────────────────────────────
PG_DATA=/home/bun/pgdata
PG_PORT=45432
mkdir -p "$PG_DATA"
chown postgres:postgres "$PG_DATA"

if [ ! -f "$PG_DATA/PG_VERSION" ]; then
    su postgres -c "initdb -D $PG_DATA"
    sed -i 's/^host.*all.*all.*127.*//' "$PG_DATA/pg_hba.conf"
    cat >> "$PG_DATA/pg_hba.conf" <<'HBA'
local   all   all                 trust
host    all   all   127.0.0.1/32  md5
host    all   all   ::1/128       md5
HBA
    echo "[postgres] initialized at $PG_DATA"
fi

su postgres -c "pg_ctl -D $PG_DATA -l $PG_DATA/postgresql.log -o '-p $PG_PORT' start"
su postgres -c "psql -p $PG_PORT -c \"ALTER USER postgres PASSWORD 'postgres';\"" 2>/dev/null || true
echo "[postgres] running on port $PG_PORT"

# ── Redis ─────────────────────────────────────────────────
REDIS_PORT=46379
redis-server --port $REDIS_PORT --dir /home/bun --daemonize yes --save 60 1
echo "[redis] running on port $REDIS_PORT"

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

# Generate internal RPC token (256-bit, base64url-safe)
export RPC_INTERNAL_TOKEN=$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 43)

# Register claude-explorer MCP server (token changes each boot, so remove + re-add)
MCP_NAME="${INSTANCE_NAME:-claude-explorer}"
su bun -c "claude mcp remove -s user $MCP_NAME" 2>/dev/null || true
su bun -c "claude mcp add -s user $MCP_NAME \
  -e EXPLORER_BASE_URL=http://localhost:${PORT:-3000} \
  -e RPC_INTERNAL_TOKEN=${RPC_INTERNAL_TOKEN} \
  -- bun /app/tools/explorer-server.ts" 2>/dev/null || true

# Strip CLAUDECODE so Agent SDK and Railway CLI work inside this container
unset CLAUDECODE

# Set CLAUDE_CONFIG_DIR so the app finds Claude config at /home/bun/.claude
# (app runs as root, so homedir() would return /root otherwise)
export CLAUDE_CONFIG_DIR=/home/bun/.claude

# --- Restore tmux sessions from explorer.json ---
EXPLORER_JSON="/home/bun/.claude/explorer.json"
if [ -f "$EXPLORER_JSON" ] && command -v jq >/dev/null 2>&1; then
    TMUX_COUNT=$(jq -r '.tmuxSessions // [] | length' "$EXPLORER_JSON" 2>/dev/null || echo 0)
    if [ "$TMUX_COUNT" -gt 0 ]; then
        echo "[tmux-restore] Found $TMUX_COUNT saved session(s), restoring..."
        for i in $(seq 0 $((TMUX_COUNT - 1))); do
            SESSION_NAME=$(jq -r ".tmuxSessions[$i].sessionName" "$EXPLORER_JSON")
            PROJECT_PATH=$(jq -r ".tmuxSessions[$i].projectPath" "$EXPLORER_JSON")
            PANEL_COUNT=$(jq -r ".tmuxSessions[$i].panelCount" "$EXPLORER_JSON")
            LAYOUT=$(jq -r ".tmuxSessions[$i].layout" "$EXPLORER_JSON")
            SKIP_PERMS=$(jq -r ".tmuxSessions[$i].skipPermissions // false" "$EXPLORER_JSON")
            MODEL=$(jq -r ".tmuxSessions[$i].model // empty" "$EXPLORER_JSON")
            MAX_BUDGET=$(jq -r ".tmuxSessions[$i].maxBudgetUsd // empty" "$EXPLORER_JSON")

            # Validate project path exists
            if [ ! -d "$PROJECT_PATH" ]; then
                echo "[tmux-restore] Skipping $SESSION_NAME: $PROJECT_PATH not found"
                continue
            fi

            # Skip if session already exists
            if su bun -c "tmux has-session -t '$SESSION_NAME'" 2>/dev/null; then
                echo "[tmux-restore] Skipping $SESSION_NAME: already exists"
                continue
            fi

            # Build claude command for a given pane index
            build_claude_cmd() {
                local idx=$1
                # Check for custom command first
                local custom_cmd
                custom_cmd=$(jq -r ".tmuxSessions[$i].customCommands[$idx] // empty" "$EXPLORER_JSON")
                if [ -n "$custom_cmd" ]; then
                    echo "$custom_cmd"
                    return
                fi

                local parts="claude"
                # Check for resume session ID
                local resume_id
                resume_id=$(jq -r ".tmuxSessions[$i].resumeSessionIds[$idx] // empty" "$EXPLORER_JSON")
                if [ -n "$resume_id" ]; then
                    # Verify the .jsonl file exists before using --resume
                    local jsonl_path="/home/bun/.claude/projects/-home-bun${PROJECT_PATH//\//-}/$resume_id.jsonl"
                    if [ -f "$jsonl_path" ]; then
                        parts="$parts --resume $resume_id"
                    fi
                fi
                if [ "$SKIP_PERMS" = "true" ]; then
                    parts="$parts --dangerously-skip-permissions"
                fi
                if [ -n "$MODEL" ]; then
                    parts="$parts --model $MODEL"
                fi
                if [ -n "$MAX_BUDGET" ]; then
                    parts="$parts --max-budget-usd $MAX_BUDGET"
                fi
                echo "$parts"
            }

            # Create tmux session
            FIRST_CMD=$(build_claude_cmd 0)
            su bun -c "tmux new-session -d -s '$SESSION_NAME' -c '$PROJECT_PATH' '$FIRST_CMD'"

            # Add extra panes
            for p in $(seq 1 $((PANEL_COUNT - 1))); do
                PANE_CMD=$(build_claude_cmd "$p")
                SPLIT_DIR="-h"
                if [ "$LAYOUT" = "even-vertical" ] || [ "$LAYOUT" = "main-vertical" ]; then
                    SPLIT_DIR="-v"
                fi
                su bun -c "tmux split-window $SPLIT_DIR -t '$SESSION_NAME' -c '$PROJECT_PATH' '$PANE_CMD'"
            done

            # Apply layout
            if [ "$PANEL_COUNT" -gt 1 ]; then
                su bun -c "tmux select-layout -t '$SESSION_NAME' '$LAYOUT'" 2>/dev/null || true
            fi

            echo "[tmux-restore] Restored $SESSION_NAME ($PANEL_COUNT pane(s))"
        done
    fi
fi

# App processes run as bun user (/app is 755 so bun can read/execute)
cd /app
su bun -c "bun cron-worker.ts" &
CRON_PID=$!

su bun -c "bun --bun next start -p ${PORT:-3000}" &
NEXT_PID=$!

# Trap signals to shut down all
trap "kill $TS_PID $CRON_PID $NEXT_PID 2>/dev/null; su postgres -c 'pg_ctl -D /home/bun/pgdata stop -m fast' 2>/dev/null; redis-cli -p 46379 shutdown nosave 2>/dev/null; exit 0" SIGTERM SIGINT

# Wait for either to exit
wait -n $CRON_PID $NEXT_PID
EXIT_CODE=$?

# If one dies, kill the other
kill $TS_PID $CRON_PID $NEXT_PID 2>/dev/null
exit $EXIT_CODE
