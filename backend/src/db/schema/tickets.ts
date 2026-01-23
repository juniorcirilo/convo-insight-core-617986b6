import { pgTable, text, uuid, timestamp, integer, json, boolean } from 'drizzle-orm/pg-core';
import { profiles, sectors } from './users.js';
import { whatsappConversations } from './whatsapp.js';

// Tickets
export const tickets = pgTable('tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').default('open'),
  priority: text('priority').default('medium'),
  category: text('category'),
  createdBy: uuid('created_by').references(() => profiles.id),
  assignedTo: uuid('assigned_to').references(() => profiles.id),
  sectorId: uuid('sector_id').references(() => sectors.id),
  conversationId: uuid('conversation_id').references(() => whatsappConversations.id),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  closedAt: timestamp('closed_at'),
});

// Ticket comments
export const ticketComments = pgTable('ticket_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => profiles.id),
  comment: text('comment').notNull(),
  isInternal: boolean('is_internal').default(false),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});
