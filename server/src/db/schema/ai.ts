import { pgTable, uuid, text, boolean, timestamp, integer, real, index } from 'drizzle-orm/pg-core';
import { profiles } from './users';
import { whatsappConversations, whatsappMessages } from './whatsapp';
import { sectors } from './sectors';

export const aiAgentConfigs = pgTable('ai_agent_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'cascade' }),
  
  // Basic Configuration
  name: text('name').notNull(),
  model: text('model').default('gpt-4o-mini'),
  systemPrompt: text('system_prompt'),
  
  // Response Settings
  maxTokens: integer('max_tokens').default(500),
  temperature: real('temperature').default(0.7),
  
  // Behavior Settings
  isActive: boolean('is_active').default(true),
  autoRespond: boolean('auto_respond').default(true),
  responseDelay: integer('response_delay'),
  
  // Escalation Settings
  escalateOnLowConfidence: boolean('escalate_on_low_confidence').default(true),
  confidenceThreshold: real('confidence_threshold').default(0.6),
  maxConsecutiveResponses: integer('max_consecutive_responses').default(5),
  
  // Personality (extended)
  personalityTraits: text('personality_traits'), // JSON
  communicationStyle: text('communication_style'), // JSON
  forbiddenTopics: text('forbidden_topics').array(),
  competitorHandling: text('competitor_handling').default('neutral'),
  objectionStyle: text('objection_style').default('empathetic'),
  upsellEnabled: boolean('upsell_enabled').default(false),
  upsellTriggers: text('upsell_triggers').array(),
  maxDiscountPercent: real('max_discount_percent').default(0),
  knowledgeBaseEnabled: boolean('knowledge_base_enabled').default(true),
  learnFromAgents: boolean('learn_from_agents').default(true),
  customInstructions: text('custom_instructions'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_ai_agent_configs_sector').on(table.sectorId),
  index('idx_ai_agent_configs_active').on(table.isActive),
]);

export const aiAgentSessions = pgTable('ai_agent_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  configId: uuid('config_id').references(() => aiAgentConfigs.id, { onDelete: 'set null' }),
  conversationId: uuid('conversation_id').references(() => whatsappConversations.id, { onDelete: 'cascade' }),
  
  // Session State
  status: text('status').default('active'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  endReason: text('end_reason'),
  
  // Context
  context: text('context'), // JSON
  conversationHistory: text('conversation_history'), // JSON
  
  // Metrics
  totalMessages: integer('total_messages').default(0),
  totalTokens: integer('total_tokens').default(0),
  avgResponseTime: integer('avg_response_time'),
  
  // Handoff fields
  handoffSummary: text('handoff_summary'),
  handoffContext: text('handoff_context'), // JSON
  handoffRequestedAt: timestamp('handoff_requested_at', { withTimezone: true }),
  escalationPriority: integer('escalation_priority').default(0),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_ai_agent_sessions_conversation').on(table.conversationId),
  index('idx_ai_agent_sessions_status').on(table.status),
  index('idx_ai_agent_sessions_config').on(table.configId),
]);

export const aiAgentLogs = pgTable('ai_agent_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => aiAgentSessions.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').references(() => whatsappConversations.id, { onDelete: 'cascade' }),
  
  // Log Details
  logType: text('log_type').notNull(),
  inputMessage: text('input_message'),
  outputMessage: text('output_message'),
  
  // AI Processing
  modelUsed: text('model_used'),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  totalTokens: integer('total_tokens'),
  processingTimeMs: integer('processing_time_ms'),
  
  // Quality
  confidence: real('confidence'),
  sentiment: text('sentiment'),
  intent: text('intent'),
  
  // Error handling
  errorMessage: text('error_message'),
  errorCode: text('error_code'),
  
  metadata: text('metadata'), // JSON
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_ai_agent_logs_session').on(table.sessionId),
  index('idx_ai_agent_logs_conversation').on(table.conversationId),
  index('idx_ai_agent_logs_type').on(table.logType),
  index('idx_ai_agent_logs_created').on(table.createdAt),
]);

export const leadQualificationCriteria = pgTable('lead_qualification_criteria', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'cascade' }).unique(),
  
  // BANT Keywords
  budgetKeywords: text('budget_keywords').array(),
  authorityKeywords: text('authority_keywords').array(),
  needKeywords: text('need_keywords').array(),
  timelineKeywords: text('timeline_keywords').array(),
  
  // Weights (0-100)
  budgetWeight: integer('budget_weight').default(25),
  authorityWeight: integer('authority_weight').default(25),
  needWeight: integer('need_weight').default(30),
  timelineWeight: integer('timeline_weight').default(20),
  
  // Thresholds
  autoQualifyThreshold: integer('auto_qualify_threshold').default(70),
  autoCreateLeadThreshold: integer('auto_create_lead_threshold').default(30),
  
  // Settings
  autoCreateLeads: boolean('auto_create_leads').default(true),
  qualificationEnabled: boolean('qualification_enabled').default(true),
  messagesBeforeQualification: integer('messages_before_qualification').default(5),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_lead_qualification_criteria_sector').on(table.sectorId),
]);

export const leadQualificationLogs = pgTable('lead_qualification_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id'),
  conversationId: uuid('conversation_id').references(() => whatsappConversations.id, { onDelete: 'set null' }),
  
  previousScore: integer('previous_score'),
  newScore: integer('new_score'),
  
  bantAnalysis: text('bant_analysis'), // JSON
  aiReasoning: text('ai_reasoning'),
  modelUsed: text('model_used'),
  tokensUsed: integer('tokens_used'),
  
  triggerSource: text('trigger_source'), // 'ai_response', 'webhook', 'manual'
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_lead_qualification_logs_lead').on(table.leadId),
  index('idx_lead_qualification_logs_conversation').on(table.conversationId),
  index('idx_lead_qualification_logs_created').on(table.createdAt),
]);

// AI Response Feedback
export const aiResponseFeedback = pgTable('ai_response_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  logId: uuid('log_id').references(() => aiAgentLogs.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').references(() => whatsappConversations.id, { onDelete: 'cascade' }),
  
  rating: integer('rating'),
  feedbackType: text('feedback_type'),
  
  correctedResponse: text('corrected_response'),
  correctionReason: text('correction_reason'),
  
  givenBy: uuid('given_by').references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_ai_feedback_conversation').on(table.conversationId),
  index('idx_ai_feedback_rating').on(table.rating),
]);
