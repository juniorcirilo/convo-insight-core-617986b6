import { Client } from 'minio';
import { config } from './env.js';

export const minioClient = new Client({
  endPoint: config.minio.endpoint,
  port: config.minio.port,
  useSSL: config.minio.useSSL,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey,
});

export const BUCKETS = {
  PROFILE_IMAGES: `${config.minio.bucketPrefix}-profile-images`,
  MESSAGE_MEDIA: `${config.minio.bucketPrefix}-message-media`,
  CAMPAIGN_MEDIA: `${config.minio.bucketPrefix}-campaign-media`,
  ATTACHMENTS: `${config.minio.bucketPrefix}-attachments`,
  EXPORTS: `${config.minio.bucketPrefix}-exports`,
} as const;

// Initialize buckets
export const initializeBuckets = async () => {
  console.log('Initializing MinIO buckets...');
  
  for (const [name, bucket] of Object.entries(BUCKETS)) {
    try {
      const exists = await minioClient.bucketExists(bucket);
      if (!exists) {
        await minioClient.makeBucket(bucket, 'us-east-1');
        console.log(`✓ Created bucket: ${bucket}`);
      } else {
        console.log(`✓ Bucket exists: ${bucket}`);
      }
    } catch (error) {
      console.error(`✗ Failed to create bucket ${bucket}:`, error);
    }
  }
};
