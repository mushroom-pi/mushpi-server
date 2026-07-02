import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import * as path from 'path';

import {
  DocsConfig,
  EnvironmentVariables,
  LogsConfig,
  PicoConfig,
  SQLiteConfig,
  SecurityConfig,
  ServerConfig,
  ServiceConfig,
  UploadConfig,
} from './config.interface';
import { NodeEnvironments, Services } from './config.types';

@Injectable()
export class CustomConfigService {
  constructor(
    private readonly configService: ConfigService<EnvironmentVariables>,
  ) {}

  private makeServiceHost(serviceName: Services): string {
    const handle = serviceName.replaceAll('-', '_').toUpperCase();

    const hostKey = `${handle}_HOST` as keyof EnvironmentVariables;

    return this.configService.get(hostKey); //||
    // this.configService.get('MICROSERVICES_HOST')
  }

  private generateServiceConfig(serviceName: Services): ServiceConfig {
    const handle = serviceName.replaceAll('-', '_').toUpperCase();

    const portKey = `${handle}_PORT` as keyof EnvironmentVariables;
    const secretKey = `${handle}_SECRET` as keyof EnvironmentVariables;
    const urlKey = `${handle}_URL` as keyof EnvironmentVariables;

    const host = this.makeServiceHost(serviceName);
    const port = this.configService.get(portKey);
    const url =
      this.configService.get(urlKey) ||
      `${host.includes('http') ? '' : 'http://'}${host}:${port}`;

    return {
      host,
      port,
      secretKey: this.configService.get(secretKey),
      url,
    };
  }

  get server(): ServerConfig {
    return {
      nodeEnv: this.configService.get('NODE_ENV'),
      host: this.configService.get('APP_HOST'),
      port:
        this.configService.get('APP_PORT') || this.configService.get('PORT'),
      errorsDetail:
        typeof this.configService.get('ERRORS_DETAIL') === 'boolean'
          ? this.configService.get('ERRORS_DETAIL')
          : this.configService.get('ERRORS_DETAIL') !== 'false',
      isProd: this.configService.get('NODE_ENV') === 'prod',
    };
  }

  get logs(): LogsConfig {
    return {
      level: this.configService.get('LOGS_LEVEL'),
      path: this.configService.get('LOGS_PATH'),
      lifeDays: this.configService.get('LOGS_LIFE_DAYS'),
    };
  }

  get security(): SecurityConfig {
    return {
      secret: this.configService.get('APP_SECRET'),
      maxEventLoopDelay: this.configService.get('MAX_EVENT_LOOP_DELAY'),
      maxRequests: this.configService.get('MAX_REQUESTS'),
      maxRequestsTime: this.configService.get('MAX_REQUESTS_TIME'),
      clientUrl: this.configService.get('CLIENT_URL'),
    };
  }

  get docs(): DocsConfig {
    return {
      endpoint: this.configService.get('DOCS_ENDPOINT'),
      ui: this.configService.get('DOCS_UI_URL'),
      username: this.configService.get('DOCS_USERNAME'),
      password: this.configService.get('DOCS_PASSWORD'),
      makeDocs: !!this.configService.get('DOCS_ENDPOINT'),
      useAuth:
        !!this.configService.get('DOCS_USERNAME') &&
        !!this.configService.get('DOCS_PASSWORD'),
    };
  }

  get sqlite(): SQLiteConfig {
    return {
      database: this.configService.get('SQLITE_PATH'),
      logging: this.configService.get('SQLITE_LOG'),
    };
  }

  get upload(): UploadConfig {
    const dir = this.configService.get('UPLOAD_DIR');
    return {
      dir,
      imageDir: path.join(dir, 'images'),
    };
  }

  get pico(): PicoConfig {
    return { announceSecret: this.configService.get('PICO_ANNOUNCE_SECRET') };
  }

  is(env: NodeEnvironments): boolean {
    return this.configService.get('NODE_ENV') === env;
  }

  get isProd(): boolean {
    return this.configService.get('NODE_ENV') === 'prod';
  }

  get errorsDetail(): boolean {
    return this.server.errorsDetail === undefined
      ? !this.is('prod')
      : this.server.errorsDetail;
  }

  get baseUrl(): string {
    const host = this.configService.get('APP_HOST') || 'localhost';
    const port =
      this.configService.get('APP_PORT') ||
      this.configService.get('PORT') ||
      '3000';
    const protocol = host.includes('http') ? '' : 'http://';
    return `${protocol}${host}:${port}`;
  }
}
