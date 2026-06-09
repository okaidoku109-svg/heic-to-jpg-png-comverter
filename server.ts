/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import multer from 'multer';
// @ts-ignore
import convert from 'heic-convert';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // multer configuration in memory for safe temporary file uploads
  const upload = multer({
    limits: {
      fileSize: 50 * 1024 * 1024, // Limit to 50MB per HEIC file
    }
  });

  // Enable JSON request body parsing
  app.use(express.json());

  // 1. HEIC Conversion API Route
  // This endpoint bypasses the Web Worker Security/Sandbox issue inside the preview iframe!
  app.post('/api/convert', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        console.warn('Conversion requested without a file upload');
        return res.status(400).json({ error: 'ファイルがアップロードされていません。' });
      }

      const targetFormat = (req.body.format || 'jpeg').toUpperCase(); // 'JPEG' or 'PNG'
      const quality = parseFloat(req.body.quality || '0.85');

      if (targetFormat !== 'JPEG' && targetFormat !== 'PNG') {
        return res.status(400).json({ error: 'サポートされていない出力形式です。JPEGまたはPNGを指定してください。' });
      }

      console.log(`Converting ${req.file.originalname} (${req.file.size} bytes) to ${targetFormat} on server side...`);

      // Execute HEIC to JPEG/PNG conversion using pure node converter
      const outputBuffer = await convert({
        buffer: req.file.buffer,
        format: targetFormat,
        quality: targetFormat === 'JPEG' ? quality : undefined
      });

      console.log(`Conversion successful! Output size: ${outputBuffer.length} bytes`);

      // Set correct content type
      const mimeType = targetFormat === 'JPEG' ? 'image/jpeg' : 'image/png';
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', outputBuffer.length);
      
      // Send the output buffer as response
      return res.end(outputBuffer);
    } catch (err: any) {
      console.error('Server-side HEIC Conversion failed:', err);
      return res.status(500).json({ 
        error: `サーバー側の変換に失敗しました: ${err.message || 'データ構造が正常ではありません。'}` 
      });
    }
  });

  // 2. Health check route
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', localTime: new Date().toISOString() });
  });

  // 3. Vite middleware for development or fallback static file serving for production
  if (process.env.NODE_ENV !== 'production') {
    console.log('Spawning Vite Dev Server middleware on Express...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('Serving production static build from dist folder...');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Full-stack server currently running on: http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('System failed to start backend server:', err);
  process.exit(1);
});
