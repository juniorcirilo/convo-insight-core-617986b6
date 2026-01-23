import { pgTable, text, uuid, timestamp, boolean, integer, json, pgEnum } from 'drizzle-orm/pg-core';

// Enums
export const roleEnum = pgEnum('user_role', ['admin', 'supervisor', 'agent']);

// Profiles table (users)
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name'),
  avatarUrl: text('avatar_url'),
  phoneNumber: text('phone_number'),
  isApproved: boolean('is_approved').default(false),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  lastLoginAt: timestamp('last_login_at'),
  tokenVersion: integer('token_version').default(0),
});

// User roles
export const userRoles = pgTable('user_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
  role: roleEnum('role').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Sectors
export const sectors = pgTable('sectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// User sectors
export const userSectors = pgTable('user_sectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
  sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Refresh tokens
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
