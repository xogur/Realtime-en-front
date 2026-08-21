import { NextRequest, NextResponse } from 'next/server';
import type { ArchiveReportFailure, ArchiveReportRequest } from '@/lib/reportArchiveTypes';
import { uploadReportPdf } from '@/server/ncpObjectStorage';
import { getReportArchiveConfig } from '@/server/reportArchiveConfig';
import { renderReportPdf } from '@/server/reportPdfRenderer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 3 * 1024 * 1024;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const ARCHIVE_ID_PATTERN = /^[a-f0-9-]{16,64}$/i;
const KIOSK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const STATIC_CSS_PATH = /^\/_next\/static\/.+\.css(?:\?.*)?$/;

function failure(code: ArchiveReportFailure['code'], message: string, status: number) {
  return NextResponse.json({ ok: false, code, message } satisfies ArchiveReportFailure, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function isValidBody(body: unknown): body is ArchiveReportRequest {
  if (!body || typeof body !== 'object') return false;
  const value = body as Partial<ArchiveReportRequest>;
  const document = value.document;
  return typeof value.archiveId === 'string'
    && ARCHIVE_ID_PATTERN.test(value.archiveId)
    && typeof value.capturedAt === 'string'
    && Number.isFinite(Date.parse(value.capturedAt))
    && (value.kioskId === undefined || (typeof value.kioskId === 'string' && KIOSK_ID_PATTERN.test(value.kioskId)))
    && Boolean(document)
    && typeof document?.html === 'string'
    && document.html.includes('assessment-print-document')
    && document.html.includes('data-layout-ready="true"')
    && Array.isArray(document.styleSheetPaths)
    && document.styleSheetPaths.length <= 20
    && document.styleSheetPaths.every((path) => typeof path === 'string' && STATIC_CSS_PATH.test(path))
    && Number.isInteger(document.pageCount)
    && document.pageCount >= 1
    && document.pageCount <= 20
    && (document.layoutMode === 'paginated' || document.layoutMode === 'natural');
}

function containsForbiddenMarkup(html: string): boolean {
  return /<(?:script|iframe|object|embed|link|meta|base)\b/i.test(html)
    || /\son[a-z]+\s*=/i.test(html)
    || /(?:javascript|vbscript)\s*:/i.test(html);
}

function isSameOriginRequest(request: NextRequest): boolean {
  if (request.headers.get('sec-fetch-site') !== 'same-origin') return false;

  const origin = request.headers.get('origin');
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || request.headers.get('host');
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = forwardedProtocol || request.nextUrl.protocol.replace(':', '');
  if (!origin || !host || !protocol) return false;

  try {
    const parsedOrigin = new URL(origin);
    return parsedOrigin.host === host && parsedOrigin.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production' && !isSameOriginRequest(request)) {
    return failure('INVALID_REQUEST', '허용되지 않은 PDF 저장 요청입니다.', 403);
  }
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > MAX_BODY_BYTES) return failure('PAYLOAD_TOO_LARGE', '리포트 데이터가 너무 큽니다.', 413);

  let config;
  try {
    config = getReportArchiveConfig();
  } catch (error) {
    console.error('[report-archive] invalid configuration', error instanceof Error ? error.message : error);
    return failure('CONFIGURATION_ERROR', 'PDF 저장 서버 설정을 확인해 주세요.', 503);
  }
  if (!config.enabled) return failure('ARCHIVE_DISABLED', 'PDF 자동 저장 기능이 비활성화되어 있습니다.', 403);

  const body = await request.json().catch(() => null);
  if (!isValidBody(body)) return failure('INVALID_REQUEST', '리포트 요청 형식이 올바르지 않습니다.', 400);
  if (Buffer.byteLength(body.document.html, 'utf8') > MAX_HTML_BYTES) {
    return failure('PAYLOAD_TOO_LARGE', '리포트 HTML이 너무 큽니다.', 413);
  }
  if (containsForbiddenMarkup(body.document.html)) {
    return failure('INVALID_REQUEST', '허용되지 않은 리포트 마크업입니다.', 400);
  }

  const startedAt = Date.now();
  try {
    const pdf = await renderReportPdf({
      html: body.document.html,
      styleSheetPaths: body.document.styleSheetPaths,
      layoutMode: body.document.layoutMode,
      config,
    });
    const uploaded = await uploadReportPdf({
      pdf,
      archiveId: body.archiveId,
      capturedAt: body.capturedAt,
      kioskId: body.kioskId,
      config,
    });
    console.info('[report-archive] saved', {
      archiveId: body.archiveId,
      objectKey: uploaded.objectKey,
      bytes: pdf.length,
      pageCount: body.document.pageCount,
      elapsedMs: Date.now() - startedAt,
      deduplicated: uploaded.deduplicated,
    });
    return NextResponse.json({
      ok: true,
      archiveId: body.archiveId,
      bucket: config.bucket,
      objectKey: uploaded.objectKey,
      savedAt: new Date().toISOString(),
      bytes: pdf.length,
      pageCount: body.document.pageCount,
      deduplicated: uploaded.deduplicated,
    }, {
      status: uploaded.deduplicated ? 200 : 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[report-archive] failed', { archiveId: body.archiveId, elapsedMs: Date.now() - startedAt, error: message });
    if (message === 'RENDERER_BUSY') return failure('RENDERER_BUSY', 'PDF 생성 요청이 많습니다. 잠시 후 다시 시도해 주세요.', 429);
    if (/Chromium|browser process|PDF|timeout|timed out|Target|Protocol/i.test(message)) {
      return failure('PDF_GENERATION_FAILED', 'PDF 생성에 실패했습니다. 다시 시도해 주세요.', 502);
    }
    return failure('OBJECT_STORAGE_FAILED', '오브젝트 스토리지 저장에 실패했습니다. 다시 시도해 주세요.', 502);
  }
}
