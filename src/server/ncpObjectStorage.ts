import 'server-only';

import { createHash } from 'node:crypto';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ReportArchiveConfig } from '@/server/reportArchiveConfig';
import { buildReportObjectKey } from '@/server/reportObjectKey';

function createClient(config: ReportArchiveConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
  });
}

function suffixKey(key: string, suffix: number): string {
  return key.replace(/\.pdf$/, `_${suffix}.pdf`);
}

export async function uploadReportPdf(input: {
  pdf: Buffer;
  archiveId: string;
  capturedAt: string;
  kioskId?: string;
  config: ReportArchiveConfig;
}): Promise<{ objectKey: string; deduplicated: boolean; sha256: string }> {
  const client = createClient(input.config);
  const baseKey = buildReportObjectKey(input.config, input.capturedAt);
  const sha256 = createHash('sha256').update(input.pdf).digest('hex');
  let objectKey = baseKey;

  for (let suffix = 1; suffix <= 99; suffix += 1) {
    try {
      const existing = await client.send(new HeadObjectCommand({ Bucket: input.config.bucket, Key: objectKey }));
      if (existing.Metadata?.['archive-id'] === input.archiveId) {
        return { objectKey, deduplicated: true, sha256: existing.Metadata['content-sha256'] ?? sha256 };
      }
      objectKey = suffixKey(baseKey, suffix + 1);
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      // S3-compatible stores can return 403 for a missing key when the
      // credential has object access but no bucket listing permission.
      // The millisecond timestamp key makes it safe to proceed to PutObject.
      if (status === 403 || status === 404) break;
      throw error;
    }
  }

  await client.send(new PutObjectCommand({
    Bucket: input.config.bucket,
    Key: objectKey,
    Body: input.pdf,
    ContentType: 'application/pdf',
    CacheControl: 'private, no-store',
    Metadata: {
      'archive-id': input.archiveId,
      'captured-at': input.capturedAt,
      'content-sha256': sha256,
      ...(input.kioskId ? { 'kiosk-id': input.kioskId } : {}),
    },
  }));
  return { objectKey, deduplicated: false, sha256 };
}
