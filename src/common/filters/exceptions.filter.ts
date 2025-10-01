import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

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
    } else {
      ({ responseBody, httpStatus } = this.handleUnknownError(exception));
    }

    if (!this.configService?.is('test')) {
      this.logger.error(
        exception,
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {}
    } else {
      delete responseBody.emitter;
      delete responseBody.description;
    }

    httpAdapter.reply(response, responseBody, httpStatus);
  }
}
