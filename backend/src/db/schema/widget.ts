import { pgTable, text, uuid, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core';
import { profiles } from './auth';
import { whatsappInstances, whatsappConversations } from './whatsapp';

export const widgetConfigs = pgTable('widget_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  instance_id: uuid('instance_id').references(() => whatsappInstances.id),
  name: text('name').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  position: text('position').notNull(),
  primary_color: text('primary_color').notNull(),
  button_size: text('button_size').notNull(),
  welcome_title: text('welcome_title').notNull(),
  welcome_message: text('welcome_message').notNull(),
  offline_message: text('offline_message').notNull(),
  business_hours_enabled: boolean('business_hours_enabled').notNull(),
  business_hours: jsonb('business_hours'),
  require_name: boolean('require_name').notNull(),
  require_email: boolean('require_email').notNull(),
  require_phone: boolean('require_phone').notNull(),
  allowed_domains: text('allowed_domains').array(),
  created_by: uuid('created_by').references(() => profiles.id),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const widgetConversations = pgTable('widget_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  widget_config_id: uuid('widget_config_id').references(() => widgetConfigs.id),
  conversation_id: uuid('conversation_id').references(() => whatsappConversations.id),
  visitor_token: text('visitor_token').notNull(),
  visitor_name: text('visitor_name'),
  visitor_email: text('visitor_email'),
  visitor_phone: text('visitor_phone'),
  status: text('status').notNull(),
  page_url: text('page_url'),
  referrer_url: text('referrer_url'),
  ip_address: text('ip_address'),
  user_agent: text('user_agent'),
  last_message_at: timestamp('last_message_at'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const widgetMessages = pgTable('widget_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  widget_conversation_id: uuid('widget_conversation_id').notNull().references(() => widgetConversations.id),
  content: text('content').notNull(),
  is_from_visitor: boolean('is_from_visitor').notNull(),
  sent_by: uuid('sent_by').references(() => profiles.id),
  created_at: timestamp('created_at').defaultNow(),
});
