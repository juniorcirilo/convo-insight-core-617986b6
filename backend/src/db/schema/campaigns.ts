import { pgTable, text, uuid, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import { profiles } from './auth';
import { whatsappInstances, whatsappContacts } from './whatsapp';

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  instance_id: uuid('instance_id').notNull().references(() => whatsappInstances.id),
  name: text('name').notNull(),
  description: text('description'),
  message_type: text('message_type').notNull(),
  message_content: text('message_content').notNull(),
  media_url: text('media_url'),
  media_type: text('media_type'),
  media_mimetype: text('media_mimetype'),
  button_options: jsonb('button_options'),
  target_contacts: jsonb('target_contacts'),
  status: text('status').notNull(),
  scheduled_at: timestamp('scheduled_at'),
  started_at: timestamp('started_at'),
  completed_at: timestamp('completed_at'),
  total_recipients: integer('total_recipients'),
  sent_count: integer('sent_count'),
  delivered_count: integer('delivered_count'),
  read_count: integer('read_count'),
  failed_count: integer('failed_count'),
  created_by: uuid('created_by').references(() => profiles.id),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const campaignLogs = pgTable('campaign_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaign_id: uuid('campaign_id').notNull().references(() => campaigns.id),
  contact_id: uuid('contact_id').references(() => whatsappContacts.id),
  status: text('status').notNull(),
  sent_at: timestamp('sent_at'),
  delivered_at: timestamp('delivered_at'),
  read_at: timestamp('read_at'),
  button_clicked: text('button_clicked'),
  button_clicked_at: timestamp('button_clicked_at'),
  error_message: text('error_message'),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at').defaultNow(),
});
