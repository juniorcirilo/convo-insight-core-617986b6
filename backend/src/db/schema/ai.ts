import { pgTable, text, uuid, timestamp, boolean, integer, json } from 'drizzle-orm/pg-core';
import { profiles, sectors } from './users.js';

// AI Agent configs
export const aiAgentConfigs = pgTable('ai_agent_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'cascade' }).notNull(),
  agentName: text('agent_name').default('AI Assistant'),
  isEnabled: boolean('is_enabled').default(true),
  autoReplyEnabled: boolean('auto_reply_enabled').default(false),
  maxAutoReplies: integer('max_auto_replies').default(3),
  responseDelaySeconds: integer('response_delay_seconds').default(2),
  welcomeMessage: text('welcome_message'),
  personaDescription: text('persona_description'),
  toneOfVoice: text('tone_of_voice'),
  businessContext: text('business_context'),
  productCatalog: text('product_catalog'),
  faqContext: text('faq_context'),
  customInstructions: text('custom_instructions'),
  escalationKeywords: text('escalation_keywords').array(),
  escalationAfterMinutes: integer('escalation_after_minutes').default(30),
  escalationOnNegativeSentiment: boolean('escalation_on_negative_sentiment').default(false),
  forbiddenTopics: text('forbidden_topics').array(),
  competitorHandling: text('competitor_handling'),
  objectionStyle: text('objection_style'),
  upsellEnabled: boolean('upsell_enabled').default(false),
  upsellTriggers: text('upsell_triggers').array(),
  maxDiscountPercent: integer('max_discount_percent'),
  workingDays: integer('working_days').array(),
  workingHoursStart: text('working_hours_start'),
  workingHoursEnd: text('working_hours_end'),
  workingTimezone: text('working_timezone'),
  outOfHoursMessage: text('out_of_hours_message'),
  knowledgeBaseEnabled: boolean('knowledge_base_enabled').default(false),
  learnFromAgents: boolean('learn_from_agents').default(false),
  personalityTraits: json('personality_traits'),
  communicationStyle: json('communication_style'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Business knowledge base
export const businessKnowledgeBase = pgTable('business_knowledge_base', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  category: text('category'),
  tags: text('tags').array(),
  isActive: boolean('is_active').default(true),
  createdBy: uuid('created_by').references(() => profiles.id),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Response templates
export const responseTemplates = pgTable('response_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  content: text('content').notNull(),
  category: text('category'),
  tags: text('tags').array(),
  isActive: boolean('is_active').default(true),
  createdBy: uuid('created_by').references(() => profiles.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Learning examples
export const learningExamples = pgTable('learning_examples', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'cascade' }).notNull(),
  userMessage: text('user_message').notNull(),
  agentResponse: text('agent_response').notNull(),
  context: text('context'),
  category: text('category'),
  rating: integer('rating'),
  isActive: boolean('is_active').default(true),
  createdBy: uuid('created_by').references(() => profiles.id),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

// AI response feedback
export const aiResponseFeedback = pgTable('ai_response_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id'),
  messageId: uuid('message_id'),
  userId: uuid('user_id').references(() => profiles.id),
  rating: integer('rating').notNull(),
  feedback: text('feedback'),
  suggestion: text('suggestion'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});
