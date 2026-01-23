import { pgTable, text, uuid, timestamp, integer } from 'drizzle-orm/pg-core';
import { tickets } from './tickets';

export const slaConfig = pgTable('sla_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  prioridade: text('prioridade').notNull(),
  tempo_primeira_resposta_minutos: integer('tempo_primeira_resposta_minutos').notNull(),
  tempo_resolucao_minutos: integer('tempo_resolucao_minutos').notNull(),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const slaViolations = pgTable('sla_violations', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticket_id: uuid('ticket_id').notNull().references(() => tickets.id),
  violation_type: text('violation_type').notNull(),
  expected_at: timestamp('expected_at').notNull(),
  violated_at: timestamp('violated_at').notNull(),
  created_at: timestamp('created_at').defaultNow(),
});
