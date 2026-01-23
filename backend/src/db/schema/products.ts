import { pgTable, text, uuid, timestamp, boolean, integer, jsonb, real } from 'drizzle-orm/pg-core';

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  sector_id: uuid('sector_id'),
  name: text('name').notNull(),
  description: text('description'),
  sku: text('sku'),
  category: text('category').notNull(),
  base_price: real('base_price').notNull(),
  currency: text('currency').notNull(),
  min_quantity: integer('min_quantity').notNull(),
  max_discount_percent: integer('max_discount_percent').notNull(),
  images: text('images').array(),
  features: jsonb('features'),
  metadata: jsonb('metadata'),
  is_active: boolean('is_active').notNull().default(true),
  stripe_product_id: text('stripe_product_id'),
  stripe_price_id: text('stripe_price_id'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const productVariants = pgTable('product_variants', {
  id: uuid('id').primaryKey().defaultRandom(),
  product_id: uuid('product_id').notNull().references(() => products.id),
  name: text('name').notNull(),
  sku: text('sku'),
  price_modifier: real('price_modifier').notNull(),
  attributes: jsonb('attributes'),
  is_active: boolean('is_active').notNull().default(true),
  stripe_price_id: text('stripe_price_id'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});
