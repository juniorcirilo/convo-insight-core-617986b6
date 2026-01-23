import { pgTable, text, uuid, timestamp, boolean, integer, jsonb } from 'drizzle-orm/pg-core';
import { profiles } from './auth';

export const webhooks = pgTable('webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  events: text('events').array().notNull(),
  is_active: boolean('is_active').notNull().default(true),
  secret_key: text('secret_key'),
  headers: jsonb('headers'),
  retry_count: integer('retry_count'),
  timeout_ms: integer('timeout_ms'),
  last_triggered_at: timestamp('last_triggered_at'),
  last_success_at: timestamp('last_success_at'),
  last_failure_at: timestamp('last_failure_at'),
  failure_count: integer('failure_count'),
  created_by: uuid('created_by').references(() => profiles.id),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const webhookLogs = pgTable('webhook_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  webhook_id: uuid('webhook_id').notNull().references(() => webhooks.id),
  event: text('event').notNull(),
  payload: jsonb('payload').notNull(),
  success: boolean('success').notNull(),
  response_status: integer('response_status'),
  response_body: text('response_body'),
  response_time_ms: integer('response_time_ms'),
  error_message: text('error_message'),
  attempt_number: integer('attempt_number'),
  created_at: timestamp('created_at').defaultNow(),
});
