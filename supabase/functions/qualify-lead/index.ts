import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_BASE = "https://api.lovable.dev/v1";

interface BANTAnalysis {
  budget: {
    detected: boolean;
    evidence: string | null;
    estimated_value: string | null;
    confidence: number;
  };
  authority: {
    detected: boolean;
    role: string | null;
    is_decision_maker: boolean;
    confidence: number;
  };
  need: {
    detected: boolean;
    pain_points: string[];
    urgency: 'low' | 'medium' | 'high';
    confidence: number;
  };
  timeline: {
    detected: boolean;
    timeframe: 'immediate' | '1-2_weeks' | '1_month' | 'indefinite';
    confidence: number;
  };
  overall_intent: 'purchase' | 'information' | 'support' | 'other';
  recommended_action: 'qualify' | 'nurture' | 'discard';
  suggested_value: number;
  reasoning: string;
}

interface QualificationCriteria {
  budget_keywords: string[];
  authority_keywords: string[];
  need_keywords: string[];
  timeline_keywords: string[];
  budget_weight: number;
  authority_weight: number;
  need_weight: number;
  timeline_weight: number;
  auto_qualify_threshold: number;
  auto_create_lead_threshold: number;
  auto_create_leads: boolean;
  qualification_enabled: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { conversationId, triggerSource = 'manual' } = await req.json();

    if (!conversationId) {
      return new Response(
        JSON.stringify({ error: 'conversationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[qualify-lead] Starting qualification for conversation: ${conversationId}, trigger: ${triggerSource}`);

    // 1. Buscar conversa com dados do contato e setor
    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select(`
        *,
        contact:whatsapp_contacts(id, name, phone_number, email),
        sector:sectors(id, name, instance_id)
      `)
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      console.error('[qualify-lead] Conversation not found:', convError);
      return new Response(
        JSON.stringify({ error: 'Conversation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Buscar critérios de qualificação do setor
    let criteria: QualificationCriteria;
    const { data: sectorCriteria } = await supabase
      .from('lead_qualification_criteria')
      .select('*')
      .eq('sector_id', conversation.sector_id)
      .single();

    if (sectorCriteria) {
      criteria = sectorCriteria as QualificationCriteria;
    } else {
      // Usar critérios padrão
      criteria = {
        budget_keywords: ['orçamento', 'valor', 'quanto custa', 'preço', 'investimento', 'custo'],
        authority_keywords: ['gerente', 'diretor', 'decisor', 'responsável', 'dono', 'proprietário', 'CEO'],
        need_keywords: ['preciso', 'necessito', 'urgente', 'problema', 'dificuldade', 'quero', 'busco'],
        timeline_keywords: ['agora', 'hoje', 'esta semana', 'urgente', 'prazo', 'imediato', 'rápido'],
        budget_weight: 25,
        authority_weight: 25,
        need_weight: 30,
        timeline_weight: 20,
        auto_qualify_threshold: 70,
        auto_create_lead_threshold: 30,
        auto_create_leads: true,
        qualification_enabled: true,
      };
    }

    if (!criteria.qualification_enabled) {
      console.log('[qualify-lead] Qualification disabled for this sector');
      return new Response(
        JSON.stringify({ message: 'Qualification disabled for this sector' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Buscar mensagens recentes da conversa
    const { data: messages, error: msgError } = await supabase
      .from('whatsapp_messages')
      .select('content, sender_type, created_at')
      .eq('conversation_id', conversationId)
      .eq('is_internal', false)
      .order('created_at', { ascending: true })
      .limit(50);

    if (msgError || !messages || messages.length === 0) {
      console.log('[qualify-lead] No messages found for qualification');
      return new Response(
        JSON.stringify({ message: 'No messages to analyze' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Verificar se já existe lead para esta conversa
    const { data: existingLead } = await supabase
      .from('leads')
      .select('*')
      .eq('conversation_id', conversationId)
      .single();

    // 5. Preparar contexto para análise
    const conversationText = messages
      .map(m => `[${m.sender_type === 'contact' ? 'Cliente' : 'Atendente'}]: ${m.content || ''}`)
      .join('\n');

    const analysisPrompt = `Você é um especialista em qualificação de leads B2B. Analise a conversa abaixo e extraia informações BANT (Budget, Authority, Need, Timeline).

CONVERSA:
${conversationText}

KEYWORDS PARA REFERÊNCIA:
- Budget: ${criteria.budget_keywords.join(', ')}
- Authority: ${criteria.authority_keywords.join(', ')}
- Need: ${criteria.need_keywords.join(', ')}
- Timeline: ${criteria.timeline_keywords.join(', ')}

RETORNE APENAS JSON (sem markdown):
{
  "budget": {
    "detected": true/false,
    "evidence": "frase exata da conversa que indica orçamento" ou null,
    "estimated_value": "R$ X.XXX" ou null,
    "confidence": 0.0-1.0
  },
  "authority": {
    "detected": true/false,
    "role": "cargo identificado" ou null,
    "is_decision_maker": true/false,
    "confidence": 0.0-1.0
  },
  "need": {
    "detected": true/false,
    "pain_points": ["dor 1", "dor 2"],
    "urgency": "low" ou "medium" ou "high",
    "confidence": 0.0-1.0
  },
  "timeline": {
    "detected": true/false,
    "timeframe": "immediate" ou "1-2_weeks" ou "1_month" ou "indefinite",
    "confidence": 0.0-1.0
  },
  "overall_intent": "purchase" ou "information" ou "support" ou "other",
  "recommended_action": "qualify" ou "nurture" ou "discard",
  "suggested_value": número estimado do negócio em reais,
  "reasoning": "explicação breve do porquê desta análise"
}`;

    // 6. Chamar IA via Lovable Gateway
    console.log('[qualify-lead] Calling AI for BANT analysis...');
    
    const aiResponse = await fetch(`${LOVABLE_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'x-supabase-project-ref': supabaseUrl.replace('https://', '').replace('.supabase.co', ''),
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'Você é um especialista em qualificação de leads B2B. Sempre responda apenas com JSON válido, sem markdown.'
          },
          {
            role: 'user',
            content: analysisPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[qualify-lead] AI API error:', errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const aiContent = aiResult.choices?.[0]?.message?.content || '';
    const tokensUsed = aiResult.usage?.total_tokens || 0;

    console.log('[qualify-lead] AI response received, tokens:', tokensUsed);

    // 7. Parsear resposta da IA
    let bantAnalysis: BANTAnalysis;
    try {
      // Limpar possíveis marcadores de código
      const cleanedContent = aiContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      bantAnalysis = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error('[qualify-lead] Failed to parse AI response:', aiContent);
      // Usar análise padrão em caso de erro
      bantAnalysis = {
        budget: { detected: false, evidence: null, estimated_value: null, confidence: 0 },
        authority: { detected: false, role: null, is_decision_maker: false, confidence: 0 },
        need: { detected: false, pain_points: [], urgency: 'low' as const, confidence: 0 },
        timeline: { detected: false, timeframe: 'indefinite' as const, confidence: 0 },
        overall_intent: 'information' as const,
        recommended_action: 'nurture' as const,
        suggested_value: 0,
        reasoning: 'Análise não pôde ser completada',
      };
    }

    // 8. Calcular score baseado nos pesos
    const calculateScore = (analysis: BANTAnalysis, criteria: QualificationCriteria): number => {
      let score = 0;
      
      if (analysis.budget.detected) {
        score += criteria.budget_weight * analysis.budget.confidence;
      }
      if (analysis.authority.detected) {
        const authorityMultiplier = analysis.authority.is_decision_maker ? 1 : 0.6;
        score += criteria.authority_weight * analysis.authority.confidence * authorityMultiplier;
      }
      if (analysis.need.detected) {
        const urgencyMultiplier = analysis.need.urgency === 'high' ? 1 : analysis.need.urgency === 'medium' ? 0.7 : 0.4;
        score += criteria.need_weight * analysis.need.confidence * urgencyMultiplier;
      }
      if (analysis.timeline.detected) {
        const timelineMultiplier = 
          analysis.timeline.timeframe === 'immediate' ? 1 :
          analysis.timeline.timeframe === '1-2_weeks' ? 0.8 :
          analysis.timeline.timeframe === '1_month' ? 0.5 : 0.2;
        score += criteria.timeline_weight * analysis.timeline.confidence * timelineMultiplier;
      }
      
      return Math.round(Math.min(100, Math.max(0, score)));
    };

    const newScore = calculateScore(bantAnalysis, criteria);
    const previousScore = existingLead?.lead_score || 0;

    console.log(`[qualify-lead] Score calculated: ${newScore} (previous: ${previousScore})`);

    // 9. Determinar status baseado no score
    const determineStatus = (score: number, threshold: number): string => {
      if (score >= threshold) return 'qualified';
      if (score >= threshold * 0.7) return 'contacted';
      return 'new';
    };

    let leadId: string;

    if (existingLead) {
      // 10a. Atualizar lead existente
      const updates: any = {
        lead_score: newScore,
        bant_budget: bantAnalysis.budget,
        bant_authority: bantAnalysis.authority,
        bant_need: bantAnalysis.need,
        bant_timeline: bantAnalysis.timeline,
        qualification_data: {
          overall_intent: bantAnalysis.overall_intent,
          recommended_action: bantAnalysis.recommended_action,
          reasoning: bantAnalysis.reasoning,
        },
        last_qualification_at: new Date().toISOString(),
      };

      // Se atingiu threshold de qualificação e ainda não estava qualificado
      if (newScore >= criteria.auto_qualify_threshold && !existingLead.qualified_at) {
        updates.qualified_at = new Date().toISOString();
        updates.qualified_by = 'ai';
        updates.status = 'qualified';
      }

      // Atualizar valor sugerido se maior que atual
      if (bantAnalysis.suggested_value > (existingLead.value || 0)) {
        updates.value = bantAnalysis.suggested_value;
      }

      const { error: updateError } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', existingLead.id);

      if (updateError) {
        console.error('[qualify-lead] Failed to update lead:', updateError);
        throw updateError;
      }

      leadId = existingLead.id;
      console.log(`[qualify-lead] Updated existing lead: ${leadId}`);

    } else if (criteria.auto_create_leads && newScore >= criteria.auto_create_lead_threshold) {
      // 10b. Criar novo lead automaticamente
      const newLead = {
        conversation_id: conversationId,
        contact_id: conversation.contact?.id || null,
        name: conversation.contact?.name || 'Lead sem nome',
        phone: conversation.contact?.phone_number || null,
        email: conversation.contact?.email || null,
        status: determineStatus(newScore, criteria.auto_qualify_threshold),
        source: 'whatsapp' as const,
        value: bantAnalysis.suggested_value || 0,
        probability: Math.min(100, newScore + 10),
        lead_score: newScore,
        sector_id: conversation.sector_id,
        bant_budget: bantAnalysis.budget,
        bant_authority: bantAnalysis.authority,
        bant_need: bantAnalysis.need,
        bant_timeline: bantAnalysis.timeline,
        qualification_data: {
          overall_intent: bantAnalysis.overall_intent,
          recommended_action: bantAnalysis.recommended_action,
          reasoning: bantAnalysis.reasoning,
        },
        last_qualification_at: new Date().toISOString(),
        qualified_at: newScore >= criteria.auto_qualify_threshold ? new Date().toISOString() : null,
        qualified_by: newScore >= criteria.auto_qualify_threshold ? 'ai' : null,
      };

      const { data: createdLead, error: createError } = await supabase
        .from('leads')
        .insert(newLead)
        .select('id')
        .single();

      if (createError) {
        console.error('[qualify-lead] Failed to create lead:', createError);
        throw createError;
      }

      leadId = createdLead.id;
      console.log(`[qualify-lead] Created new lead: ${leadId} with score ${newScore}`);

    } else {
      console.log(`[qualify-lead] Score ${newScore} below threshold ${criteria.auto_create_lead_threshold}, not creating lead`);
      
      // Atualizar conversa mesmo sem criar lead
      await supabase
        .from('whatsapp_conversations')
        .update({
          last_qualification_at: new Date().toISOString(),
          messages_since_qualification: 0,
        })
        .eq('id', conversationId);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Score below threshold, lead not created',
          score: newScore,
          threshold: criteria.auto_create_lead_threshold,
          analysis: bantAnalysis,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 11. Registrar log de qualificação
    const { error: logError } = await supabase
      .from('lead_qualification_logs')
      .insert({
        lead_id: leadId,
        conversation_id: conversationId,
        previous_score: previousScore,
        new_score: newScore,
        bant_analysis: bantAnalysis,
        ai_reasoning: bantAnalysis.reasoning,
        model_used: 'google/gemini-2.5-flash',
        tokens_used: tokensUsed,
        trigger_source: triggerSource,
      });

    if (logError) {
      console.error('[qualify-lead] Failed to create log:', logError);
    }

    // 12. Atualizar ai_agent_session se existir
    const { error: sessionError } = await supabase
      .from('ai_agent_sessions')
      .update({
        lead_score: newScore,
        detected_intent: bantAnalysis.overall_intent,
        updated_at: new Date().toISOString(),
      })
      .eq('conversation_id', conversationId);

    if (sessionError) {
      console.log('[qualify-lead] No AI session to update (expected if no AI agent active)');
    }

    // 13. Atualizar conversa
    await supabase
      .from('whatsapp_conversations')
      .update({
        last_qualification_at: new Date().toISOString(),
        messages_since_qualification: 0,
      })
      .eq('id', conversationId);

    console.log(`[qualify-lead] Qualification complete for lead ${leadId}, score: ${newScore}`);

    return new Response(
      JSON.stringify({
        success: true,
        leadId,
        score: newScore,
        previousScore,
        scoreChange: newScore - previousScore,
        analysis: bantAnalysis,
        action: existingLead ? 'updated' : 'created',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[qualify-lead] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
