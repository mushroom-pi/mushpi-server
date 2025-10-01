import { DynamicModule, Module, RequestMethod } from '@nestjs/common';

import { IncomingMessage, ServerResponse } from 'http';
import { LoggerModule } from 'nestjs-pino';

import { CustomConfigService } from '../modules/config/config.service';

@Module({})
export class PinoLoggerModule {
  static forRoot(): DynamicModule {
    return {
      module: PinoLoggerModule,
      imports: [
        LoggerModule.forRootAsync({
          inject: [CustomConfigService],
          useFactory: (configService: CustomConfigService) => ({
            pinoHttp: {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              customProps: (_req: IncomingMessage, _res: ServerResponse) => ({
                context: 'HTTP',
              }),
              level: configService.is('test')
                ? 'silent'
                : configService.server.logsLevel,
              transport:
                configService.is('local') || configService.is('test')
                  ? {
                      // REMEMBER: Use require.resolve here to avoid problems with NCC when dockering
                      target: require.resolve('pino-pretty'),
                      options: {
                        singleLine: true,
                        translateTime: "yyyy-mm-dd'T'HH:MM:ss.l'Z'",
                        messageFormat:
                          '{req.headers.x-correlation-id} [{context}] {msg}',
                      },
                    }
                  : undefined,
            },
            exclude: [
              { method: RequestMethod.ALL, path: 'metrics' },
              { method: RequestMethod.ALL, path: 'health' },
              { method: RequestMethod.ALL, path: 'ping' },
            ],
          }),
        }),
      ],
    };
  }
}
