import 'server-only';

export type ReportArchiveConfig = {
  enabled: boolean;
  prefix: string;
  timeZone: string;
  renderOrigin: string;
  maxConcurrency: number;
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  chromiumExecutablePath?: string;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function getReportArchiveConfig(): ReportArchiveConfig {
  const prefix = (process.env.REPORT_ARCHIVE_PREFIX ?? 'assessment-reports')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  const renderOrigin = (process.env.REPORT_RENDER_ORIGIN ?? 'http://127.0.0.1:3003').replace(/\/$/, '');
  const maxConcurrency = Number(process.env.REPORT_RENDER_MAX_CONCURRENCY ?? '2');
  if (!prefix || !/^[A-Za-z0-9/_-]+$/.test(prefix)) throw new Error('REPORT_ARCHIVE_PREFIX is invalid');
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 8) {
    throw new Error('REPORT_RENDER_MAX_CONCURRENCY must be between 1 and 8');
  }
  new URL(renderOrigin);

  return {
    enabled: (process.env.REPORT_ARCHIVE_ENABLED ?? 'false').toLowerCase() === 'true',
    prefix,
    timeZone: process.env.REPORT_ARCHIVE_TIME_ZONE?.trim() || 'Asia/Seoul',
    renderOrigin,
    maxConcurrency,
    endpoint: required('NCP_ENDPOINT'),
    region: required('NCP_REGION'),
    bucket: required('NCP_BUCKET'),
    accessKey: required('NCP_ACCESS_KEY'),
    secretKey: required('NCP_SECRET_KEY'),
    chromiumExecutablePath: process.env.CHROMIUM_EXECUTABLE_PATH?.trim() || undefined,
  };
}

