# Build
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Run
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# The league catalogue and cross-source mapping are data, not code. They ship
# as-is and are refreshed by the scripts in data/, not at boot.
COPY data ./data

# Snapshot and device registry. Mount a volume to keep them across restarts;
# without one the app still works, it just re-sweeps on boot.
ENV SNAPSHOT_DIR=/app/state
RUN mkdir -p /app/state
VOLUME ["/app/state"]

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s \
  CMD wget -qO- http://127.0.0.1:8787/health >/dev/null || exit 1

CMD ["node", "dist/index.js"]
