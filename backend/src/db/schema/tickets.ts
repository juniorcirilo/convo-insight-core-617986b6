import { pgTable, text, uuid, timestamp, integer, boolean } from 'drizzle-orm/pg-core';
import { profiles } from './auth';
import { whatsappConversations } from './whatsapp';

export const tickets = pgTable('tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  numero: integer('numero').notNull(),
  conversation_id: uuid('conversation_id').notNull().references(() => whatsappConversations.id),
  sector_id: uuid('sector_id').notNull(),
  atendente_id: uuid('atendente_id').references(() => profiles.id),
  status: text('status').notNull(),
  prioridade: text('prioridade'),
  categoria: text('categoria'),
  canal: text('canal'),
  first_response_at: timestamp('first_response_at'),
  closed_at: timestamp('closed_at'),
  closed_by: uuid('closed_by').references(() => profiles.id),
  sla_violated_at: timestamp('sla_violated_at'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const feedbacks = pgTable('feedbacks', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticket_id: uuid('ticket_id').notNull().references(() => tickets.id),
  nota: integer('nota').notNull(),
  comentario: text('comentario'),
  created_at: timestamp('created_at').defaultNow(),
});

export const kanbanColumnsConfig = pgTable('kanban_columns_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  sector_id: uuid('sector_id').notNull(),
  column_id: text('column_id').notNull(),
  custom_title: text('custom_title').notNull(),
  display_order: integer('display_order'),
  color: text('color'),
  icon: text('icon'),
  is_active: boolean('is_active'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});
