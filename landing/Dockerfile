FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@10.6.4
WORKDIR /build
COPY . .
RUN pnpm install --frozen-lockfile --prod=false
ARG LANDING_APP_URL=https://app.kleym.xyz
ARG LANDING_SITE_URL=https://kleym.xyz
ARG LANDING_NETWORK=testnet
RUN LANDING_APP_URL="$LANDING_APP_URL" LANDING_SITE_URL="$LANDING_SITE_URL" LANDING_NETWORK="$LANDING_NETWORK" pnpm build:landing

# Runtime contains only public static assets and a dependency-free file server.
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8080
WORKDIR /site
COPY --from=build --chown=node:node /build/landing/dist ./dist
COPY --chown=node:node landing/server.mjs ./server.mjs
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
