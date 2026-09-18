import { NodeEnvironments } from 'src/modules/config/config.types';

interface MemoryUsage {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

export interface UpTime {
  seconds: number;
  minutes: number;
  hours: number;
  days: number;
}

interface OsInfo {
  platform: string;
  type: string;
  release: string;
  hostname: string;
  arch: string;
}

interface CpuInfo {
  model: string;
  cores: number;
}

interface SystemMemory {
  totalMb: number;
  freeMb: number;
}

interface DiskInfo {
  path: string;
  totalMb: number | null;
  freeMb: number | null;
}

export interface SystemInfo {
  os: OsInfo;
  cpu: CpuInfo;
  memory: SystemMemory;
  upTime: UpTime;
  disk: DiskInfo;
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
  system?: SystemInfo;
  databases?: Record<string, DatabaseStatus>;
  services?: Record<string, ServiceStatus>;
}

export interface HealthCheckInput {
  server?: 'true' | 'false';
  system?: 'true' | 'false';
  databases?: string;
  services?: string;
}
