# SwaggerModule

The `SwaggerModule` automates the generation of Swagger documentation for your NestJS application. It also adds global error responses to all API endpoints, making the documentation process more efficient.

## How It Works

The `SwaggerModule` uses the `@nestjs/swagger` package to create and set up Swagger documentation. It integrates with your application and includes predefined global error responses for all endpoints.

### Key Features

- **Automated Swagger Documentation**: Generates Swagger documentation based on the application's modules.
- **Global Error Responses**: Adds predefined error responses to all endpoints.
- **Configurable Error Details**: Includes additional error details based on environment variables.
- **Basic Authentication**: If needed, basic username/password authentication can be enforced in order to access the documentation endpoint (alhtouth it's not set by default).

## Automatic Error Generation

### Global Errors

Global error responses are defined in the `globalErrors` array. Each error includes a status code, description, and example message. These errors are automatically added to all API endpoints, unless explicitly excluded using tags.

### Environment Configuration

#### Error response objects

The inclusion of detailed error properties (`timestamp`, `path`, `emitter`) in error responses is controlled by the `ERRORS_DETAIL` environment variable through the `errorsDetail` property in the `CustomConfigService`. The details are **on by default in every environment — `prod` and `demo` included** — and are suppressed only when `ERRORS_DETAIL='false'` is set explicitly; `NODE_ENV` plays no part.

- `errorsDetail = true` (default: `ERRORS_DETAIL` unset, or any value other than `'false'`): Error responses include `timestamp`, `path`, and `emitter`.
- `errorsDetail = false` (only `ERRORS_DETAIL='false'`): These details are omitted.

#### Rate-limit errors

Rate limiting is defined by the deployment **profile** — two profiles, two threat models:

- **Self-hosted profile** — a hub on a trusted local network; the network itself is the security boundary. Rate limiting is **opt-in**: the service imposes it only when **both** `MAX_REQUESTS` (requests allowed per window) and `MAX_REQUESTS_TIME` (window length in **milliseconds**, e.g. `60000`) are configured as positive integers, validated as a pair — supplying only one half is a startup configuration error. With the pair unset, no throttling happens and **no rate-limit headers are emitted at all**. The `VISITOR_*`/`ABUSE_*`/`GLOBAL_*` limiter vars are ignored on this profile.
- **Public-demo profile** (`NODE_ENV=demo`) — an internet-exposed, unauthenticated demonstration instance behind exactly one reverse proxy. Rate limiting is **always on**: three limiters — a per-visitor browse pace (the unnamed `default` bucket), the `demo-global` whole-instance backstop, and the `demo-abuse` refused-change limiter — built exclusively from the six `VISITOR_*`/`ABUSE_*`/`GLOBAL_*` env values (required in this profile; never hardcoded). The required-when-`demo` rule marks exactly this profile scope. Per-visitor bucketing is sound only behind a single known appending proxy — the demo's topology, not a hub's — which is why the triple belongs to this profile alone. The `MAX_REQUESTS` pair has no effect here.

Throttled responses carry the `@nestjs/throttler` headers `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` (the latter in **relative seconds**), plus `Retry-After` on the blocked request; a *named* limiter adds its name as a suffix (`X-RateLimit-*-demo-global`, `Retry-After-demo-abuse`). `GET /health` is exempt on both profiles and on every demo bucket, so the container health check can never be rate limited; announcements skip the two named demo buckets but keep the visitor pace.

Hence, the `429 Too many requests` global error is documented **per profile**: on the self-hosted profile only when the opt-in pair is configured; on the public-demo profile always. The demo arm affects only a demo instance's **served** document — the committed spec is generated on a local boot and stays unchanged.

#### Basic authentication

If `DOCS_USERNAME` and `DOCS_PASSWORD` environment variables are provided, the documentation endpoint will demand basic authentication in order to be visualized. Both environment variables make use of minor Joi validation to impose minimum security. If these variables are not provided, the documentation will be open to anyone.

## Setup

1. **Configure `CustomConfigService`**: Ensure it provides the necessary settings, including `docs.endpoint` and `errorsDetail`.
2. **Initialize in Bootstrap**: Set up the `SwaggerModule` in your main application bootstrap file.

   ```typescript
   import { NestFactory } from '@nestjs/core';

   import { AppModule } from './app.module';
   import { CustomConfigService } from './config/custom-config.service';
   import { SwaggerModule } from './swagger/swagger.module';

   async function bootstrap() {
     const app = await NestFactory.create(AppModule, { bufferLogs: true });
     const configService = app.get(CustomConfigService);
     const swaggerModule = new SwaggerModule(configService);
     swaggerModule.setupSwagger(app);
     await app.listen(configService.server.port);
   }
   bootstrap();
   ```

With this setup, the SwaggerModule will automatically generate the Swagger documentation and include global error responses based on your configuration.
