import { pgTable, text, uuid, timestamp } from 'drizzle-orm/pg-core';

export const projectConfig = pgTable('project_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});
