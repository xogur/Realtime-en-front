import type { ReportArchiveConfig } from '@/server/reportArchiveConfig';

function dateParts(date: Date, timeZone: string): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

export function buildReportObjectKey(
  config: Pick<ReportArchiveConfig, 'prefix' | 'timeZone'>,
  capturedAt: string,
): string {
  const date = new Date(capturedAt);
  const parts = dateParts(date, config.timeZone);
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const millis = String(date.getMilliseconds()).padStart(3, '0');
  return `${config.prefix}/${day}/${day}_${parts.hour}-${parts.minute}-${parts.second}-${millis}.pdf`;
}

