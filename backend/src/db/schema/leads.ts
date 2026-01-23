import { pgTable, text, uuid, timestamp, integer, json, decimal } from 'drizzle-orm/pg-core';
import { profiles, sectors } from './users.js';
import { whatsappContacts } from './whatsapp.js';

// Leads
export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  contactId: uuid('contact_id').references(() => whatsappContacts.id),
  name: text('name').notNull(),
  email: text('email'),
  phoneNumber: text('phone_number').notNull(),
  company: text('company'),
  position: text('position'),
  status: text('status').default('new'),
  score: integer('score').default(0),
  source: text('source'),
  assignedTo: uuid('assigned_to').references(() => profiles.id),
  sectorId: uuid('sector_id').references(() => sectors.id),
  estimatedValue: decimal('estimated_value', { precision: 10, scale: 2 }),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Lead activities
export const leadActivities = pgTable('lead_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => profiles.id),
  activityType: text('activity_type').notNull(),
  description: text('description'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Lead qualification criteria
export const leadQualificationCriteria = pgTable('lead_qualification_criteria', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  weight: integer('weight').default(1),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Lead qualification logs
export const leadQualificationLogs = pgTable('lead_qualification_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }).notNull(),
  criteriaId: uuid('criteria_id').references(() => leadQualificationCriteria.id),
  score: integer('score').notNull(),
  reason: text('reason'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});
