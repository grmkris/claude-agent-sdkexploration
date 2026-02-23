FROM oven/bun:1 AS base

# Install runtime deps + Tailscale
RUN apt-get update && apt-get install -y dumb-init curl locales \
    && curl -fsSL https://tailscale.com/install.sh | sh \
    && sed -i '/en_GB.UTF-8/s/^# //g' /etc/locale.gen && locale-gen \
    && rm -rf /var/lib/apt/lists/*

# Install Claude CLI
RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="/root/.claude/bin:$PATH"

WORKDIR /app

# Install deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build Next.js
RUN bun --bun next build

# Entrypoint runs both processes
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV CLAUDE_CONFIG_DIR=/home/bun/.claude

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["/entrypoint.sh"]
