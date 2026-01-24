import { pgTable, uuid, text, boolean, timestamp, unique } from 'drizzle-orm/pg-core';
import { profiles } from './users';
import { whatsappInstances } from './whatsapp';

export const sectors = pgTable('sectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  instanceId: uuid('instance_id').references(() => whatsappInstances.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true),
  tipoAtendimento: text('tipo_atendimento').default('humano'),
  geraTicket: boolean('gera_ticket').default(false),
  mensagemBoasVindas: text('mensagem_boas_vindas'),
  mensagemEncerramento: text('mensagem_encerramento'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const userSectors = pgTable('user_sectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }),
  sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'cascade' }),
  isPrimary: boolean('is_primary').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  unique('user_sectors_unique').on(table.userId, table.sectorId)
]);
