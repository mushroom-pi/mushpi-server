export interface ExceptionResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  emitter?: string;
  timestamp?: string;
  path?: string;
  description?: string;
}
