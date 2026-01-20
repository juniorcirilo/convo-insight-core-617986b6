import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AIAgentConfig {
  id: string;
  sector_id: string;
  agent_name: string;
  persona_description: string | null;
  welcome_message: string | null;
  tone_of_voice: string;
  is_enabled: boolean;
  auto_reply_enabled: boolean;
  max_auto_replies: number;
  response_delay_seconds: number;
  escalation_keywords: string[];
  escalation_after_minutes: number;
  escalation_on_negative_sentiment: boolean;
  working_hours_start: string;
  working_hours_end: string;
  working_timezone: string;
  working_days: number[];
  out_of_hours_message: string | null;
  business_context: string | null;
  faq_context: string | null;
  product_catalog: string | null;
}

interface AIAgentSession {
  id: string;
  conversation_id: string;
  mode: string;
  auto_reply_count: number;
  last_ai_response_at: string | null;
  conversation_summary: string | null;
  detected_intent: string | null;
  lead_score: number | null;
  escalated_at: string | null;
  escalation_reason: string | null;
  escalated_to: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');

    if (!GROQ_API_KEY) {
      console.error('[AI Agent] GROQ_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'AI not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { conversationId, messageId } = await req.json();

    console.log(`[AI Agent] Processing conversation: ${conversationId}, message: ${messageId}`);

    // 1. Buscar conversa com setor
    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select(`
        *,
        contact:whatsapp_contacts(*),
        sector:sectors(*)
      `)
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      console.error('[AI Agent] Conversation not found:', convError);
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Verificar se o modo é humano (não responde)
    if (conversation.conversation_mode === 'human') {
      console.log('[AI Agent] Conversation in human mode, skipping');
      return new Response(JSON.stringify({ skipped: true, reason: 'human_mode' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Buscar configuração do AI Agent para o setor
    const { data: config, error: configError } = await supabase
      .from('ai_agent_configs')
      .select('*')
      .eq('sector_id', conversation.sector_id)
      .eq('is_enabled', true)
      .single();

    if (configError || !config) {
      console.log('[AI Agent] No AI config for sector or not enabled');
      return new Response(JSON.stringify({ skipped: true, reason: 'no_config' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const agentConfig = config as AIAgentConfig;

    // 4. Verificar horário de funcionamento
    const isWithinWorkingHours = checkWorkingHours(agentConfig);
    if (!isWithinWorkingHours) {
      console.log('[AI Agent] Outside working hours');
      if (agentConfig.out_of_hours_message) {
        await sendMessage(supabase, conversation, agentConfig.out_of_hours_message, agentConfig.agent_name);
        await logAction(supabase, conversationId, null, 'out_of_hours', null, agentConfig.out_of_hours_message, 0, Date.now() - startTime);
      }
      return new Response(JSON.stringify({ skipped: true, reason: 'outside_hours' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Buscar ou criar sessão
    let session = await getOrCreateSession(supabase, conversationId);

    // 6. Verificar limite de respostas automáticas
    if (session.auto_reply_count >= agentConfig.max_auto_replies) {
      console.log('[AI Agent] Max auto replies reached, escalating');
      await escalateConversation(supabase, conversationId, session.id, 'max_replies_reached');
      return new Response(JSON.stringify({ escalated: true, reason: 'max_replies' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 7. Buscar última mensagem do cliente
    const { data: lastMessage } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (!lastMessage || lastMessage.is_from_me) {
      console.log('[AI Agent] No message or message is from us');
      return new Response(JSON.stringify({ skipped: true, reason: 'no_client_message' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const clientMessage = lastMessage.content || '';

    // 8. Verificar keywords de escalação
    const shouldEscalate = checkEscalationKeywords(clientMessage, agentConfig.escalation_keywords);
    if (shouldEscalate) {
      console.log('[AI Agent] Escalation keyword detected');
      await escalateConversation(supabase, conversationId, session.id, 'keyword_detected');
      await sendMessage(supabase, conversation, 'Entendi! Vou transferir você para um de nossos atendentes humanos. Aguarde um momento.', agentConfig.agent_name);
      return new Response(JSON.stringify({ escalated: true, reason: 'keyword' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 9. Buscar histórico de mensagens para contexto
    const { data: messageHistory } = await supabase
      .from('whatsapp_messages')
      .select('content, is_from_me, message_type, created_at')
      .eq('conversation_id', conversationId)
      .eq('is_internal', false)
      .order('created_at', { ascending: false })
      .limit(20);

    const reversedHistory = (messageHistory || []).reverse();

    // 9.1 Buscar conhecimento relevante da base de conhecimento
    const relevantKnowledge = await searchRelevantKnowledge(supabase, conversation.sector_id, clientMessage);
    console.log(`[AI Agent] Found ${relevantKnowledge.length} relevant knowledge items`);

    // 9.2 Buscar templates de resposta relevantes
    const relevantTemplates = await searchRelevantTemplates(supabase, conversation.sector_id, clientMessage);
    console.log(`[AI Agent] Found ${relevantTemplates.length} relevant templates`);

    // 10. Montar prompt do sistema com conhecimento integrado
    const systemPrompt = buildSystemPrompt(agentConfig, conversation.contact, relevantKnowledge, relevantTemplates);

    // 11. Montar mensagens para a API
    const aiMessages = [
      { role: 'system', content: systemPrompt },
      ...reversedHistory.map(msg => ({
        role: msg.is_from_me ? 'assistant' : 'user',
        content: msg.content || '[mídia]'
      }))
    ];

    // 12. Delay para parecer natural
    if (agentConfig.response_delay_seconds > 0) {
      await new Promise(resolve => setTimeout(resolve, agentConfig.response_delay_seconds * 1000));
    }

    // 13. Call GROQ completions endpoint
    console.log('[AI Agent] Calling GROQ for response...');
    const prompt = [
      `SYSTEM: ${systemPrompt}`,
      ...reversedHistory.map(m => `${m.is_from_me ? 'ASSISTANT' : 'USER'}: ${m.content || '[mídia]'}`)
    ].join('\n');

    let aiContent = '';
    let tokensUsed = 0;

    try {
      // Use GROQ Responses API as requested (example): model openai/gpt-oss-120b and `input`
      const model = 'openai/gpt-oss-120b';
      const inputText = [systemPrompt, ...reversedHistory.map(m => `${m.is_from_me ? 'ASSISTANT' : 'USER'}: ${m.content || '[mídia]'}`)].join('\n');

      const groqResp = await fetch('https://api.groq.com/openai/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, input: inputText }),
      });

      if (!groqResp.ok) {
        const errText = await groqResp.text();
        console.error('[AI Agent] GROQ responses error:', groqResp.status, errText);
        if (groqResp.status === 429) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ error: 'GROQ Responses API error', status: groqResp.status, details: errText }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const parsed = await groqResp.json().catch(async () => {
        const txt = await groqResp.text();
        try { return JSON.parse(txt); } catch { return { text: txt }; }
      });

      // Parse common response fields: output_text, output[0].content[0].text, or fallback to choices
      aiContent = parsed?.output_text || parsed?.output?.[0]?.content?.find((c: any) => c.type === 'output_text')?.text || parsed?.output?.[0]?.content?.map((c: any) => c.text || c.value || '').join('\n') || parsed?.choices?.[0]?.message?.content || parsed?.choices?.[0]?.text || parsed?.text || '';

    } catch (e) {
      console.error('[AI Agent] Error calling GROQ Responses API:', e);
      throw e;
    }

    console.log('[AI Agent] AI Response:', aiContent.substring(0, 100) + '...');

    // 14. Verificar se IA sugere escalação
    if (aiContent.includes('[ESCALAR]') || aiContent.includes('[ESCALATE]')) {
      console.log('[AI Agent] AI suggested escalation');
      await escalateConversation(supabase, conversationId, session.id, 'ai_suggested');
      const cleanMessage = aiContent.replace(/\[ESCALAR\]|\[ESCALATE\]/g, '').trim();
      if (cleanMessage) {
        await sendMessage(supabase, conversation, cleanMessage, agentConfig.agent_name);
      }
      await sendMessage(supabase, conversation, 'Vou transferir você para um atendente humano. Aguarde um momento.', agentConfig.agent_name);
      return new Response(JSON.stringify({ escalated: true, reason: 'ai_suggested' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 15. Enviar resposta via Evolution API
    await sendMessage(supabase, conversation, aiContent, agentConfig.agent_name);

    // 16. Atualizar sessão
    await supabase
      .from('ai_agent_sessions')
      .update({
        auto_reply_count: session.auto_reply_count + 1,
        last_ai_response_at: new Date().toISOString(),
      })
      .eq('id', session.id);

    // 17. Log da ação
    await logAction(
      supabase,
      conversationId,
      session.id,
      'response_sent',
      clientMessage,
      aiContent,
      tokensUsed,
      Date.now() - startTime,
      model
    );

    console.log(`[AI Agent] Response sent successfully in ${Date.now() - startTime}ms`);

    return new Response(JSON.stringify({ 
      success: true, 
      response: aiContent.substring(0, 100),
      tokens: tokensUsed,
      responseTime: Date.now() - startTime
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[AI Agent] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper Functions

function checkWorkingHours(config: AIAgentConfig): boolean {
  try {
    const now = new Date();
    // Simplificado - verifica apenas hora local
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDay = now.getDay();

    // Verificar dia da semana
    if (!config.working_days.includes(currentDay)) {
      return false;
    }

    // Verificar horário
    const [startHour, startMinute] = config.working_hours_start.split(':').map(Number);
    const [endHour, endMinute] = config.working_hours_end.split(':').map(Number);

    const currentMinutes = currentHour * 60 + currentMinute;
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } catch {
    return true; // Em caso de erro, permite responder
  }
}

function checkEscalationKeywords(message: string, keywords: string[]): boolean {
  const lowerMessage = message.toLowerCase();
  return keywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()));
}

function buildSystemPrompt(
  config: AIAgentConfig, 
  contact: any, 
  knowledgeItems: Array<{title: string; content: string; category: string}> = [],
  templates: Array<{name: string; template_content: string; trigger_patterns: string[]}> = []
): string {
  const toneMap: Record<string, string> = {
    professional: 'profissional, formal e cortês',
    friendly: 'amigável, caloroso e acessível',
    casual: 'casual, descontraído e informal'
  };

  const tone = toneMap[config.tone_of_voice] || toneMap.professional;
  const contactName = contact?.name || 'cliente';

  let prompt = `Você é ${config.agent_name}, assistente virtual de atendimento ao cliente.

PERSONA E TOM:
${config.persona_description || 'Você é um assistente prestativo e eficiente.'}
Seu tom de voz deve ser ${tone}.

CLIENTE ATUAL: ${contactName}

REGRAS IMPORTANTES:
1. Responda sempre em português brasileiro
2. Seja conciso - máximo de 2-3 frases por resposta
3. Use emojis com moderação (1-2 por mensagem no máximo)
4. Se não souber algo, admita e ofereça transferir para um atendente humano
5. Se o cliente demonstrar frustração, irritação ou pedir explicitamente um humano, responda com [ESCALAR] no início da mensagem
6. Nunca invente informações sobre produtos, preços ou políticas
7. Foque em resolver o problema do cliente de forma eficiente`;

  // Add knowledge base items
  if (knowledgeItems.length > 0) {
    prompt += `\n\n📚 BASE DE CONHECIMENTO RELEVANTE:`;
    knowledgeItems.forEach(item => {
      prompt += `\n- [${item.category.toUpperCase()}] ${item.title}: ${item.content}`;
    });
  }

  // Add suggested templates
  if (templates.length > 0) {
    prompt += `\n\n💬 TEMPLATES SUGERIDOS (adapte ao contexto):`;
    templates.forEach(t => {
      prompt += `\n- ${t.name}: "${t.template_content}"`;
    });
  }

  if (config.business_context) {
    prompt += `\n\nCONTEXTO DO NEGÓCIO:\n${config.business_context}`;
  }

  if (config.faq_context) {
    prompt += `\n\nPERGUNTAS FREQUENTES:\n${config.faq_context}`;
  }

  if (config.product_catalog) {
    prompt += `\n\nCATÁLOGO DE PRODUTOS/SERVIÇOS:\n${config.product_catalog}`;
  }

  return prompt;
}

// Search relevant knowledge from the knowledge base
async function searchRelevantKnowledge(
  supabase: any, 
  sectorId: string, 
  message: string
): Promise<Array<{title: string; content: string; category: string; id: string}>> {
  try {
    // Extract keywords from message
    const keywords = message.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    
    if (keywords.length === 0) return [];

    // Search for matching knowledge items
    const { data, error } = await supabase
      .from('business_knowledge_base')
      .select('id, title, content, category, keywords')
      .eq('sector_id', sectorId)
      .eq('is_active', true)
      .order('usage_count', { ascending: false })
      .limit(10);

    if (error || !data) return [];

    // Filter by keyword matching
    const matched = data.filter((item: any) => {
      const itemKeywords = (item.keywords || []).map((k: string) => k.toLowerCase());
      const itemContent = (item.title + ' ' + item.content).toLowerCase();
      
      return keywords.some(kw => 
        itemKeywords.some((ik: string) => ik.includes(kw)) || 
        itemContent.includes(kw)
      );
    }).slice(0, 5);

    // Update usage count for matched items
    if (matched.length > 0) {
      for (const item of matched) {
        await supabase
          .from('business_knowledge_base')
          .update({ 
            usage_count: (item as any).usage_count + 1,
            last_used_at: new Date().toISOString()
          })
          .eq('id', item.id);
      }
    }

    return matched;
  } catch (error) {
    console.error('[AI Agent] Error searching knowledge:', error);
    return [];
  }
}

// Search relevant response templates
async function searchRelevantTemplates(
  supabase: any, 
  sectorId: string, 
  message: string
): Promise<Array<{name: string; template_content: string; trigger_patterns: string[]; id: string}>> {
  try {
    const lowerMessage = message.toLowerCase();

    const { data, error } = await supabase
      .from('response_templates')
      .select('id, name, template_content, trigger_patterns')
      .eq('sector_id', sectorId)
      .eq('is_active', true)
      .order('priority', { ascending: false })
      .limit(20);

    if (error || !data) return [];

    // Filter by trigger pattern matching
    const matched = data.filter((template: any) => {
      const patterns = template.trigger_patterns || [];
      return patterns.some((pattern: string) => 
        lowerMessage.includes(pattern.toLowerCase())
      );
    }).slice(0, 3);

    // Update usage count for matched templates
    if (matched.length > 0) {
      for (const template of matched) {
        const { data: current } = await supabase
          .from('response_templates')
          .select('usage_count')
          .eq('id', template.id)
          .single();
          
        await supabase
          .from('response_templates')
          .update({ usage_count: (current?.usage_count || 0) + 1 })
          .eq('id', template.id);
      }
    }

    return matched;
  } catch (error) {
    console.error('[AI Agent] Error searching templates:', error);
    return [];
  }
}

async function getOrCreateSession(supabase: any, conversationId: string): Promise<AIAgentSession> {
  const { data: existing } = await supabase
    .from('ai_agent_sessions')
    .select('*')
    .eq('conversation_id', conversationId)
    .single();

  if (existing) {
    return existing;
  }

  const { data: newSession, error } = await supabase
    .from('ai_agent_sessions')
    .insert({
      conversation_id: conversationId,
      mode: 'ai',
      auto_reply_count: 0,
    })
    .select()
    .single();

  if (error) {
    console.error('[AI Agent] Error creating session:', error);
    throw error;
  }

  // Atualizar modo da conversa para AI
  await supabase
    .from('whatsapp_conversations')
    .update({ conversation_mode: 'ai' })
    .eq('id', conversationId);

  return newSession;
}

async function escalateConversation(supabase: any, conversationId: string, sessionId: string, reason: string) {
  // Atualizar sessão
  await supabase
    .from('ai_agent_sessions')
    .update({
      mode: 'human',
      escalated_at: new Date().toISOString(),
      escalation_reason: reason,
    })
    .eq('id', sessionId);

  // Atualizar conversa
  await supabase
    .from('whatsapp_conversations')
    .update({ conversation_mode: 'human' })
    .eq('id', conversationId);

  // Log
  await logAction(supabase, conversationId, sessionId, 'escalated', null, null, 0, 0, null, { reason });
}

async function sendMessage(supabase: any, conversation: any, content: string, agentName: string) {
  // Buscar instância para enviar via Evolution API
  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', conversation.instance_id)
    .single();

  if (!instance) {
    console.error('[AI Agent] Instance not found');
    return;
  }

  // Buscar secrets da instância
  const { data: secrets } = await supabase
    .from('whatsapp_instance_secrets')
    .select('api_url, api_key')
    .eq('instance_id', instance.id)
    .single();

  if (!secrets) {
    console.error('[AI Agent] Instance secrets not found');
    return;
  }

  // Enviar via Evolution API
  const remoteJid = conversation.contact?.phone_number?.includes('@') 
    ? conversation.contact.phone_number 
    : `${conversation.contact?.phone_number?.replace(/\D/g, '')}@s.whatsapp.net`;

  try {
    const response = await fetch(`${secrets.api_url}/message/sendText/${instance.name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': secrets.api_key,
      },
      body: JSON.stringify({
        number: remoteJid,
        text: content,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI Agent] Evolution API error:', errorText);
      return;
    }

    const result = await response.json();
    const messageId = result.key?.id;

    // Salvar mensagem no banco
    await supabase
      .from('whatsapp_messages')
      .insert({
        conversation_id: conversation.id,
        message_id: messageId || `ai_${Date.now()}`,
        content: content,
        message_type: 'text',
        is_from_me: true,
        is_ai_generated: true,
        status: 'sent',
        timestamp: new Date().toISOString(),
      });

    // Atualizar última mensagem da conversa
    await supabase
      .from('whatsapp_conversations')
      .update({
        last_message: content,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversation.id);

    console.log(`[AI Agent] Message sent: ${content.substring(0, 50)}...`);
  } catch (error) {
    console.error('[AI Agent] Error sending message:', error);
  }
}

async function logAction(
  supabase: any,
  conversationId: string,
  sessionId: string | null,
  action: string,
  inputMessage: string | null,
  aiResponse: string | null,
  tokensUsed: number,
  responseTimeMs: number,
  modelUsed?: string | null,
  metadata?: Record<string, any>
) {
  await supabase
    .from('ai_agent_logs')
    .insert({
      conversation_id: conversationId,
      session_id: sessionId,
      action,
      input_message: inputMessage,
      ai_response: aiResponse,
      tokens_used: tokensUsed,
      response_time_ms: responseTimeMs,
      model_used: modelUsed,
      metadata: metadata || {},
    });
}
