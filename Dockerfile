# One image for web, migrations and the worker. Build needs no runtime secrets.
FROM node:24.22.1-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@10.6.4
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile --prod=false \
    && pnpm exec next build --webpack \
    && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["sh", "-c", "exec pnpm exec next start --hostname 0.0.0.0 --port ${PORT:-3000}"]
