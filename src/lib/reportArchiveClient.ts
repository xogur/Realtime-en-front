import type {
  ArchiveReportFailure,
  ArchiveReportRequest,
  ArchiveReportSuccess,
  ReportLayoutMode,
} from '@/lib/reportArchiveTypes';

const STATIC_CSS_PATH = /^\/_next\/static\/.+\.css(?:\?.*)?$/;

export class ReportArchiveClientError extends Error {
  constructor(
    message: string,
    readonly code: ArchiveReportFailure['code'] = 'OBJECT_STORAGE_FAILED',
  ) {
    super(message);
    this.name = 'ReportArchiveClientError';
  }
}

function collectStyleSheetPaths(): string[] {
  const paths = [...document.styleSheets]
    .map((sheet) => sheet.href)
    .filter((href): href is string => Boolean(href))
    .flatMap((href) => {
      try {
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) return [];
        const path = `${url.pathname}${url.search}`;
        return STATIC_CSS_PATH.test(path) ? [path] : [];
      } catch {
        return [];
      }
    });
  return [...new Set(paths)];
}

export async function archiveAssessmentReport(input: {
  archiveId: string;
  capturedAt: string;
  kioskId?: string;
  element: HTMLElement;
  pageCount: number;
  layoutMode: ReportLayoutMode;
}): Promise<ArchiveReportSuccess> {
  const request: ArchiveReportRequest = {
    archiveId: input.archiveId,
    capturedAt: input.capturedAt,
    kioskId: input.kioskId,
    document: {
      html: input.element.outerHTML,
      styleSheetPaths: collectStyleSheetPaths(),
      pageCount: input.pageCount,
      layoutMode: input.layoutMode,
    },
  };
  const response = await fetch('/api/reports/archive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(request),
  });
  const result = await response.json().catch(() => null) as ArchiveReportSuccess | ArchiveReportFailure | null;
  if (!response.ok || !result || !result.ok) {
    const failure = result && !result.ok ? result : null;
    throw new ReportArchiveClientError(
      failure?.message ?? 'PDF 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      failure?.code,
    );
  }
  return result;
}

