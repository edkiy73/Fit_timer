# FetUre app image (server/host.mjs). Build context: the repository root —
#   docker compose -f apps/feture/deploy/docker-compose.yml build
FROM node:22.20.0-bookworm-slim AS build
WORKDIR /repo
COPY packages/core packages/core
COPY apps/feture apps/feture
WORKDIR /repo/apps/feture
RUN npm ci --no-audit --no-fund && npm run build && npm prune --omit=dev

FROM node:22.20.0-bookworm-slim
ENV NODE_ENV=production PORT=3000
WORKDIR /repo
COPY --from=build /repo/packages/core packages/core
COPY --from=build /repo/apps/feture/api apps/feture/api
COPY --from=build /repo/apps/feture/server apps/feture/server
COPY --from=build /repo/apps/feture/lib apps/feture/lib
COPY --from=build /repo/apps/feture/config apps/feture/config
COPY --from=build /repo/apps/feture/contracts apps/feture/contracts
COPY --from=build /repo/apps/feture/data apps/feture/data
COPY --from=build /repo/apps/feture/dist apps/feture/dist
COPY --from=build /repo/apps/feture/node_modules apps/feture/node_modules
COPY --from=build /repo/apps/feture/package.json apps/feture/package.json
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/feture/server/host.mjs"]
