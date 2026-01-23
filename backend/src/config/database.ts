import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from './env.js';

// Create postgres connection
const queryClient = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Create drizzle instance
export const db = drizzle(queryClient);

// Export query client for migrations
export { queryClient };
