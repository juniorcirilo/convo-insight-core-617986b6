import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { projectConfig } from '../db/schema/config.js';

export const configService = {
  async setConfig(key: string, value: string) {
    const [config] = await db
      .insert(projectConfig)
      .values({ key, value })
      .onConflictDoUpdate({
        target: projectConfig.key,
        set: { value, updated_at: new Date() },
      })
      .returning();

    return config;
  },

  async getConfig(key: string) {
    const [config] = await db
      .select()
      .from(projectConfig)
      .where(eq(projectConfig.key, key))
      .limit(1);

    return config;
  },

  async getAllConfig() {
    const configs = await db.select().from(projectConfig);
    return configs;
  },

  async deleteConfig(key: string) {
    const [deleted] = await db
      .delete(projectConfig)
      .where(eq(projectConfig.key, key))
      .returning();

    return deleted;
  },

  async setupProject(data: { projectUrl?: string; anonKey?: string }) {
    const configs = [];

    if (data.projectUrl) {
      const projectUrl = await this.setConfig('project_url', data.projectUrl);
      configs.push(projectUrl);
    }

    if (data.anonKey) {
      const anonKey = await this.setConfig('anon_key', data.anonKey);
      configs.push(anonKey);
    }

    return configs;
  },
};
