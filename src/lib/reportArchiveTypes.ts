export type ReportLayoutMode = 'paginated' | 'natural';

export type ArchiveReportRequest = {
  archiveId: string;
  capturedAt: string;
  kioskId?: string;
  document: {
    html: string;
    styleSheetPaths: string[];
    pageCount: number;
    layoutMode: ReportLayoutMode;
  };
};

export type ArchiveReportSuccess = {
  ok: true;
  archiveId: string;
  bucket: string;
  objectKey: string;
  savedAt: string;
  bytes: number;
  pageCount: number;
  deduplicated: boolean;
};

export type ArchiveReportErrorCode =
  | 'ARCHIVE_DISABLED'
  | 'INVALID_REQUEST'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_LAYOUT'
  | 'RENDERER_BUSY'
  | 'PDF_GENERATION_FAILED'
  | 'OBJECT_STORAGE_FAILED'
  | 'CONFIGURATION_ERROR';

export type ArchiveReportFailure = {
  ok: false;
  code: ArchiveReportErrorCode;
  message: string;
};

