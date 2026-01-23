import { pgTable, text, uuid, timestamp, boolean } from 'drizzle-orm/pg-core';

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  full_name: text('full_name').notNull(),
  email: text('email'),
  avatar_url: text('avatar_url'),
  is_active: boolean('is_active').notNull().default(true),
  is_approved: boolean('is_approved'),
  status: text('status'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const userRoles = pgTable('user_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => profiles.id),
  role: text('role').notNull(),
  created_at: timestamp('created_at').defaultNow(),
});

export const userSectors = pgTable('user_sectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => profiles.id),
  sector_id: uuid('sector_id').notNull(),
  is_primary: boolean('is_primary'),
  created_at: timestamp('created_at').defaultNow(),
});

export const sectors = pgTable('sectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  instance_id: uuid('instance_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  tipo_atendimento: text('tipo_atendimento'),
  gera_ticket: boolean('gera_ticket'),
  is_active: boolean('is_active'),
  is_default: boolean('is_default'),
  mensagem_boas_vindas: text('mensagem_boas_vindas'),
  mensagem_encerramento: text('mensagem_encerramento'),
  mensagem_reabertura: text('mensagem_reabertura'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const userPermissionOverrides = pgTable('user_permission_overrides', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => profiles.id),
  permission_key: text('permission_key').notNull(),
  is_enabled: boolean('is_enabled').notNull(),
  reason: text('reason'),
  created_by: uuid('created_by'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const sectorPermissions = pgTable('sector_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sector_id: uuid('sector_id').notNull().references(() => sectors.id),
  permission_key: text('permission_key').notNull(),
  is_enabled: boolean('is_enabled'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const permissionTypes = pgTable('permission_types', {
  key: text('key').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category'),
  default_for_admin: boolean('default_for_admin'),
  default_for_supervisor: boolean('default_for_supervisor'),
  default_for_agent: boolean('default_for_agent'),
  created_at: timestamp('created_at').defaultNow(),
});

export const permissionAuditLogs = pgTable('permission_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  target_type: text('target_type').notNull(),
  target_id: uuid('target_id').notNull(),
  permission_key: text('permission_key').notNull(),
  old_value: boolean('old_value'),
  new_value: boolean('new_value'),
  changed_by: uuid('changed_by').notNull().references(() => profiles.id),
  reason: text('reason'),
  metadata: text('metadata'),
  created_at: timestamp('created_at').defaultNow(),
});
