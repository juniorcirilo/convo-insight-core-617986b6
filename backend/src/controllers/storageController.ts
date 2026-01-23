import { Request, Response } from 'express';
import multer from 'multer';
import { storageService } from '../services/storageService.js';
import { BUCKETS } from '../config/minio.js';

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

export const uploadMiddleware = upload.single('file');

export const storageController = {
  async upload(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const { bucket } = req.body;
      if (!bucket || !(bucket in BUCKETS)) {
        res.status(400).json({ error: 'Invalid bucket' });
        return;
      }

      const filename = `${Date.now()}-${req.file.originalname}`;
      
      await storageService.uploadFile({
        bucket: bucket as keyof typeof BUCKETS,
        filename,
        file: req.file.buffer,
        contentType: req.file.mimetype,
      });

      const url = await storageService.getFileUrl(
        bucket as keyof typeof BUCKETS,
        filename
      );

      res.json({ filename, url });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      res.status(500).json({ error: message });
    }
  },

  async getFile(req: Request, res: Response): Promise<void> {
    try {
      const { bucket, filename } = req.params;

      if (!bucket || !(bucket in BUCKETS)) {
        res.status(400).json({ error: 'Invalid bucket' });
        return;
      }

      const url = await storageService.getFileUrl(
        bucket as keyof typeof BUCKETS,
        filename
      );

      res.json({ url });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'File not found';
      res.status(404).json({ error: message });
    }
  },

  async deleteFile(req: Request, res: Response): Promise<void> {
    try {
      const { bucket, filename } = req.params;

      if (!bucket || !(bucket in BUCKETS)) {
        res.status(400).json({ error: 'Invalid bucket' });
        return;
      }

      await storageService.deleteFile(
        bucket as keyof typeof BUCKETS,
        filename
      );

      res.json({ message: 'File deleted successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete failed';
      res.status(500).json({ error: message });
    }
  },

  async listFiles(req: Request, res: Response): Promise<void> {
    try {
      const { bucket } = req.params;
      const { prefix } = req.query;

      if (!bucket || !(bucket in BUCKETS)) {
        res.status(400).json({ error: 'Invalid bucket' });
        return;
      }

      const files = await storageService.listFiles(
        bucket as keyof typeof BUCKETS,
        prefix as string | undefined
      );

      res.json({ files });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'List failed';
      res.status(500).json({ error: message });
    }
  },
};
