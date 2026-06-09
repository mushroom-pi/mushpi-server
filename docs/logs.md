# Log Navigation Guide

## How logs work

- **Local / test** — pretty-printed, colourised output directly to the terminal. No files written.
- **All other environments** (`dev`, `staging`, `prod`) — two simultaneous outputs:
  - **stdout** (raw NDJSON) — available via `docker logs`
  - **Rolling daily file** — `$LOGS_PATH/app.YYYY-MM-DD.log` (default: `./data/logs/`)

Files older than 7 days are deleted automatically.

---

## Log levels

Set `LOGS_LEVEL` in your `.env` / `.env.prod`:

| Level | What you see |
|-------|-------------|
| `debug` | Everything — including every HTTP request/response |
| `info` (default) | App lifecycle events, warnings, errors — **HTTP success calls hidden** |
| `warn` | Warnings and errors only |
| `error` | Errors and fatals only |

> Successful HTTP calls (2xx/3xx) are logged at `debug`. At the default `info` level they are intentionally hidden to reduce noise. Switch to `debug` to trace HTTP traffic.

---

## Live tailing

### Bare Pi (no Docker)

```bash
# Follow the current log file, pretty-printed
tail -f ./data/logs/app.log | npx pino-pretty

# If the filename includes the date
tail -f ./data/logs/app.$(date +%Y-%m-%d).log | npx pino-pretty
```

### Docker

```bash
# Raw NDJSON from stdout
docker logs -f mushpi-server

# Pretty-printed stdout
docker logs -f mushpi-server | npx pino-pretty

# Access the log file inside the mounted volume (same as bare Pi)
tail -f ./data/logs/app.log | npx pino-pretty
```

---

## Searching historical logs

All search examples use [`jq`](https://jqlang.org). Install with:

```bash
sudo apt install jq
```

### By severity

```bash
# Errors only (level 50)
cat ./data/logs/app.log | jq 'select(.level >= 50)'

# Warnings and above (level 40)
cat ./data/logs/app.log | jq 'select(.level >= 40)'
```

### By message text

```bash
cat ./data/logs/app.log | jq 'select(.msg | contains("pico-unit"))'
```

### By HTTP endpoint

```bash
# All requests to /pico-units
cat ./data/logs/app.log | jq 'select(.req.url | startswith("/pico-units"))'

# All requests to a specific unit ID
cat ./data/logs/app.log | jq 'select(.req.url | contains("/pico-units/3"))'
```

### By HTTP status code

```bash
# All 4xx and 5xx responses
cat ./data/logs/app.log | jq 'select(.res.statusCode >= 400)'

# Only 500s
cat ./data/logs/app.log | jq 'select(.res.statusCode >= 500)'
```

### Combined filters

```bash
# Errors on a specific endpoint
cat ./data/logs/app.log | jq 'select(.level >= 50 and (.req.url | startswith("/pico-units")))'

# 4xx responses in the last hour (replace timestamp as needed)
cat ./data/logs/app.log | jq --argjson since $(date -d '1 hour ago' +%s)000 \
  'select(.res.statusCode >= 400 and .time > $since)'
```

### Pretty-print a historical file

```bash
# Full day, colourised
cat ./data/logs/app.2025-06-01.log | npx pino-pretty

# Errors only from a past day, colourised
cat ./data/logs/app.2025-06-01.log | jq -c 'select(.level >= 50)' | npx pino-pretty
```

---

## Pino level number reference

| Number | Name |
|--------|------|
| 10 | trace |
| 20 | debug |
| 30 | info |
| 40 | warn |
| 50 | error |
| 60 | fatal |
