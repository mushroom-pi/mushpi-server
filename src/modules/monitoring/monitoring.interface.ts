import { NodeEnvironments } from 'src/modules/config/config.types';

interface MemoryUsage {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

interface UpTime {
  seconds: number;
  minutes: number;
  hours: number;
  days: number;
}

export interface ServerStatus {
  healthy: boolean;
  environment: NodeEnvironments;
  loadAverage: number[];
  memoryUsageInMB: MemoryUsage;
  upTime: UpTime;
  nodeVersion: string;
  appVersion: string;
}

export interface TableSize {
  name: string;
  sizeMb: number | null;
  rowCount?: number;
}

export interface DatabaseSizeStatus {
  totalMb: number | null;
  inMemory: boolean;
  path: string;
  tables: TableSize[];
  overheadMb: number | null;
}

export interface DatabaseStatus {
  read: boolean;
  write: boolean;
  size?: DatabaseSizeStatus;
}

export interface ServiceStatus {
  hasKey?: boolean;
  available: boolean;
  responseTimeInMs?: number;
}

export interface HealthCheckResponse {
  server?: ServerStatus;
  databases?: Record<string, DatabaseStatus>;
  services?: Record<string, ServiceStatus>;
}

export interface HealthCheckInput {
  server?: 'true' | 'false';
  databases?: string;
  services?: string;
}
