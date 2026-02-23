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
RUN echo 'export PATH="/home/bun/.local/bin:$PATH"' >> /home/bun/.bashrc \
    && echo 'export LANG=en_GB.UTF-8' >> /home/bun/.bashrc \
    && echo 'export LC_ALL=en_GB.UTF-8' >> /home/bun/.bashrc \
    && echo 'alias ll="ls -la"' >> /home/bun/.bashrc \
    && echo 'alias la="ls -A"' >> /home/bun/.bashrc \
    && echo 'alias l="ls -CF"' >> /home/bun/.bashrc \
    && echo 'export CLAUDE_CONFIG_DIR=/home/bun/.claude' >> /home/bun/.bashrc

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
