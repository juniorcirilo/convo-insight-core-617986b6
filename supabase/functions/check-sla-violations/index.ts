import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.85.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SlaConfig {
  id: string;
  prioridade: 'alta' | 'media' | 'baixa';
  tempo_primeira_resposta_minutos: number;
  tempo_resolucao_minutos: number;
}

interface Ticket {
  id: string;
  conversation_id: string;
  prioridade: 'alta' | 'media' | 'baixa';
  created_at: string;
  first_response_at: string | null;
  status: 'aberto' | 'em_atendimento' | 'finalizado';
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log('[check-sla-violations] Starting SLA check...');

    // 1. Fetch all SLA configurations
    const { data: slaConfigs, error: slaError } = await supabase
      .from('sla_config')
      .select('*');

    if (slaError) {
      console.error('[check-sla-violations] Error fetching SLA configs:', slaError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch SLA configs' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!slaConfigs || slaConfigs.length === 0) {
      console.log('[check-sla-violations] No SLA configs found');
      return new Response(
        JSON.stringify({ success: true, message: 'No SLA configs to check' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create a map of priority -> SLA config for quick lookup
    const slaMap = new Map<string, SlaConfig>();
    for (const config of slaConfigs) {
      slaMap.set(config.prioridade, config as SlaConfig);
    }

    // 2. Fetch all open tickets that haven't been marked as violated yet
    const { data: tickets, error: ticketsError } = await supabase
      .from('tickets')
      .select('id, conversation_id, prioridade, created_at, first_response_at, status')
      .in('status', ['aberto', 'em_atendimento'])
      .is('sla_violated_at', null);

    if (ticketsError) {
      console.error('[check-sla-violations] Error fetching tickets:', ticketsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch tickets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[check-sla-violations] Found ${tickets?.length || 0} open tickets to check`);

    if (!tickets || tickets.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No tickets to check' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date();
    const violations: { ticketId: string; violationType: string; expectedAt: Date }[] = [];

    for (const ticket of tickets as Ticket[]) {
      const slaConfig = slaMap.get(ticket.prioridade);
      if (!slaConfig) {
        console.log(`[check-sla-violations] No SLA config for priority: ${ticket.prioridade}`);
        continue;
      }

      const ticketCreatedAt = new Date(ticket.created_at);

      // Check first response SLA (only if not yet responded)
      if (!ticket.first_response_at && ticket.status === 'aberto') {
        const expectedFirstResponseAt = new Date(
          ticketCreatedAt.getTime() + slaConfig.tempo_primeira_resposta_minutos * 60 * 1000
        );

        if (now > expectedFirstResponseAt) {
          violations.push({
            ticketId: ticket.id,
            violationType: 'first_response',
            expectedAt: expectedFirstResponseAt,
          });
          console.log(`[check-sla-violations] First response SLA violated for ticket: ${ticket.id}`);
        }
      }

      // Check resolution SLA
      const expectedResolutionAt = new Date(
        ticketCreatedAt.getTime() + slaConfig.tempo_resolucao_minutos * 60 * 1000
      );

      if (now > expectedResolutionAt) {
        violations.push({
          ticketId: ticket.id,
          violationType: 'resolution',
          expectedAt: expectedResolutionAt,
        });
        console.log(`[check-sla-violations] Resolution SLA violated for ticket: ${ticket.id}`);
      }
    }

    console.log(`[check-sla-violations] Found ${violations.length} violations`);

    // 3. Record violations and update tickets
    for (const violation of violations) {
      // Insert violation record
      const { error: insertError } = await supabase
        .from('sla_violations')
        .insert({
          ticket_id: violation.ticketId,
          violation_type: violation.violationType,
          expected_at: violation.expectedAt.toISOString(),
          violated_at: now.toISOString(),
        });

      if (insertError) {
        console.error(`[check-sla-violations] Error inserting violation:`, insertError);
        continue;
      }

      // Update ticket with violation timestamp
      const { error: updateError } = await supabase
        .from('tickets')
        .update({ sla_violated_at: now.toISOString() })
        .eq('id', violation.ticketId);

      if (updateError) {
        console.error(`[check-sla-violations] Error updating ticket:`, updateError);
      }
    }

    console.log('[check-sla-violations] SLA check completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        ticketsChecked: tickets.length,
        violationsFound: violations.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[check-sla-violations] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
