FROM node:22-bookworm-slim AS development
WORKDIR /app
# Bootstrap HTTPS apt with Node's bundled CA roots before installing system CAs.
RUN mkdir -p /etc/ssl/certs \
    && node -e "require('fs').writeFileSync('/etc/ssl/certs/ca-certificates.crt', require('tls').rootCertificates.join('\n'))" \
    && sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@12.3.4
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --fetch-timeout=600000
COPY . .
RUN DATABASE_URL=postgresql://unused:unused@localhost:5432/build pnpm run db:generate
EXPOSE 3000
CMD ["pnpm", "run", "start:dev"]

FROM development AS build
RUN pnpm run build && pnpm prune --prod

FROM node:22-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/src/main.js"]
