import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[Optimize Knowledge] Starting optimization run...');

    // 1. Find and deactivate obsolete knowledge (not used in 60+ days)
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const { data: obsoleteItems, error: obsoleteError } = await supabase
      .from('business_knowledge_base')
      .select('id, title, last_used_at')
      .eq('is_active', true)
      .or(`last_used_at.lt.${sixtyDaysAgo.toISOString()},last_used_at.is.null`)
      .eq('usage_count', 0);

    if (!obsoleteError && obsoleteItems && obsoleteItems.length > 0) {
      console.log(`[Optimize Knowledge] Found ${obsoleteItems.length} obsolete items`);
      
      // Don't deactivate, just reduce confidence score
      for (const item of obsoleteItems) {
        await supabase
          .from('business_knowledge_base')
          .update({ confidence_score: 0.5 })
          .eq('id', item.id);
      }
    }

    // 2. Update success rates for templates based on feedback
    const { data: templates } = await supabase
      .from('response_templates')
      .select('id, usage_count')
      .eq('is_active', true)
      .gt('usage_count', 0);

    if (templates) {
      for (const template of templates) {
        // Get feedback for messages that used this template
        const { data: feedback } = await supabase
          .from('ai_response_feedback')
          .select('rating')
          .gte('created_at', sixtyDaysAgo.toISOString());

        if (feedback && feedback.length > 0) {
          const avgRating = feedback.reduce((sum: number, f: any) => sum + f.rating, 0) / feedback.length;
          const successRate = avgRating / 5; // Normalize to 0-1

          await supabase
            .from('response_templates')
            .update({ success_rate: successRate })
            .eq('id', template.id);
        }
      }
    }

    // 3. Identify knowledge gaps (common questions without good answers)
    const { data: recentLogs } = await supabase
      .from('ai_agent_logs')
      .select('input_message, ai_response, metadata')
      .eq('action', 'response_sent')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(100);

    const gaps: string[] = [];
    if (recentLogs) {
      // Find questions that resulted in "I don't know" type responses
      recentLogs.forEach((log: any) => {
        if (log.ai_response && (
          log.ai_response.includes('não sei') ||
          log.ai_response.includes('não tenho essa informação') ||
          log.ai_response.includes('[ESCALAR]')
        )) {
          gaps.push(log.input_message);
        }
      });
    }

    // 4. Update confidence scores based on usage
    const { data: highUsageItems } = await supabase
      .from('business_knowledge_base')
      .select('id, usage_count, confidence_score')
      .eq('is_active', true)
      .gt('usage_count', 10);

    if (highUsageItems) {
      for (const item of highUsageItems) {
        const newConfidence = Math.min(1, (item.confidence_score || 0.5) + 0.1);
        await supabase
          .from('business_knowledge_base')
          .update({ confidence_score: newConfidence })
          .eq('id', item.id);
      }
    }

    // 5. Clean up old learning examples with low quality
    const { error: cleanupError } = await supabase
      .from('learning_examples')
      .update({ is_active: false })
      .eq('is_active', true)
      .lt('quality_score', 0.3)
      .lt('created_at', sixtyDaysAgo.toISOString());

    if (cleanupError) {
      console.error('[Optimize Knowledge] Error cleaning up examples:', cleanupError);
    }

    const result = {
      obsoleteItemsFound: obsoleteItems?.length || 0,
      templatesUpdated: templates?.length || 0,
      gapsIdentified: gaps.length,
      highUsageItemsBosted: highUsageItems?.length || 0,
      timestamp: new Date().toISOString(),
    };

    console.log('[Optimize Knowledge] Optimization complete:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[Optimize Knowledge] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
