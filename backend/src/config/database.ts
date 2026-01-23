import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from './env.js';
import * as schema from '../db/schema/index.js';

// Create postgres connection
const queryClient = postgres(config.database.url);

// Create drizzle instance
export const db = drizzle(queryClient, { schema });

// Function to close the database connection
export const closeDatabase = async () => {
  await queryClient.end();
};
