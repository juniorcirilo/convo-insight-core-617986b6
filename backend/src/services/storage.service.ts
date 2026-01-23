import { Request, Response, NextFunction } from 'express';
import { minioClient, BUCKETS } from '../config/minio.js';
import { AppError } from '../middleware/error.js';
import { v4 as uuidv4 } from 'uuid';

export class StorageService {
  static async uploadFile(
    bucket: keyof typeof BUCKETS,
    file: Express.Multer.File,
    metadata?: Record<string, string>
  ): Promise<{ fileName: string; url: string }> {
    const bucketName = BUCKETS[bucket];
    const fileName = `${uuidv4()}-${file.originalname}`;
    
    try {
      await minioClient.putObject(
        bucketName,
        fileName,
        file.buffer,
        file.size,
        {
          'Content-Type': file.mimetype,
          ...metadata,
        }
      );

      return {
        fileName,
        url: `/api/storage/${bucketName}/${fileName}`,
      };
    } catch (error) {
      console.error('MinIO upload error:', error);
      throw new AppError(500, 'Failed to upload file');
    }
  }

  static async getFile(bucket: string, fileName: string) {
    try {
      const stream = await minioClient.getObject(bucket, fileName);
      const stat = await minioClient.statObject(bucket, fileName);
      
      return { stream, stat };
    } catch (error) {
      console.error('MinIO get file error:', error);
      throw new AppError(404, 'File not found');
    }
  }

  static async deleteFile(bucket: string, fileName: string): Promise<void> {
    try {
      await minioClient.removeObject(bucket, fileName);
    } catch (error) {
      console.error('MinIO delete error:', error);
      throw new AppError(500, 'Failed to delete file');
    }
  }

  static async generatePresignedUrl(
    bucket: string,
    fileName: string,
    expirySeconds: number = 3600
  ): Promise<string> {
    try {
      const url = await minioClient.presignedGetObject(bucket, fileName, expirySeconds);
      return url;
    } catch (error) {
      console.error('MinIO presigned URL error:', error);
      throw new AppError(500, 'Failed to generate URL');
    }
  }

  static async listFiles(bucket: string, prefix?: string): Promise<MinIOObjectInfo[]> {
    try {
      const objectsList: MinIOObjectInfo[] = [];
      const stream = minioClient.listObjects(bucket, prefix, true);

      return new Promise((resolve, reject) => {
        stream.on('data', (obj) => objectsList.push(obj));
        stream.on('error', reject);
        stream.on('end', () => resolve(objectsList));
      });
    } catch (error) {
      console.error('MinIO list error:', error);
      throw new AppError(500, 'Failed to list files');
    }
  }
}

// MinIO object info type
interface MinIOObjectInfo {
  name: string;
  prefix?: string;
  size: number;
  etag: string;
  lastModified: Date;
}
