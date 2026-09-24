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

The inclusion of detailed error properties (`timestamp`, `path`, `emitter`) in error responses is controlled by the `ERRORS_DETAIL` and `NODE_ENV` environment variables that are combined in the `errorsDetail` property in the `CustomConfigService`.

- `errorsDetail = true` (`ERRORS_DETAIL = true | undefined` or `NODE_ENV` not `prod`): Error responses include `timestamp`, `path`, and `emitter`.
- `errorsDetail = false` (`ERRORS_DETAIL = false` or `NODE_ENV = prod`): These details are omitted.

#### Rate-limit errors

Rate limiting is **opt-in**: the service imposes it only when **both** `MAX_REQUESTS` (requests allowed per window) and `MAX_REQUESTS_TIME` (window length in **milliseconds**, e.g. `60000`) are configured as positive integers. The variables are validated as a pair — supplying only one of them is a startup configuration error.

When the pair is configured, throttled responses carry the `@nestjs/throttler` headers `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` (the latter two in **relative seconds**), plus `Retry-After` on the blocked request. When it is not configured, no throttling happens and **no rate-limit headers are emitted at all**. `GET /health` is exempt either way (`@SkipThrottle()`), so the container health check can never be rate limited.

Hence, the `429 Too many requests` global error is only displayed in the documentation if those variables are present.

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
