FROM oven/bun:1 AS base

# Install runtime deps for health check + signal handling
RUN apt-get update && apt-get install -y dumb-init curl \
    && rm -rf /var/lib/apt/lists/*

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

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["/entrypoint.sh"]
