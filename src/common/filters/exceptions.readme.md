# ExceptionsFilter

The `ExceptionsFilter` is a custom exception filter for your NestJS application. It captures and processes exceptions globally, providing detailed error responses based on your configuration.

## How It Works

The `ExceptionsFilter` catches all exceptions thrown within your application. It differentiates between HTTP exceptions and unexpected errors, logging the error details and formatting the response accordingly.

### Key Features

- **Global Exception Handling**: Captures and processes all exceptions.
- **HTTP and Unexpected Errors**: Differentiates between known HTTP exceptions and unexpected errors.
- **Configurable Error Details**: Includes additional error details based on environment variables.

## Automatic Error Handling

### Exception Processing

1. **HTTP Exceptions**: When an `HttpException` is caught, the filter logs the error and returns the exception's response.
2. **Unexpected Errors**: For other types of exceptions, it logs the error and returns a generic "Internal server error" response.

### Environment Configuration

The inclusion of detailed error properties (`timestamp`, `path`, `emitter`) in error responses is controlled by the `ERRORS_DETAIL` and `NODE_ENV` environment variables that are combined in the `errorsDetail` property in the `CustomConfigService`.

- `errorsDetail = true` (`ERRORS_DETAIL = true | undefined` or `NODE_ENV` not `prod`): Error responses include `timestamp`, `path`, and `emitter`.
- `errorsDetail = false` (`ERRORS_DETAIL = false` or `NODE_ENV = prod`): These details are omitted.

## Setup

1. **Configure `CustomConfigService`**: Ensure it provides the necessary settings, including `errorsDetail`.
2. **Use the Filter**: Apply the `ExceptionsFilter` in your main application bootstrap file or specific modules.
