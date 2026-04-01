FROM oven/bun:1.3-alpine

WORKDIR /app

COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY server/package.json server/
COPY daemon/package.json daemon/

RUN bun install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY server/ server/
COPY daemon/ daemon/

EXPOSE 4000
CMD ["bun", "run", "server/src/index.ts"]
