# Environment Variables Documentation

> Automatically generated from Joi validation schema

| Variable | Type | Required | Default | Conditions | Description |
|----------|------|----------|---------|------------|-------------|
| `NODE_ENV` | string | Never | `"local"` | Allowed values: `dev`, `local`, `prod`, `staging`, `test` |  |
| `APP_HOST` | string | Never | `"localhost"` |  |  |
| `APP_PORT` | number | Never |  |  |  |
| `APP_SECRET` | string | Never |  |  |  |
| `CLIENT_URL` | string | Never |  |  |  |
| `CLIENT_DIST_DIR` | string | Never |  |  |  |
| `DOCS_ENDPOINT` | any | Never |  |  |  |
| `DOCS_UI_URL` | any | Never |  |  |  |
| `DOCS_USERNAME` | any | Never |  |  |  |
| `DOCS_PASSWORD` | any | Never |  |  |  |
| `LOGS_LEVEL` | string | Never | `"info"` | Allowed values: `info`, `trace`, `silent`, `debug`, `error`, `fatal`, `warn` |  |
| `LOGS_PATH` | string | Never | `"data/logs"` |  |  |
| `LOGS_LIFE_DAYS` | number | Never | `7` |  |  |
| `ERRORS_DETAIL` | boolean | Never |  |  |  |
| `APP_HTTPS_ENABLED` | boolean | Never | `false` |  | Declares that the browser-facing deployment is reached over HTTPS (TLS terminated upstream or directly). Does NOT configure TLS in this app — it only gates the HTTPS-only security headers: helmet HSTS and the CSP upgrade-insecure-requests directive. |
| `MAX_EVENT_LOOP_DELAY` | number | Never | `100` |  |  |
| `MAX_REQUESTS` | number | Never |  | Minimum: `1` | Rate limiting is opt-in: the maximum number of requests allowed per window, must be set TOGETHER with MAX_REQUESTS_TIME. If either one is absent the app applies no throttling and emits no X-RateLimit-* response headers. |
| `MAX_REQUESTS_TIME` | number | Never |  | Minimum: `1` | Rate-limit window length in MILLISECONDS (e.g. 60000 = 1 minute), must be set TOGETHER with MAX_REQUESTS. If either one is absent the app applies no throttling and emits no X-RateLimit-* response headers. |
| `SQLITE_PATH` | string | Never | `"data/app.sqlite"` |  |  |
| `SQLITE_LOG` | boolean | Never | `false` |  |  |
| `UPLOAD_DIR` | string | Never | `"data"` |  |  |
| `PICO_ANNOUNCE_SECRET` | any | Never |  |  |  |
| `READINGS_RETENTION_MONTHS` | number | Never | `6` | Minimum: `1` |  |
