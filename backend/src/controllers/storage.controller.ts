import { Request, Response, NextFunction } from 'express';
import { StorageService } from '../services/storage.service.js';
import { AuthRequest } from '../middleware/auth.js';
import { BUCKETS } from '../config/minio.js';

export class StorageController {
  static async upload(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { bucket } = req.params;
      
      if (!req.file) {
        res.status(400).json({ error: 'No file provided' });
        return;
      }

      // Validate bucket with proper type checking
      const validBuckets = Object.keys(BUCKETS);
      const bucketKey = Object.keys(BUCKETS).find(
        k => BUCKETS[k as keyof typeof BUCKETS] === bucket
      ) as keyof typeof BUCKETS | undefined;

      if (!bucketKey) {
        res.status(400).json({ error: 'Invalid bucket' });
        return;
      }

      const result = await StorageService.uploadFile(
        bucketKey,
        req.file as Express.Multer.File,
        {
          uploadedBy: req.user?.userId || 'anonymous',
        }
      );

      res.json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async download(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { bucket, fileName } = req.params;
      
      const { stream, stat } = await StorageService.getFile(bucket, fileName);
      
      res.setHeader('Content-Type', stat.metaData['content-type'] || 'application/octet-stream');
      res.setHeader('Content-Length', stat.size);
      
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { bucket, fileName } = req.params;
      
      await StorageService.deleteFile(bucket, fileName);
      
      res.json({
        status: 'success',
        message: 'File deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async getPresignedUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { bucket, fileName } = req.params;
      const expirySeconds = parseInt(req.query.expiry as string) || 3600;
      
      const url = await StorageService.generatePresignedUrl(bucket, fileName, expirySeconds);
      
      res.json({
        status: 'success',
        data: { url },
      });
    } catch (error) {
      next(error);
    }
  }
}
