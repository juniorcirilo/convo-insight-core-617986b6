import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { project_config } from '../db/schema/config.js';

export const configService = {
  async setConfig(key: string, value: string) {
    const [config] = await db
      .insert(project_config)
      .values({ key, value })
      .onConflictDoUpdate({
        target: project_config.key,
        set: { value, updated_at: new Date() },
      })
      .returning();

    return config;
  },

  async getConfig(key: string) {
    const [config] = await db
      .select()
      .from(project_config)
      .where(eq(project_config.key, key))
      .limit(1);

    return config;
  },

  async getAllConfig() {
    const configs = await db.select().from(project_config);
    return configs;
  },

  async deleteConfig(key: string) {
    const [deleted] = await db
      .delete(project_config)
      .where(eq(project_config.key, key))
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
