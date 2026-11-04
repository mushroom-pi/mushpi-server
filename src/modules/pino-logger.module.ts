import { DynamicModule, Module, RequestMethod } from '@nestjs/common';

import { IncomingMessage, ServerResponse } from 'http';
import { LoggerModule } from 'nestjs-pino';

import { CustomConfigService } from 'src/modules/config/config.service';

@Module({})
export class PinoLoggerModule {
  static forRoot(): DynamicModule {
    return {
      module: PinoLoggerModule,
      imports: [
        LoggerModule.forRootAsync({
          inject: [CustomConfigService],
          useFactory: (configService: CustomConfigService) => {
            const isLocalOrTest =
              configService.is('local') || configService.is('test');
            const { path, level, lifeDays: count } = configService.logs;

            // REMEMBER: Use require.resolve here to avoid problems with NCC when dockering
            const transport = isLocalOrTest
              ? {
                  target: require.resolve('pino-pretty'),
                  options: {
                    singleLine: true,
                    translateTime: "yyyy-mm-dd'T'HH:MM:ss.l'Z'",
                    messageFormat:
                      '{req.headers.x-correlation-id} [{context}] {msg}',
                  },
                }
              : {
                  targets: [
                    {
                      // stdout stream — preserves `docker logs -f` behaviour
                      target: require.resolve('pino/file'),
                      options: { destination: 1 },
                    },
                    {
                      // rolling daily file — 7-day retention
                      target: require.resolve('pino-roll'),
                      options: {
                        file: `${path}/app.log`,
                        frequency: 'daily',
                        limit: { count },
                        mkdir: true,
                      },
                    },
                  ],
                };

            return {
              pinoHttp: {
                customProps: (_req: IncomingMessage, _res: ServerResponse) => ({
                  context: 'HTTP',
                }),
                // Downgrade successful calls to debug so they are invisible at
                // the default LOGS_LEVEL=info. Set LOGS_LEVEL=debug to see them.
                customLogLevel: (
                  _req: IncomingMessage,
                  res: ServerResponse,
                  err: Error | undefined,
                ) => {
                  if ((res as any)._exceptionLogged) return 'silent';
                  if (err || res.statusCode >= 500) return 'error';
                  if (res.statusCode >= 400) return 'warn';
                  return 'debug';
                },
                level: configService.is('test') ? 'silent' : level,
                transport,
              },
              exclude: [
                { method: RequestMethod.ALL, path: 'health' },
                { method: RequestMethod.ALL, path: 'ping' },
              ],
            };
          },
        }),
      ],
    };
  }
}
