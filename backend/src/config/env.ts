import { z } from 'zod';
import { config } from 'dotenv';

config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  API_URL: z.string().url(),
  
  DATABASE_URL: z.string().url(),
  
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  
  MINIO_ENDPOINT: z.string(),
  MINIO_PORT: z.string().default('9000'),
  MINIO_USE_SSL: z.string().transform(val => val === 'true').default('false'),
  MINIO_ACCESS_KEY: z.string(),
  MINIO_SECRET_KEY: z.string(),
  MINIO_BUCKET_MEDIA: z.string().default('whatsapp-media'),
  MINIO_BUCKET_AVATARS: z.string().default('avatars'),
  MINIO_BUCKET_DOCUMENTS: z.string().default('documents'),
  
  CORS_ORIGIN: z.string(),
  
  RATE_LIMIT_WINDOW_MS: z.string().default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100'),
});

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
