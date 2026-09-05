# syntax=docker/dockerfile:1

###############################################################################
# Stage 1 — Build the React client (mushpi-client)
#
# The client source is staged at ./client inside the build context
# (CI checks it out there; see .github/workflows/publish.yml). The generated
# API client (src/api/generated/*) is gitignored upstream, so we regenerate it
# from the server's committed spec/openapi.json before type-checking/bundling.
###############################################################################
FROM node:24-bookworm-slim AS client-build
WORKDIR /app

# openapi-generator-cli (used by `yarn gen:client`) needs a JRE to run.
RUN apt-get update \
    && apt-get install -y --no-install-recommends default-jre-headless \
    && rm -rf /var/lib/apt/lists/*

ARG CLIENT_SRC=client

# Install client dependencies (layer-cached on package.json/yarn.lock).
COPY ${CLIENT_SRC}/package.json ${CLIENT_SRC}/yarn.lock ${CLIENT_SRC}/.yarnrc.yml ./
RUN yarn install --immutable

COPY ${CLIENT_SRC}/ .

# Canonical OpenAPI spec (committed in mushpi-server/spec/openapi.json) →
# regenerate the gitignored API client before building.
COPY spec/openapi.json ./openapi.json
RUN yarn gen:client && yarn gen:schemas

# Same-origin API base: the SPA calls the server on the same origin.
ARG VITE_API_BASE_URL=/
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN yarn build

###############################################################################
# Stage 2 — Build the server (mushpi-server)
###############################################################################
FROM node:24-bookworm-slim AS server-build
WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

# Explicitly copy source + build config. NOT `COPY . .` — that would drag the
# staged client/ dir into the server compile and shift tsc's rootDir (breaking
# the `package.json` import and the dist/src/main.js entrypoint).
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY docs ./docs
COPY spec ./spec
RUN yarn build

###############################################################################
# Stage 3 — Runtime
###############################################################################
FROM node:24-bookworm-slim AS runtime
WORKDIR /usr/src/app

ENV NODE_ENV=prod

# Production dependencies only (builds the better-sqlite3 native binding).
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn workspaces focus --all --production \
    && yarn cache clean

# Compiled server output + built client SPA.
COPY --from=server-build /app/dist ./dist
COPY --from=client-build /app/dist ./client

# ServeStaticModule requires this absolute path in prod (Joi-enforced).
ENV CLIENT_DIST_DIR=/usr/src/app/client

# Single persisted volume: SQLite DB + uploaded images + logs.
RUN mkdir -p /data/logs /data/images \
    && chown -R node:node /data

USER node
EXPOSE 3000

# Liveness probe (Node built-in fetch — no curl/wget in -slim). APP_SECRET is
# optional and unset by default, so /ping needs no Authorization header.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/ping').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/src/main.js"]
