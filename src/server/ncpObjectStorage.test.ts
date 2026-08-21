import { describe, expect, it } from 'vitest';
import { buildReportObjectKey } from '@/server/reportObjectKey';

describe('buildReportObjectKey', () => {
  it('uses the Asia/Seoul date folder and millisecond timestamp', () => {
    expect(buildReportObjectKey(
      { prefix: 'assessment-reports', timeZone: 'Asia/Seoul' },
      '2026-08-20T05:35:27.123Z',
    )).toBe('assessment-reports/2026-08-20/2026-08-20_14-35-27-123.pdf');
  });

  it('moves an UTC afternoon capture into the next Korean date folder', () => {
    expect(buildReportObjectKey(
      { prefix: 'assessment-reports', timeZone: 'Asia/Seoul' },
      '2026-08-20T16:00:00.007Z',
    )).toBe('assessment-reports/2026-08-21/2026-08-21_01-00-00-007.pdf');
  });
});
