import { pgTable, text, uuid, timestamp, boolean, integer, json } from 'drizzle-orm/pg-core';
import { profiles } from './users.js';

// WhatsApp instances
export const whatsappInstances = pgTable('whatsapp_instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  phoneNumber: text('phone_number'),
  status: text('status').default('disconnected'),
  qrCode: text('qr_code'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  lastSyncAt: timestamp('last_sync_at'),
});

// WhatsApp contacts
export const whatsappContacts = pgTable('whatsapp_contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  instanceId: uuid('instance_id').references(() => whatsappInstances.id, { onDelete: 'cascade' }).notNull(),
  phoneNumber: text('phone_number').notNull(),
  name: text('name'),
  profilePicUrl: text('profile_pic_url'),
  isBlocked: boolean('is_blocked').default(false),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// WhatsApp conversations
export const whatsappConversations = pgTable('whatsapp_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  instanceId: uuid('instance_id').references(() => whatsappInstances.id, { onDelete: 'cascade' }).notNull(),
  contactId: uuid('contact_id').references(() => whatsappContacts.id, { onDelete: 'cascade' }).notNull(),
  assignedTo: uuid('assigned_to').references(() => profiles.id),
  status: text('status').default('open'),
  lastMessageAt: timestamp('last_message_at'),
  unreadCount: integer('unread_count').default(0),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// WhatsApp messages
export const whatsappMessages = pgTable('whatsapp_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => whatsappConversations.id, { onDelete: 'cascade' }).notNull(),
  messageId: text('message_id').notNull(),
  fromMe: boolean('from_me').default(false),
  body: text('body'),
  mediaUrl: text('media_url'),
  mediaType: text('media_type'),
  timestamp: timestamp('timestamp').notNull(),
  status: text('status').default('pending'),
  quotedMessageId: text('quoted_message_id'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});
