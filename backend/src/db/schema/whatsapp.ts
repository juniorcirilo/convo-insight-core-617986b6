import { pgTable, text, uuid, timestamp, boolean, integer, jsonb } from 'drizzle-orm/pg-core';
import { profiles } from './auth';

export const whatsappInstances = pgTable('whatsapp_instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  instance_name: text('instance_name').notNull(),
  instance_id_external: text('instance_id_external'),
  provider_type: text('provider_type').notNull(),
  status: text('status'),
  qr_code: text('qr_code'),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const whatsappInstanceSecrets = pgTable('whatsapp_instance_secrets', {
  id: uuid('id').primaryKey().defaultRandom(),
  instance_id: uuid('instance_id').notNull().references(() => whatsappInstances.id),
  api_url: text('api_url').notNull(),
  api_key: text('api_key').notNull(),
  webhook_endpoint: text('webhook_endpoint'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const whatsappContacts = pgTable('whatsapp_contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  instance_id: uuid('instance_id').notNull().references(() => whatsappInstances.id),
  phone_number: text('phone_number').notNull(),
  name: text('name').notNull(),
  email: text('email'),
  profile_picture_url: text('profile_picture_url'),
  is_group: boolean('is_group'),
  sector_id: uuid('sector_id'),
  notes: text('notes'),
  metadata: jsonb('metadata'),
  opt_in: boolean('opt_in'),
  opt_in_updated_at: timestamp('opt_in_updated_at'),
  source: text('source'),
  lid: text('lid'),
  created_by: uuid('created_by'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const whatsappConversations = pgTable('whatsapp_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  instance_id: uuid('instance_id').notNull().references(() => whatsappInstances.id),
  contact_id: uuid('contact_id').notNull().references(() => whatsappContacts.id),
  sector_id: uuid('sector_id'),
  assigned_to: uuid('assigned_to').references(() => profiles.id),
  status: text('status'),
  conversation_mode: text('conversation_mode'),
  last_message_at: timestamp('last_message_at'),
  last_message_preview: text('last_message_preview'),
  unread_count: integer('unread_count'),
  messages_since_qualification: integer('messages_since_qualification'),
  last_qualification_at: timestamp('last_qualification_at'),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const whatsappMessages = pgTable('whatsapp_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  message_id: text('message_id').notNull(),
  conversation_id: uuid('conversation_id').notNull().references(() => whatsappConversations.id),
  remote_jid: text('remote_jid').notNull(),
  content: text('content').notNull(),
  message_type: text('message_type'),
  timestamp: timestamp('timestamp').notNull(),
  is_from_me: boolean('is_from_me'),
  from_bot: boolean('from_bot').notNull().default(false),
  is_internal: boolean('is_internal').notNull().default(false),
  is_supervisor_message: boolean('is_supervisor_message'),
  sender_name: text('sender_name'),
  sender_lid: text('sender_lid'),
  sent_by: uuid('sent_by'),
  media_url: text('media_url'),
  media_mimetype: text('media_mimetype'),
  audio_transcription: text('audio_transcription'),
  transcription_status: text('transcription_status'),
  quoted_message_id: text('quoted_message_id'),
  status: text('status'),
  ticket_id: uuid('ticket_id'),
  original_content: text('original_content'),
  edited_at: timestamp('edited_at'),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at').defaultNow(),
});

export const whatsappMessageEditHistory = pgTable('whatsapp_message_edit_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  message_id: uuid('message_id').notNull().references(() => whatsappMessages.id),
  conversation_id: uuid('conversation_id').notNull().references(() => whatsappConversations.id),
  previous_content: text('previous_content').notNull(),
  edited_at: timestamp('edited_at').notNull(),
  created_at: timestamp('created_at').defaultNow(),
});

export const whatsappReactions = pgTable('whatsapp_reactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  message_id: uuid('message_id').notNull().references(() => whatsappMessages.id),
  conversation_id: uuid('conversation_id').notNull().references(() => whatsappConversations.id),
  emoji: text('emoji').notNull(),
  reactor_jid: text('reactor_jid').notNull(),
  is_from_me: boolean('is_from_me'),
  created_at: timestamp('created_at').defaultNow(),
});

export const whatsappConversationNotes = pgTable('whatsapp_conversation_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversation_id: uuid('conversation_id').notNull().references(() => whatsappConversations.id),
  content: text('content').notNull(),
  is_pinned: boolean('is_pinned'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const whatsappConversationSummaries = pgTable('whatsapp_conversation_summaries', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversation_id: uuid('conversation_id').notNull().references(() => whatsappConversations.id),
  summary: text('summary').notNull(),
  key_points: jsonb('key_points'),
  action_items: jsonb('action_items'),
  sentiment_at_time: text('sentiment_at_time'),
  messages_count: integer('messages_count'),
  period_start: timestamp('period_start'),
  period_end: timestamp('period_end'),
  created_at: timestamp('created_at').defaultNow(),
});

export const whatsappSentimentAnalysis = pgTable('whatsapp_sentiment_analysis', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversation_id: uuid('conversation_id').notNull().references(() => whatsappConversations.id),
  contact_id: uuid('contact_id').notNull().references(() => whatsappContacts.id),
  sentiment: text('sentiment').notNull(),
  confidence_score: integer('confidence_score'),
  reasoning: text('reasoning'),
  summary: text('summary'),
  messages_analyzed: integer('messages_analyzed'),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at').defaultNow(),
});

export const whatsappSentimentHistory = pgTable('whatsapp_sentiment_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversation_id: uuid('conversation_id').notNull().references(() => whatsappConversations.id),
  contact_id: uuid('contact_id').notNull().references(() => whatsappContacts.id),
  sentiment: text('sentiment').notNull(),
  confidence_score: integer('confidence_score'),
  summary: text('summary'),
  messages_analyzed: integer('messages_analyzed'),
  created_at: timestamp('created_at').defaultNow(),
});

export const whatsappTopicsHistory = pgTable('whatsapp_topics_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversation_id: uuid('conversation_id').notNull().references(() => whatsappConversations.id),
  contact_id: uuid('contact_id').notNull().references(() => whatsappContacts.id),
  topics: text('topics').array().notNull(),
  primary_topic: text('primary_topic'),
  ai_confidence: integer('ai_confidence'),
  ai_reasoning: text('ai_reasoning'),
  categorization_model: text('categorization_model'),
  created_at: timestamp('created_at').defaultNow(),
});

export const whatsappMacros = pgTable('whatsapp_macros', {
  id: uuid('id').primaryKey().defaultRandom(),
  instance_id: uuid('instance_id').references(() => whatsappInstances.id),
  name: text('name').notNull(),
  shortcut: text('shortcut').notNull(),
  content: text('content').notNull(),
  description: text('description'),
  category: text('category'),
  is_active: boolean('is_active'),
  usage_count: integer('usage_count'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const conversationAssignments = pgTable('conversation_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversation_id: uuid('conversation_id').notNull().references(() => whatsappConversations.id),
  assigned_to: uuid('assigned_to').notNull().references(() => profiles.id),
  assigned_from: uuid('assigned_from'),
  assigned_by: uuid('assigned_by'),
  reason: text('reason'),
  created_at: timestamp('created_at').defaultNow(),
});

export const assignmentRules = pgTable('assignment_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  instance_id: uuid('instance_id'),
  sector_id: uuid('sector_id'),
  rule_type: text('rule_type').notNull(),
  fixed_agent_id: uuid('fixed_agent_id').references(() => profiles.id),
  round_robin_agents: uuid('round_robin_agents').array(),
  round_robin_last_index: integer('round_robin_last_index'),
  is_active: boolean('is_active'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});
