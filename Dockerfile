FROM oven/bun:1.4.4-slim
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile && bun run build
USER bun
ENV DB_PATH=/data/finance.db
EXPOSE 3001
CMD ["bun", "packages/server/src/index.ts"]
