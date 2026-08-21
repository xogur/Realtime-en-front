import 'server-only';

import { existsSync } from 'node:fs';
import puppeteer, { type Browser } from 'puppeteer-core';
import type { ReportLayoutMode } from '@/lib/reportArchiveTypes';
import type { ReportArchiveConfig } from '@/server/reportArchiveConfig';

const PDF_TIMEOUT_MS = 20_000;
const globalRenderer = globalThis as typeof globalThis & {
  __reportPdfBrowser?: Promise<Browser>;
  __reportPdfActive?: number;
};

function resolveExecutable(configured?: string): string {
  const candidates = [
    configured,
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    process.env.PROGRAMFILES ? `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe` : undefined,
    process.env['PROGRAMFILES(X86)'] ? `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe` : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate));
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) throw new Error('Chromium executable was not found');
  return executable;
}

async function getBrowser(config: ReportArchiveConfig): Promise<Browser> {
  globalRenderer.__reportPdfBrowser ??= puppeteer.launch({
    executablePath: resolveExecutable(config.chromiumExecutablePath),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    return await globalRenderer.__reportPdfBrowser;
  } catch (error) {
    globalRenderer.__reportPdfBrowser = undefined;
    throw error;
  }
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

export async function renderReportPdf(input: {
  html: string;
  styleSheetPaths: string[];
  layoutMode: ReportLayoutMode;
  config: ReportArchiveConfig;
}): Promise<Buffer> {
  const active = globalRenderer.__reportPdfActive ?? 0;
  if (active >= input.config.maxConcurrency) throw new Error('RENDERER_BUSY');
  globalRenderer.__reportPdfActive = active + 1;

  let page: Awaited<ReturnType<Browser['newPage']>> | undefined;
  try {
    const browser = await getBrowser(input.config);
    page = await browser.newPage();
    page.setDefaultTimeout(PDF_TIMEOUT_MS);
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      if (url === 'about:blank' || url.startsWith('data:')) return void request.continue();
      try {
        const parsed = new URL(url);
        const allowed = parsed.origin === input.config.renderOrigin
          && parsed.pathname.startsWith('/_next/static/');
        if (allowed) void request.continue();
        else void request.abort();
      } catch {
        void request.abort();
      }
    });
    await page.emulateMediaType('print');
    const styleLinks = input.styleSheetPaths
      .map((path) => `<link rel="stylesheet" href="${escapeAttribute(`${input.config.renderOrigin}${path}`)}">`)
      .join('');
    await page.setContent(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><base href="${escapeAttribute(input.config.renderOrigin)}/"><style>html,body{margin:0;background:#fff}</style>${styleLinks}</head><body>${input.html}</body></html>`, {
      waitUntil: 'load',
      timeout: PDF_TIMEOUT_MS,
    });
    await page.waitForNetworkIdle({ idleTime: 250, timeout: PDF_TIMEOUT_MS });
    await page.evaluate(() => document.fonts?.ready);
    const pdf = await page.pdf({
      format: 'A4',
      preferCSSPageSize: true,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      timeout: PDF_TIMEOUT_MS,
    });
    const buffer = Buffer.from(pdf);
    if (buffer.length < 10_000 || buffer.length > 20 * 1024 * 1024 || buffer.subarray(0, 5).toString() !== '%PDF-') {
      throw new Error('Generated PDF failed validation');
    }
    return buffer;
  } finally {
    await page?.close().catch(() => undefined);
    globalRenderer.__reportPdfActive = Math.max(0, (globalRenderer.__reportPdfActive ?? 1) - 1);
  }
}
