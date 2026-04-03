FROM oven/bun:1.3-alpine

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

COPY package.json bun.lock tsconfig.json drizzle.config.ts ./
COPY packages/shared/package.json packages/shared/
COPY server/package.json server/
COPY daemon/package.json daemon/

RUN bun install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY server/ server/
COPY daemon/ daemon/

# Entrypoint script: push schema then start server
COPY scripts/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["/docker-entrypoint.sh"]
