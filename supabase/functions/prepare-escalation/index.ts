import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_BASE = 'https://ai.gateway.lovable.dev/v1';

interface EscalationRequest {
  conversationId: string;
  reason: string;
  priority?: number;
  triggeredBy?: 'keyword' | 'sentiment' | 'timeout' | 'limit' | 'complexity' | 'manual' | 'request';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { conversationId, reason, priority = 0, triggeredBy = 'manual' }: EscalationRequest = await req.json();

    if (!conversationId) {
      return new Response(
        JSON.stringify({ error: 'conversationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[prepare-escalation] Processing escalation for conversation ${conversationId}, reason: ${reason}`);

    // 1. Fetch conversation details
    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select(`
        *,
        contact:whatsapp_contacts(*),
        instance:whatsapp_instances(id, name),
        sector:sectors(id, name)
      `)
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      console.error('[prepare-escalation] Conversation not found:', convError);
      return new Response(
        JSON.stringify({ error: 'Conversation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Fetch recent messages for context
    const { data: messages } = await supabase
      .from('whatsapp_messages')
      .select('content, is_from_me, message_type, created_at')
      .eq('conversation_id', conversationId)
      .eq('is_internal', false)
      .order('created_at', { ascending: false })
      .limit(20);

    // 3. Fetch AI session if exists
    const { data: session } = await supabase
      .from('ai_agent_sessions')
      .select('*')
      .eq('conversation_id', conversationId)
      .maybeSingle();

    // 4. Fetch lead data if exists
    const { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('conversation_id', conversationId)
      .maybeSingle();

    // 5. Fetch sentiment analysis
    const { data: sentiment } = await supabase
      .from('whatsapp_sentiment_analysis')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 6. Generate AI summary for handoff
    let aiSummary = '';
    let handoffContext: Record<string, any> = {};

    if (lovableApiKey && messages && messages.length > 0) {
      const conversationText = messages
        .reverse()
        .map(m => `${m.is_from_me ? 'Agente/Bot' : 'Cliente'}: ${m.content || '[mídia]'}`)
        .join('\n');

      const systemPrompt = `Você é um assistente que prepara handoffs para atendentes humanos.
Analise a conversa e gere um resumo conciso para o próximo atendente.

FORMATO:
- **Situação**: (1-2 frases sobre o que o cliente precisa)
- **Contexto**: (informações relevantes já coletadas)
- **Tentativas anteriores**: (o que foi oferecido/respondido)
- **Motivo da Escalação**: ${reason}
- **Sugestão**: (próximo passo recomendado)

Máximo 150 palavras. Seja direto e objetivo.`;

      try {
        const aiResponse = await fetch(`${LOVABLE_API_BASE}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Conversa:\n${conversationText}\n\nCliente: ${conversation.contact?.name || 'Desconhecido'}\nMotivo da escalação: ${reason}` }
            ],
            max_tokens: 500,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          aiSummary = aiData.choices?.[0]?.message?.content || '';
          console.log('[prepare-escalation] AI summary generated successfully');
        } else {
          console.error('[prepare-escalation] AI summary generation failed:', await aiResponse.text());
        }
      } catch (aiError) {
        console.error('[prepare-escalation] Error generating AI summary:', aiError);
      }
    }

    // Build handoff context
    handoffContext = {
      contact: {
        name: conversation.contact?.name,
        phone: conversation.contact?.phone_number,
        email: conversation.contact?.email,
      },
      lead: lead ? {
        id: lead.id,
        status: lead.status,
        score: lead.lead_score,
        bant: {
          budget: lead.bant_budget,
          authority: lead.bant_authority,
          need: lead.bant_need,
          timeline: lead.bant_timeline,
        },
      } : null,
      sentiment: sentiment ? {
        overall: sentiment.overall_sentiment,
        score: sentiment.sentiment_score,
      } : null,
      session: session ? {
        autoReplyCount: session.auto_reply_count,
        detectedIntent: session.detected_intent,
      } : null,
      escalation: {
        reason,
        triggeredBy,
        timestamp: new Date().toISOString(),
      },
    };

    // 7. Calculate priority based on various factors
    let calculatedPriority = priority;
    
    // Boost priority for negative sentiment
    if (sentiment?.overall_sentiment === 'negative' || (sentiment?.sentiment_score && sentiment.sentiment_score < -0.3)) {
      calculatedPriority = Math.min(calculatedPriority + 1, 3);
    }
    
    // Boost for high-value leads
    if (lead?.lead_score && lead.lead_score >= 80) {
      calculatedPriority = Math.min(calculatedPriority + 1, 3);
    }
    
    // Boost for explicit human request
    if (triggeredBy === 'request') {
      calculatedPriority = Math.min(calculatedPriority + 1, 3);
    }

    // 8. Update AI agent session
    if (session) {
      await supabase
        .from('ai_agent_sessions')
        .update({
          handoff_summary: aiSummary,
          handoff_context: handoffContext,
          handoff_requested_at: new Date().toISOString(),
          escalation_priority: calculatedPriority,
          escalated_at: new Date().toISOString(),
          escalation_reason: reason,
        })
        .eq('id', session.id);
    }

    // 9. Create escalation queue entry
    const { data: escalation, error: escalationError } = await supabase
      .from('escalation_queue')
      .insert({
        conversation_id: conversationId,
        sector_id: conversation.sector_id,
        instance_id: conversation.instance_id,
        ai_summary: aiSummary,
        escalation_reason: reason,
        detected_intent: session?.detected_intent,
        lead_score: lead?.lead_score,
        customer_sentiment: sentiment?.overall_sentiment,
        priority: calculatedPriority,
        status: 'pending',
      })
      .select()
      .single();

    if (escalationError) {
      // If unique constraint violated, escalation already exists
      if (escalationError.code === '23505') {
        console.log('[prepare-escalation] Escalation already exists for this conversation');
        return new Response(
          JSON.stringify({ message: 'Escalation already pending', existing: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw escalationError;
    }

    // 10. Update conversation mode to human
    await supabase
      .from('whatsapp_conversations')
      .update({ conversation_mode: 'human' })
      .eq('id', conversationId);

    // 11. Notify eligible agents in the sector
    const { data: eligibleAgents } = await supabase
      .from('user_sectors')
      .select('user_id')
      .eq('sector_id', conversation.sector_id);

    if (eligibleAgents && eligibleAgents.length > 0) {
      const notifications = eligibleAgents.map(agent => ({
        escalation_id: escalation.id,
        user_id: agent.user_id,
        notification_type: 'new_escalation',
      }));

      await supabase
        .from('escalation_notifications')
        .insert(notifications);

      console.log(`[prepare-escalation] Notified ${eligibleAgents.length} agents`);
    }

    // 12. Log the escalation action
    await supabase
      .from('ai_agent_logs')
      .insert({
        conversation_id: conversationId,
        session_id: session?.id,
        action_type: 'escalation_prepared',
        action_details: {
          escalation_id: escalation.id,
          reason,
          triggeredBy,
          priority: calculatedPriority,
          hasAiSummary: !!aiSummary,
          agentsNotified: eligibleAgents?.length || 0,
        },
      });

    console.log(`[prepare-escalation] Escalation created successfully: ${escalation.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        escalationId: escalation.id,
        priority: calculatedPriority,
        aiSummary: aiSummary ? true : false,
        agentsNotified: eligibleAgents?.length || 0,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[prepare-escalation] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
