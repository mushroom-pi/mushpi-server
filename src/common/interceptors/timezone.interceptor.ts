import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';

import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { Observable, from } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { SettingsService } from 'src/modules/settings/settings.service';

dayjs.extend(utc);
dayjs.extend(timezone);

const ISO_Z_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

@Injectable()
export class TimezoneInterceptor implements NestInterceptor {
  constructor(private readonly settingsService: SettingsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return from(this.settingsService.getTimezone()).pipe(
      switchMap((tz) =>
        tz === 'UTC'
          ? next.handle()
          : next.handle().pipe(map((data) => this.convertDates(data, tz))),
      ),
    );
  }

  private convertDates(value: any, tz: string): any {
    if (value === null || value === undefined) {
      return value;
    }

    if (value instanceof Date) {
      return dayjs.utc(value).tz(tz).format('YYYY-MM-DDTHH:mm:ss.SSSZ');
    }

    if (typeof value === 'string' && ISO_Z_REGEX.test(value)) {
      return dayjs.utc(value).tz(tz).format('YYYY-MM-DDTHH:mm:ss.SSSZ');
    }

    if (Array.isArray(value)) {
      return value.map((v) => this.convertDates(v, tz));
    }

    if (typeof value === 'object') {
      const result: Record<string, any> = {};
      for (const key of Object.keys(value)) {
        result[key] = this.convertDates(value[key], tz);
      }
      return result;
    }

    return value;
  }
}
