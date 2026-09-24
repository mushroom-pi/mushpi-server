# 🍄 Mushroom Pi 🍓 - Hub Server

![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)![Yarn](https://img.shields.io/badge/yarn-%232C8EBB.svg?style=for-the-badge&logo=yarn&logoColor=white)![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)![NestJS](https://img.shields.io/badge/nestjs-%23E0234E.svg?style=for-the-badge&logo=nestjs&logoColor=white)![Express.js](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB)![SQLite](https://img.shields.io/badge/sqlite-%2307405e.svg?style=for-the-badge&logo=sqlite&logoColor=white)![TypeORM](https://img.shields.io/badge/TypeORM-FE0803.svg?style=for-the-badge&logo=typeorm&logoColor=white)![Swagger](https://img.shields.io/badge/-Swagger-%23Clojure?style=for-the-badge&logo=swagger&logoColor=white)![Jest](https://img.shields.io/badge/-jest-%23C21325?style=for-the-badge&logo=jest&logoColor=white)
![Git](https://img.shields.io/badge/git-%23F05033.svg?style=for-the-badge&logo=git&logoColor=white)

The **hub server** for Mushroom Pi: a [NestJS 11](https://nestjs.com/) backend that sits between the Pico growing units and the React dashboard. It polls every Pico unit once a minute, persists the readings in a local SQLite database, and exposes a versioned REST API plus an OpenAPI spec that `mushpi-client` consumes.

```
mushpi-grow (Pico 2W) ──REST──▶ mushpi-server (NestJS) ◀──REST── mushpi-client (React)
    port 5000                     port 3000                          port 5173
```

What the server owns:

- **Polling** — a cron sweep polls `GET /` on every monitored Pico unit every 60 seconds and stores a `Readings` row.
- **Persistence** — SQLite via TypeORM + `better-sqlite3` (embedded store, no separate database service).
- **Control proxying** — forwards setpoint/output/setup/loop/reboot commands to the Pico units through `/v1/pico-units/:id/control/*`.
- **Domain management** — CRUD for batches, recipes, and batch/recipe images.
- **Aggregation & export** — NTILE-bucketed reading aggregation for charts and raw CSV export.
- **The API contract** — a Swagger UI plus generated OpenAPI spec at `spec/openapi.json` / `spec/openapi.yaml`, consumed by `mushpi-client`'s code generator.

## Prerequisites

- **Node.js 22** (see `@types/node` in `package.json`)
- **Yarn 4 (Berry)** — the repo is pinned via `packageManager: yarn@4.14.1`; enable with `corepack enable`
- Any Linux box or Raspberry Pi — nothing server-specific; **SQLite is embedded**, no database install needed

## Installation & Configuration

```bash
yarn install
```

Configuration comes from environment variables read from a gitignored `.env` file (`.env.test` when running tests). Joi validates them at boot — invalid values fail fast. There is no committed `.env.example`; create your own `.env` with at least `CLIENT_URL` (required in local mode):

```bash
# .env
APP_PORT=3000                      # listen port (canonical name; a legacy PORT is also read)
CLIENT_URL=http://localhost:5173   # CORS origin (required in local mode)
```

The full, generated reference is `docs/ENVIRONMENT.md` (regenerate with `yarn docs:env`). Key variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `APP_HOST` | `localhost` | Bind host |
| `APP_PORT` | `3000` *(falls back to legacy `PORT`)* | Listen port |
| `NODE_ENV` | `local` | `local` / `dev` / `staging` / `prod` / `test` — switches several behaviours |
| `CLIENT_URL` | — | CORS origin (the dashboard's origin); required in local mode |
| `CLIENT_DIST_DIR` | — | Path to the built dashboard — enables SPA serving (required in prod) |
| `SQLITE_PATH` | `data/app.sqlite` | SQLite database file |
| `UPLOAD_DIR` | `data` | Upload root; images live under `$UPLOAD_DIR/images` |
| `PICO_ANNOUNCE_SECRET` | `mushpi-dev-secret` (non-prod) | Shared secret Pico units send as `X-Pico-Secret` on announce; required in prod |
| `APP_SECRET` | — | Optional bearer secret guarding the API (`Authorization` header) |
| `APP_HTTPS_ENABLED` | `false` | Set `true` only when the browser-facing deployment is HTTPS (TLS terminated upstream or directly). Emits HSTS + CSP `upgrade-insecure-requests`; on plain HTTP the defaults (off) keep the SPA loadable from LAN addresses |
| `READINGS_RETENTION_MONTHS` | `6` | How long readings are kept before the retention cleanup prunes them |
| `DOCS_ENDPOINT` | `contract` (local) | Swagger UI path; empty/absent disables docs |
| `DOCS_USERNAME` / `DOCS_PASSWORD` | — | Basic-auth protecting the docs endpoint (when set) |
| `LOGS_LEVEL` · `LOGS_PATH` · `LOGS_LIFE_DAYS` | `info` · `data/logs` · `7` | pino level, rolling log dir, retention days |
| `MAX_REQUESTS` / `MAX_REQUESTS_TIME` | — | Rate limiter (requests / window) |
| `MAX_EVENT_LOOP_DELAY` | `100` | Event-loop lag ceiling (ms) before the server backs off |

## Running the App

```bash
# development
yarn start

# watch mode (restarts on change)
yarn start:dev

# production (requires a prior build)
yarn build && yarn start:prod
```

The server listens on **port 3000** by default. Once running:

- **Swagger UI** — `http://localhost:3000/contract` (the `DOCS_ENDPOINT` path)
- **Raw OpenAPI JSON** — `http://localhost:3000/contract-json` (what the client generator reads)
- **Liveness** — `GET /ping`
- **Health** — `GET /health`

The committed OpenAPI spec lives in `spec/openapi.json` + `spec/openapi.yaml`, regenerated from the NestJS decorators with `yarn spec:all`.

## Day-to-Day Commands

| Command | What it does |
|---------|--------------|
| `yarn build` | Compile with `nest build` |
| `yarn lint` | ESLint `--fix` (local, autofixing) |
| `yarn lint:ci` | ESLint gate — no `--fix`, `--max-warnings=0` |
| `yarn format` | Prettier write |
| `yarn test` | Jest unit tests |
| `yarn test:e2e` | Jest end-to-end tests (`test/jest-e2e.json`) |
| `yarn test:cov` | Unit coverage |
| `yarn spec:export` | Build + regenerate `spec/openapi.{json,yaml}` |
| `yarn spec:bruno` | Regenerate the Bruno collection (`spec/bruno/`, gitignored) |
| `yarn spec:all` | Both of the above |
| `yarn docs:env` | Regenerate `docs/ENVIRONMENT.md` |
| `yarn migration:generate` / `:run` / `:revert` / `:show` | TypeORM migrations (build first) |
| `yarn audit:prod` / `yarn audit:ci` | Dependency audit (informational / gating) |
| `yarn knip:ci` | Unused-production-dependency gate |

The full verification ladder — `yarn build && yarn lint && yarn test && yarn test:e2e && yarn start` — should all exit 0 and boot clean.

## Project Layout

Feature modules live under `src/modules/`. Note that **`sqlite/` is the database module — there is no `database/` module.**

```
src/main.ts          Bootstrap: versioning, security, docs auth, Swagger, globals
src/common/          Constants, decorators, DTOs, exceptions, filters, guards,
                     interceptors, middleware, pipes, utils, validators
app.module.ts        Root module (APP_GUARD, global middleware)
pino-logger.module.ts nestjs-pino HTTP logging
config/              @Global env + Joi config module
sqlite/              TypeORM root — data-source.ts + entities; sync dev / migrations prod
sqlite/migrations/   Migrations + MIGRATIONS barrel
sqlite-health/       /health "databases" probe (read/write + size)
swagger/             OpenAPI builder (error schemas, operationIdFactory)
monitoring/          Infra endpoints (/ping, /health)
pico-units/          CRUD + ping/poll/reboot proxies + api_compatibility verdict
readings/            Readings + NTILE aggregation + CSV export
batches/             CRUD + lifecycle + recipe-from-batch + images
recipes/             CRUD + images + per-recipe batch listing
control/             setpoints/outputs/setup/loop proxies (+poll)
cron/                60s polling sweeps + retention cleanup
dashboard/           Aggregated summary
settings/            Timezone + TimezoneInterceptor
spec/generators/     openapi + bruno generators
docs/                env-vars.generator.ts → docs/ENVIRONMENT.md
public/              Assets served at /public (Swagger favicon)
```

## Domain Concepts

A short map to read the code with:

- **PicoUnit** — one physical growing unit. Keyed by a unique `handle` (which must match the Pico's `device_name`). Carries IP/MAC, firmware + API versions, board metrics, and a computed `status` and `api_compatibility` verdict (neither is stored — both are `@Expose()` getters).
- **Reading** — one 60-second poll snapshot: temperature, humidity, relay states, setpoints, board metrics, response time. The `Readings` table grows unbounded and is pruned by the retention cron.
- **Batch** — a growing run on a unit, with start/finish times, species, and target temperature/humidity. Carries a status computed from the current time window and up to five images.
- **Recipe** — a reusable template (species + temperature/humidity targets + duration) that a batch can be snapshotted from, or reverse-derived from a finished batch.
- **Announce** — on boot a Pico `POST`s to `/v1/pico-units/announce` (upsert by `handle`, guarded by `X-Pico-Secret`). The payload carries `firmware_version` + `api_version`.
- **Polling cron** — every 60 s the server sweeps monitored units, `GET /` each, and stores a reading. On-demand polls also exist at `POST /v1/pico-units/:id/poll`.
- **Control proxy** — `PUT /v1/pico-units/:id/control/{setpoints,outputs,setup,loop}` forwards to the Pico's own endpoints. Sensors and status are *not* proxied — they arrive via the poll.

Everything under `/v1/` (URI versioning, `defaultVersion: '1'`); `/ping` and `/health` are version-neutral.

## Pointers

- [`AGENTS.md`](AGENTS.md) — authoritative agent instructions: full endpoint table, entity columns, script inventory, coding rules.
- [`REFERENCE.md`](REFERENCE.md) — long-tail gotchas (polling internals, computed status fields, migrations, Husky hooks, release versioning).
- [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) — generated, complete env-var reference.
- [`docs/logs.md`](docs/logs.md) — how to retrieve and query logs.
- [`spec/openapi.yaml`](spec/openapi.yaml) — the committed OpenAPI contract.
- `mushpi-docs/architecture/c4-container.md` and `mushpi-docs/architecture/c4-component-server.md` — where this service fits in the system and its internals.
- `mushpi-docs/versioning.md` — release & version semantics.

> This README is for humans. `AGENTS.md` + `REFERENCE.md` are the authoritative instructions that coding agents read.

## License

Distributed under the MIT License — see [`LICENSE`](LICENSE).

Copyright (c) 2026 [Adriana Martín de Aguilera](https://www.amda.dev)
