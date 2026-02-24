FROM oven/bun:1 AS base

# System packages + locale (as root)
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates dumb-init curl locales \
    && sed -i '/en_GB.UTF-8/s/^# //g' /etc/locale.gen && locale-gen \
    && rm -rf /var/lib/apt/lists/*

ENV LANG=en_GB.UTF-8
ENV LC_ALL=en_GB.UTF-8

# Dev tools for SSH sessions
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    vim \
    nano \
    tmux \
    htop \
    less \
    jq \
    fzf \
    procps \
    man-db \
    unzip \
    sudo \
    iproute2 \
    dnsutils \
    lsof \
    net-tools \
    gh \
    && rm -rf /var/lib/apt/lists/*

# Set bash as login shell (Tailscale SSH uses login shell; default /bin/sh won't source .bashrc)
RUN usermod -s /bin/bash bun

# Tailscale (needs root to install)
RUN curl -fsSL https://tailscale.com/install.sh | sh

# Allow bun user to run tailscaled via sudo without password
RUN echo "bun ALL=(root) NOPASSWD: /usr/sbin/tailscaled" >> /etc/sudoers.d/bun-tailscale \
    && chmod 0440 /etc/sudoers.d/bun-tailscale

# Claude CLI — install as bun user so it goes to /home/bun/.local/bin/
USER bun
RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="/home/bun/.local/bin:$PATH"

# Persist PATH + locale + shell UX for SSH sessions (Tailscale SSH doesn't inherit Docker ENV)
# Uses printf %s to avoid dash echo interpreting \033 as ESC bytes
RUN printf '%s\n' \
    'export PATH="/home/bun/.local/bin:$PATH"' \
    'export LANG=en_GB.UTF-8' \
    'export LC_ALL=en_GB.UTF-8' \
    'export CLAUDE_CONFIG_DIR=/home/bun/.claude' \
    'export PS1='"'"'\[\033[1;32m\]\u\[\033[0m\]@\[\033[1;34m\]claude-explorer\[\033[0m\]:\[\033[1;33m\]\w\[\033[0m\]\$ '"'"'' \
    'export LS_COLORS='"'"'di=1;34:ln=1;36:so=1;35:pi=33:ex=1;32:bd=1;33:cd=1;33'"'"'' \
    'alias ls="ls --color=auto"' \
    'alias ll="ls -la --color=auto"' \
    'alias la="ls -A --color=auto"' \
    'alias l="ls -CF --color=auto"' \
    'alias grep="grep --color=auto"' \
    > /home/bun/.bashrc

# Safety net: .profile sources .bashrc (for shells that source .profile instead)
RUN printf '%s\n' '[ -f ~/.bashrc ] && . ~/.bashrc' > /home/bun/.profile

# Tmux: enable mouse scrolling for SSH sessions
RUN printf '%s\n' 'set -g mouse on' > /home/bun/.tmux.conf

# Entrypoint (changes rarely — cache before source copy)
USER root
COPY --chown=bun:bun entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Claude remote config (provisioned to volume at boot by entrypoint)
COPY --chown=bun:bun claude-remote-config/ /opt/claude-config/

# Create app dir owned by bun before switching user
RUN mkdir -p /app && chown bun:bun /app

WORKDIR /app

# Install deps as bun user
COPY --chown=bun:bun package.json bun.lock ./
USER bun
RUN bun install --frozen-lockfile

# Copy source + build
COPY --chown=bun:bun . .
RUN bun --bun next build

# Lock /app — root-only, bun user has zero access
USER root
RUN chown -R root:root /app && chmod -R 700 /app

# Create user workspace skeleton
RUN mkdir -p /home/bun/projects && chown bun:bun /home/bun/projects

WORKDIR /home/bun

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV CLAUDE_CONFIG_DIR=/home/bun/.claude

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

USER root
ENTRYPOINT ["dumb-init", "--"]
CMD ["/entrypoint.sh"]
