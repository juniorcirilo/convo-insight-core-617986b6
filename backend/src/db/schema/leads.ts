import { pgTable, text, uuid, timestamp, integer, jsonb, real, boolean } from 'drizzle-orm/pg-core';
import { profiles } from './auth';
import { whatsappContacts, whatsappConversations } from './whatsapp';

export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  company: text('company'),
  contact_id: uuid('contact_id').references(() => whatsappContacts.id),
  conversation_id: uuid('conversation_id').references(() => whatsappConversations.id),
  sector_id: uuid('sector_id'),
  status: text('status').notNull(),
  source: text('source').notNull(),
  assigned_to: uuid('assigned_to').references(() => profiles.id),
  lead_score: integer('lead_score'),
  value: real('value'),
  probability: integer('probability'),
  expected_close_date: timestamp('expected_close_date'),
  qualification_data: jsonb('qualification_data'),
  bant_need: jsonb('bant_need'),
  bant_budget: jsonb('bant_budget'),
  bant_authority: jsonb('bant_authority'),
  bant_timeline: jsonb('bant_timeline'),
  pipeline_insight: jsonb('pipeline_insight'),
  qualified_at: timestamp('qualified_at'),
  qualified_by: uuid('qualified_by').references(() => profiles.id),
  last_qualification_at: timestamp('last_qualification_at'),
  closed_at: timestamp('closed_at'),
  notes: text('notes'),
  tags: text('tags').array(),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const leadQualificationCriteria = pgTable('lead_qualification_criteria', {
  id: uuid('id').primaryKey().defaultRandom(),
  sector_id: uuid('sector_id'),
  qualification_enabled: boolean('qualification_enabled'),
  auto_create_leads: boolean('auto_create_leads'),
  auto_create_lead_threshold: integer('auto_create_lead_threshold'),
  auto_qualify_threshold: integer('auto_qualify_threshold'),
  messages_before_qualification: integer('messages_before_qualification'),
  need_keywords: text('need_keywords').array(),
  need_weight: real('need_weight'),
  budget_keywords: text('budget_keywords').array(),
  budget_weight: real('budget_weight'),
  authority_keywords: text('authority_keywords').array(),
  authority_weight: real('authority_weight'),
  timeline_keywords: text('timeline_keywords').array(),
  timeline_weight: real('timeline_weight'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const leadQualificationLogs = pgTable('lead_qualification_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  lead_id: uuid('lead_id').references(() => leads.id),
  conversation_id: uuid('conversation_id'),
  bant_analysis: jsonb('bant_analysis').notNull(),
  previous_score: integer('previous_score'),
  new_score: integer('new_score'),
  score_change: integer('score_change'),
  ai_reasoning: text('ai_reasoning'),
  model_used: text('model_used'),
  tokens_used: integer('tokens_used'),
  trigger_source: text('trigger_source'),
  created_at: timestamp('created_at').defaultNow(),
});

export const leadActivities = pgTable('lead_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  lead_id: uuid('lead_id').notNull().references(() => leads.id),
  activity_type: text('activity_type').notNull(),
  description: text('description'),
  old_value: text('old_value'),
  new_value: text('new_value'),
  user_id: uuid('user_id'),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at').defaultNow(),
});

export const leadStatusHistory = pgTable('lead_status_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  lead_id: uuid('lead_id').notNull().references(() => leads.id),
  old_status: text('old_status'),
  new_status: text('new_status').notNull(),
  reason: text('reason'),
  changed_by: uuid('changed_by'),
  created_at: timestamp('created_at').defaultNow(),
});

export const salesTargets = pgTable('sales_targets', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').references(() => profiles.id),
  period_start: timestamp('period_start').notNull(),
  period_end: timestamp('period_end').notNull(),
  target_value: real('target_value').notNull(),
  target_leads: integer('target_leads'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});
