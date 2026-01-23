import * as Minio from 'minio';
import { env } from './env.js';

export const minioClient = new Minio.Client({
  endPoint: env.MINIO_ENDPOINT,
  port: parseInt(env.MINIO_PORT),
  useSSL: env.MINIO_USE_SSL,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

// Buckets to be created
export const BUCKETS = {
  MEDIA: env.MINIO_BUCKET_MEDIA,
  AVATARS: env.MINIO_BUCKET_AVATARS,
  DOCUMENTS: env.MINIO_BUCKET_DOCUMENTS,
};

// Initialize buckets
export async function initializeBuckets() {
  for (const bucket of Object.values(BUCKETS)) {
    const exists = await minioClient.bucketExists(bucket);
    if (!exists) {
      await minioClient.makeBucket(bucket, 'us-east-1');
      console.log(`Created bucket: ${bucket}`);
    }
  }
}
