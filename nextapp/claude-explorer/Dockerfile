FROM oven/bun:1 AS base

# System packages + locale
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

# Tailscale
RUN curl -fsSL https://tailscale.com/install.sh | sh

# Claude CLI (installs to ~/.local/bin/claude -> ~/.local/share/claude/versions/*)
RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="/root/.local/bin:$PATH"

# Persist PATH + locale for SSH sessions (Tailscale SSH doesn't inherit Docker ENV)
RUN echo 'export PATH="/root/.local/bin:$PATH"' >> /root/.bashrc \
    && echo 'export LANG=en_GB.UTF-8' >> /root/.bashrc \
    && echo 'export LC_ALL=en_GB.UTF-8' >> /root/.bashrc

# Entrypoint (changes rarely — cache before source copy)
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /app

# Install deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source + build
COPY . .
RUN bun --bun next build

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV CLAUDE_CONFIG_DIR=/home/bun/.claude

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["/entrypoint.sh"]
