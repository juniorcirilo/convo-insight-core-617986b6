import { minioClient, BUCKETS } from '../config/minio.js';
import { Readable } from 'stream';

export interface UploadOptions {
  bucket: keyof typeof BUCKETS;
  filename: string;
  file: Buffer | Readable;
  contentType?: string;
}

export const storageService = {
  async uploadFile(options: UploadOptions): Promise<string> {
    const bucketName = BUCKETS[options.bucket];
    const metadata = options.contentType
      ? { 'Content-Type': options.contentType }
      : undefined;

    if (Buffer.isBuffer(options.file)) {
      await minioClient.putObject(
        bucketName,
        options.filename,
        options.file,
        options.file.length,
        metadata
      );
    } else {
      await minioClient.putObject(
        bucketName,
        options.filename,
        options.file,
        metadata
      );
    }

    return options.filename;
  },

  async getFileUrl(
    bucket: keyof typeof BUCKETS,
    filename: string,
    expirySeconds: number = 3600
  ): Promise<string> {
    const bucketName = BUCKETS[bucket];
    return await minioClient.presignedGetObject(
      bucketName,
      filename,
      expirySeconds
    );
  },

  async deleteFile(bucket: keyof typeof BUCKETS, filename: string): Promise<void> {
    const bucketName = BUCKETS[bucket];
    await minioClient.removeObject(bucketName, filename);
  },

  async listFiles(bucket: keyof typeof BUCKETS, prefix?: string): Promise<string[]> {
    const bucketName = BUCKETS[bucket];
    const files: string[] = [];

    return new Promise((resolve, reject) => {
      const stream = minioClient.listObjects(bucketName, prefix, true);

      stream.on('data', (obj) => {
        if (obj.name) {
          files.push(obj.name);
        }
      });

      stream.on('end', () => resolve(files));
      stream.on('error', reject);
    });
  },

  async fileExists(bucket: keyof typeof BUCKETS, filename: string): Promise<boolean> {
    try {
      const bucketName = BUCKETS[bucket];
      await minioClient.statObject(bucketName, filename);
      return true;
    } catch {
      return false;
    }
  },

  async getFile(bucket: keyof typeof BUCKETS, filename: string): Promise<Readable> {
    const bucketName = BUCKETS[bucket];
    return await minioClient.getObject(bucketName, filename);
  },
};
