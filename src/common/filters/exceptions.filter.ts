import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import { AxiosError } from 'axios';
import { EntityNotFoundError, QueryFailedError, TypeORMError } from 'typeorm';

import { CustomConfigService } from 'src/modules/config/config.service';

import { ExceptionResponseBody } from './exceptions.interface';

@Catch()
export class ExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ExceptionsFilter.name);

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly configService?: CustomConfigService,
  ) {}

  private handleHttpError(exception: HttpException) {
    const responseBody = exception.getResponse() as ExceptionResponseBody;
    const httpStatus = exception.getStatus();

    return { httpStatus, responseBody };
  }

  private handleTypeOrmError(exception: TypeORMError) {
    let httpStatus = HttpStatus.NOT_ACCEPTABLE;

    let message = exception.message;

    // Sanitize noisy QueryFailedError messages if needed
    if (exception instanceof QueryFailedError) {
      // Many drivers expose a "code" and "errno" on (exception as any).driverError
      const driverErr: any = (exception as any).driverError ?? {};
      const code = driverErr.code ?? driverErr.errno ?? driverErr.name;

      // Optional: friendlier messages for common cases
      if (
        typeof driverErr.message === 'string' &&
        /unique constraint/i.test(driverErr.message)
      ) {
        message = 'Unique constraint violated';
        httpStatus = HttpStatus.CONFLICT;
      } else if (code === 'SQLITE_CONSTRAINT') {
        message = 'Constraint violation';
      } else if (code === 'SQLITE_BUSY') {
        message = 'Database is locked';
      }
    } else if (exception instanceof EntityNotFoundError) {
      message = 'Entity not found';
    }

    const error =
      httpStatus === HttpStatus.CONFLICT ? 'Conflict' : 'Not Acceptable';

    const responseBody: ExceptionResponseBody = {
      statusCode: httpStatus,
      error,
      message,
      emitter: 'database',
    };

    return { httpStatus, responseBody };
  }

  private handleAxiosError(exception: AxiosError) {
    let httpStatus: HttpStatus;
    let responseBody: ExceptionResponseBody;

    if (exception.response) {
      httpStatus = HttpStatus.EXPECTATION_FAILED;
      responseBody = {
        statusCode: httpStatus,
        error: 'Expectation failed',
        message: 'A service returned an error response',
        emitter: 'External microservice',
      };
    } else if (exception.request) {
      httpStatus = HttpStatus.BAD_GATEWAY;
      responseBody = {
        statusCode: httpStatus,
        error: 'Bad Gateway',
        message: 'A request was made but no response was received',
        emitter: 'External microservice',
      };
    } else {
      httpStatus = HttpStatus.FAILED_DEPENDENCY;
      responseBody = {
        statusCode: httpStatus,
        error: 'Failed Dependency',
        message: 'Axios produced an error',
        emitter: 'Axios',
      };
    }

    return { responseBody, httpStatus };
  }

  private handleUnknownError(exception: unknown) {
    const httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    const responseBody = {
      message:
        exception instanceof Error
          ? exception.message
          : 'Internal server error',
      error: 'Internal server error',
      statusCode: httpStatus,
      emitter: 'unknown',
    };

    return { httpStatus, responseBody };
  }

  private getEmitter({ stack }: Error) {
    return stack.split('\n')[2].trim().split(' ')[1].split('.')[0];
  }

  catch(exception: any, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest();
    const response = ctx.getResponse();

    let responseBody: ExceptionResponseBody;
    let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;

    /**
     * Different errors should be handled by this condition
     */
    if (exception instanceof HttpException) {
      ({ responseBody, httpStatus } = this.handleHttpError(exception));
    } else if (exception instanceof TypeORMError) {
      ({ responseBody, httpStatus } = this.handleTypeOrmError(exception));
    } else if (exception.isAxiosError) {
      ({ responseBody, httpStatus } = this.handleAxiosError(exception));
    } else {
      ({ responseBody, httpStatus } = this.handleUnknownError(exception));
    }

    if (!this.configService?.is('test')) {
      const logErr = exception.isAxiosError
        ? `${exception.message} [${exception.config?.url || 'no URL'}]`
        : exception;
      this.logger.error(
        logErr,
        exception.name || 'Unknown error',
        responseBody.emitter,
      );
      this.logger.debug(exception instanceof Error ? exception.stack : '');
    }

    if (this.configService?.errorsDetail) {
      try {
        responseBody.timestamp = new Date().toISOString();
        responseBody.path = request.url;

        if (!responseBody.emitter && exception instanceof Error)
          responseBody.emitter = this.getEmitter(exception);
      } catch (error) {
        this.logger.debug(
          'Failed to enrich exception response with detail fields',
          error,
        );
      }
    } else {
      delete responseBody.emitter;
      delete responseBody.description;
    }

    // Prevent pino-http from logging a duplicate "request errored" message
    // since this filter already logged the exception with full details
    (response as any)._exceptionLogged = true;

    httpAdapter.reply(response, responseBody, httpStatus);
  }
}
