#!/usr/bin/env node

/**
 * Supabase to PostgreSQL Data Migration Script
 * 
 * This script migrates all data from Supabase to the new PostgreSQL database
 * using Drizzle ORM.
 * 
 * Usage:
 *   1. Set environment variables for old Supabase instance
 *   2. Ensure new database is running and migrations are applied
 *   3. Run: node scripts/migrate-data.js
 */

import { createClient } from '@supabase/supabase-js';
import { db } from '../backend/src/config/database.js';
import * as schema from '../backend/src/db/schema/index.js';

// Configuration
const OLD_SUPABASE_URL = process.env.OLD_SUPABASE_URL;
const OLD_SUPABASE_KEY = process.env.OLD_SUPABASE_SERVICE_KEY;

if (!OLD_SUPABASE_URL || !OLD_SUPABASE_KEY) {
  console.error('Error: OLD_SUPABASE_URL and OLD_SUPABASE_SERVICE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(OLD_SUPABASE_URL, OLD_SUPABASE_KEY);

// Tables to migrate in order (respecting foreign key constraints)
const MIGRATION_ORDER = [
  // Auth tables (no foreign keys)
  { name: 'sectors', schema: schema.sectors },
  { name: 'profiles', schema: schema.profiles },
  { name: 'user_roles', schema: schema.user_roles },
  { name: 'user_sectors', schema: schema.user_sectors },
  
  // WhatsApp tables
  { name: 'whatsapp_instances', schema: schema.whatsapp_instances },
  { name: 'whatsapp_contacts', schema: schema.whatsapp_contacts },
  { name: 'whatsapp_conversations', schema: schema.whatsapp_conversations },
  { name: 'whatsapp_messages', schema: schema.whatsapp_messages },
  { name: 'whatsapp_message_reactions', schema: schema.whatsapp_message_reactions },
  { name: 'whatsapp_tags', schema: schema.whatsapp_tags },
  { name: 'whatsapp_conversation_tags', schema: schema.whatsapp_conversation_tags },
  { name: 'conversation_notes', schema: schema.conversation_notes },
  { name: 'conversation_participants', schema: schema.conversation_participants },
  { name: 'contact_custom_fields', schema: schema.contact_custom_fields },
  { name: 'contact_groups', schema: schema.contact_groups },
  { name: 'contact_group_members', schema: schema.contact_group_members },
  
  // Tickets
  { name: 'ticket_feedback', schema: schema.ticket_feedback },
  { name: 'tickets', schema: schema.tickets },
  { name: 'kanban_config', schema: schema.kanban_config },
  
  // Leads
  { name: 'leads', schema: schema.leads },
  { name: 'lead_activities', schema: schema.lead_activities },
  { name: 'lead_custom_fields', schema: schema.lead_custom_fields },
  { name: 'lead_qualifications', schema: schema.lead_qualifications },
  { name: 'lead_qualification_criteria', schema: schema.lead_qualification_criteria },
  { name: 'lead_qualification_logs', schema: schema.lead_qualification_logs },
  
  // Campaigns
  { name: 'campaigns', schema: schema.campaigns },
  { name: 'campaign_logs', schema: schema.campaign_logs },
  
  // AI
  { name: 'ai_agent_configs', schema: schema.ai_agent_configs },
  { name: 'ai_agent_logs', schema: schema.ai_agent_logs },
  { name: 'ai_escalations', schema: schema.ai_escalations },
  { name: 'business_knowledge_base', schema: schema.business_knowledge_base },
  { name: 'learning_examples', schema: schema.learning_examples },
  { name: 'response_templates', schema: schema.response_templates },
  { name: 'smart_replies', schema: schema.smart_replies },
  { name: 'conversation_categories', schema: schema.conversation_categories },
  { name: 'ai_agent_performance', schema: schema.ai_agent_performance },
  { name: 'knowledge_optimization_logs', schema: schema.knowledge_optimization_logs },
  
  // SLA
  { name: 'sla_config', schema: schema.sla_config },
  { name: 'sla_violations', schema: schema.sla_violations },
  
  // Webhooks
  { name: 'webhooks', schema: schema.webhooks },
  { name: 'webhook_logs', schema: schema.webhook_logs },
  
  // Config
  { name: 'project_config', schema: schema.project_config },
  
  // Products
  { name: 'products', schema: schema.products },
  { name: 'product_variants', schema: schema.product_variants },
  
  // Sales
  { name: 'quotes', schema: schema.quotes },
  { name: 'orders', schema: schema.orders },
  { name: 'payments', schema: schema.payments },
  { name: 'price_negotiations', schema: schema.price_negotiations },
  
  // Scheduling
  { name: 'meetings', schema: schema.meetings },
  { name: 'meeting_availability', schema: schema.meeting_availability },
  { name: 'meeting_reminders', schema: schema.meeting_reminders },
  { name: 'meeting_participants', schema: schema.meeting_participants },
  
  // API
  { name: 'api_tokens', schema: schema.api_tokens },
  { name: 'api_usage_logs', schema: schema.api_usage_logs },
  
  // Widget
  { name: 'widget_config', schema: schema.widget_config },
  { name: 'widget_conversations', schema: schema.widget_conversations },
  { name: 'widget_messages', schema: schema.widget_messages },
];

async function migrateTable(tableName, tableSchema) {
  console.log(`\n📦 Migrating ${tableName}...`);
  
  try {
    let totalMigrated = 0;
    let page = 0;
    const pageSize = 1000;
    
    while (true) {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .range(page * pageSize, (page + 1) * pageSize - 1);
      
      if (error) {
        console.error(`   ❌ Error fetching from ${tableName}:`, error.message);
        throw error;
      }
      
      if (!data || data.length === 0) {
        break;
      }
      
      try {
        await db.insert(tableSchema).values(data);
        totalMigrated += data.length;
        console.log(`   ✓ Migrated ${data.length} rows (total: ${totalMigrated})`);
      } catch (insertError) {
        console.error(`   ❌ Error inserting into ${tableName}:`, insertError.message);
        // Continue with next batch
      }
      
      page++;
    }
    
    console.log(`✅ ${tableName}: ${totalMigrated} rows migrated`);
    return { table: tableName, count: totalMigrated, success: true };
  } catch (error) {
    console.error(`❌ ${tableName}: Migration failed -`, error.message);
    return { table: tableName, count: 0, success: false, error: error.message };
  }
}

async function migrate() {
  console.log('🚀 Starting Supabase to PostgreSQL migration...\n');
  console.log(`Source: ${OLD_SUPABASE_URL}`);
  console.log(`Target: PostgreSQL via Drizzle ORM\n`);
  
  const startTime = Date.now();
  const results = [];
  
  for (const table of MIGRATION_ORDER) {
    const result = await migrateTable(table.name, table.schema);
    results.push(result);
  }
  
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Migration Summary');
  console.log('='.repeat(60));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const totalRows = successful.reduce((sum, r) => sum + r.count, 0);
  
  console.log(`\n✅ Successful: ${successful.length}/${results.length} tables`);
  console.log(`❌ Failed: ${failed.length}/${results.length} tables`);
  console.log(`📝 Total rows migrated: ${totalRows}`);
  console.log(`⏱️  Duration: ${duration}s`);
  
  if (failed.length > 0) {
    console.log('\n❌ Failed tables:');
    failed.forEach(f => {
      console.log(`   - ${f.table}: ${f.error}`);
    });
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n✨ Migration complete!\n');
}

// Run migration
migrate().catch(error => {
  console.error('\n❌ Migration failed:', error);
  process.exit(1);
});
