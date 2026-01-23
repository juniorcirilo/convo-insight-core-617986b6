import { pgTable, text, uuid, timestamp, boolean, integer } from 'drizzle-orm/pg-core';
import { profiles } from './auth';

export const apiTokens = pgTable('api_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  token_prefix: text('token_prefix').notNull(),
  token_hash: text('token_hash').notNull(),
  permissions: text('permissions').array().notNull(),
  is_active: boolean('is_active').notNull().default(true),
  rate_limit_per_minute: integer('rate_limit_per_minute'),
  expires_at: timestamp('expires_at'),
  last_used_at: timestamp('last_used_at'),
  created_by: uuid('created_by').notNull().references(() => profiles.id),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const apiUsageLogs = pgTable('api_usage_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  token_id: uuid('token_id').references(() => apiTokens.id),
  endpoint: text('endpoint').notNull(),
  method: text('method').notNull(),
  status_code: integer('status_code'),
  response_time_ms: integer('response_time_ms'),
  ip_address: text('ip_address'),
  user_agent: text('user_agent'),
  created_at: timestamp('created_at').defaultNow(),
});
