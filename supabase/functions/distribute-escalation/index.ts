import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DistributionRequest {
  escalationId?: string;
  sectorId?: string;
  processAll?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { escalationId, sectorId, processAll = false }: DistributionRequest = await req.json();

    console.log('[distribute-escalation] Starting distribution', { escalationId, sectorId, processAll });

    // Get escalations to process
    let escalationsQuery = supabase
      .from('escalation_queue')
      .select(`
        *,
        sector:sectors(id, name, instance_id)
      `)
      .eq('status', 'pending');

    if (escalationId) {
      escalationsQuery = escalationsQuery.eq('id', escalationId);
    } else if (sectorId) {
      escalationsQuery = escalationsQuery.eq('sector_id', sectorId);
    }

    escalationsQuery = escalationsQuery.order('priority', { ascending: false })
      .order('created_at', { ascending: true });

    if (!processAll) {
      escalationsQuery = escalationsQuery.limit(10);
    }

    const { data: escalations, error: escError } = await escalationsQuery;

    if (escError) {
      throw escError;
    }

    if (!escalations || escalations.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No pending escalations to distribute', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[distribute-escalation] Found ${escalations.length} pending escalations`);

    const results: Array<{ escalationId: string; assignedTo: string | null; method: string }> = [];

    for (const escalation of escalations) {
      // Get distribution config for sector
      const { data: config } = await supabase
        .from('escalation_distribution_config')
        .select('*')
        .eq('sector_id', escalation.sector_id)
        .maybeSingle();

      // Skip if auto-assign is disabled
      if (!config?.auto_assign_enabled) {
        console.log(`[distribute-escalation] Auto-assign disabled for sector ${escalation.sector_id}`);
        results.push({ escalationId: escalation.id, assignedTo: null, method: 'skipped_disabled' });
        continue;
      }

      // Get eligible agents
      const { data: sectorAgents } = await supabase
        .from('user_sectors')
        .select(`
          user_id,
          profile:profiles!inner(id, full_name, status)
        `)
        .eq('sector_id', escalation.sector_id);

      if (!sectorAgents || sectorAgents.length === 0) {
        console.log(`[distribute-escalation] No agents in sector ${escalation.sector_id}`);
        results.push({ escalationId: escalation.id, assignedTo: null, method: 'no_agents' });
        continue;
      }

      // Filter to online/away agents
      const availableAgents = sectorAgents.filter(
        a => a.profile && ['online', 'away'].includes((a.profile as any).status || 'offline')
      );

      if (availableAgents.length === 0) {
        console.log(`[distribute-escalation] No available agents in sector ${escalation.sector_id}`);
        results.push({ escalationId: escalation.id, assignedTo: null, method: 'no_available_agents' });
        continue;
      }

      // Get current escalation counts per agent
      const { data: agentLoads } = await supabase
        .from('escalation_queue')
        .select('assigned_to')
        .eq('status', 'assigned')
        .in('assigned_to', availableAgents.map(a => a.user_id));

      const loadMap = new Map<string, number>();
      agentLoads?.forEach(e => {
        const count = loadMap.get(e.assigned_to) || 0;
        loadMap.set(e.assigned_to, count + 1);
      });

      // Filter agents under max concurrent limit
      const maxConcurrent = config.max_concurrent_escalations_per_agent || 5;
      const eligibleAgents = availableAgents.filter(
        a => (loadMap.get(a.user_id) || 0) < maxConcurrent
      );

      if (eligibleAgents.length === 0) {
        console.log(`[distribute-escalation] All agents at capacity in sector ${escalation.sector_id}`);
        results.push({ escalationId: escalation.id, assignedTo: null, method: 'agents_at_capacity' });
        continue;
      }

      let selectedAgent: string | null = null;
      const distributionMethod = config.distribution_method || 'round_robin';

      switch (distributionMethod) {
        case 'least_load': {
          // Find agent with least current load
          let minLoad = Infinity;
          for (const agent of eligibleAgents) {
            const load = loadMap.get(agent.user_id) || 0;
            if (load < minLoad) {
              minLoad = load;
              selectedAgent = agent.user_id;
            }
          }
          break;
        }

        case 'round_robin':
        default: {
          // Get last assigned agent for this sector
          const { data: lastAssignment } = await supabase
            .from('escalation_queue')
            .select('assigned_to')
            .eq('sector_id', escalation.sector_id)
            .not('assigned_to', 'is', null)
            .order('assigned_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const lastAgentId = lastAssignment?.assigned_to;
          const agentIds = eligibleAgents.map(a => a.user_id);

          if (!lastAgentId || !agentIds.includes(lastAgentId)) {
            selectedAgent = agentIds[0];
          } else {
            const lastIndex = agentIds.indexOf(lastAgentId);
            selectedAgent = agentIds[(lastIndex + 1) % agentIds.length];
          }
          break;
        }
      }

      if (selectedAgent) {
        // Assign the escalation
        const { error: updateError } = await supabase
          .from('escalation_queue')
          .update({
            assigned_to: selectedAgent,
            assigned_at: new Date().toISOString(),
            status: 'assigned',
          })
          .eq('id', escalation.id);

        if (updateError) {
          console.error(`[distribute-escalation] Failed to assign ${escalation.id}:`, updateError);
          results.push({ escalationId: escalation.id, assignedTo: null, method: 'assignment_error' });
        } else {
          console.log(`[distribute-escalation] Assigned ${escalation.id} to ${selectedAgent}`);
          results.push({ escalationId: escalation.id, assignedTo: selectedAgent, method: distributionMethod });

          // Update conversation assignment
          await supabase
            .from('whatsapp_conversations')
            .update({ assigned_to: selectedAgent })
            .eq('id', escalation.conversation_id);

          // Create reassignment notification
          await supabase
            .from('escalation_notifications')
            .upsert({
              escalation_id: escalation.id,
              user_id: selectedAgent,
              notification_type: 'reassignment',
            });
        }
      }
    }

    const assigned = results.filter(r => r.assignedTo).length;
    console.log(`[distribute-escalation] Distribution complete: ${assigned}/${results.length} assigned`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        assigned,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[distribute-escalation] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
