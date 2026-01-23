import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

config();

const schema = {
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
  schema: './src/db/schema',
  out: './src/db/migrations',
};

export default schema;
