/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import formidable from 'formidable';
import fs from 'fs/promises';
// Vercel serverless payload limit is ~4.5MB
const MAX_FILE_SIZE = 4 * 1024 * 1024;

export const config = {
  api: {
    bodyParser: false,
  },
};

function getFieldValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POSTメソッドのみ対応しています。' });
  }

  let tempFilePath: string | undefined;

  try {
    const form = formidable({
      maxFileSize: MAX_FILE_SIZE,
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);
    const uploaded = files.file;
    const file = Array.isArray(uploaded) ? uploaded[0] : uploaded;

    if (!file) {
      return res.status(400).json({ error: 'ファイルがアップロードされていません。' });
    }

    tempFilePath = file.filepath;

    const targetFormat = (getFieldValue(fields.format) || 'jpeg').toUpperCase();
    const quality = parseFloat(getFieldValue(fields.quality) || '0.85');

    if (targetFormat !== 'JPEG' && targetFormat !== 'PNG') {
      return res.status(400).json({ error: 'サポートされていない出力形式です。JPEGまたはPNGを指定してください。' });
    }

    const fileBuffer = await fs.readFile(file.filepath);

    // Dynamic import keeps cold-start smaller for the health route
    const { default: convert } = await import('heic-convert');

    const outputBuffer = await convert({
      buffer: fileBuffer,
      format: targetFormat,
      quality: targetFormat === 'JPEG' ? quality : undefined,
    });

    const mimeType = targetFormat === 'JPEG' ? 'image/jpeg' : 'image/png';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(outputBuffer.length));
    return res.status(200).send(Buffer.from(outputBuffer));
  } catch (err: unknown) {
    console.error('Server-side HEIC conversion failed:', err);
    const message = err instanceof Error ? err.message : 'データ構造が正常ではありません。';
    return res.status(500).json({
      error: `サーバー側の変換に失敗しました: ${message}`,
    });
  } finally {
    if (tempFilePath) {
      await fs.unlink(tempFilePath).catch(() => undefined);
    }
  }
}
