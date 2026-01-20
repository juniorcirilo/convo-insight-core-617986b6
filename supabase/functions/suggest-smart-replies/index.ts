import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SmartReplySuggestion {
  text: string;
  tone: 'formal' | 'friendly' | 'direct';
}

const defaultSuggestions: SmartReplySuggestion[] = [
  { text: "Olá! Como posso ajudá-lo(a) hoje?", tone: "formal" },
  { text: "Oi! Em que posso te ajudar? 😊", tone: "friendly" },
  { text: "Oi! Qual sua dúvida?", tone: "direct" }
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId } = await req.json();

    if (!conversationId) {
      return new Response(
        JSON.stringify({ error: 'conversationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Fetching messages for conversation:', conversationId);

    // Buscar últimas 10 mensagens da conversa
    const { data: messages, error: messagesError } = await supabase
      .from('whatsapp_messages')
      .select('content, is_from_me, timestamp, message_type')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: false })
      .limit(10);

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return new Response(
        JSON.stringify({ suggestions: defaultSuggestions, context: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar dados do contato
    const { data: conversation } = await supabase
      .from('whatsapp_conversations')
      .select('contact:whatsapp_contacts(name)')
      .eq('id', conversationId)
      .single();

    const contactName = (conversation?.contact as { name?: string })?.name || 'Cliente';

    // Filtrar apenas mensagens de texto e inverter ordem (mais antigas primeiro)
    const textMessages = messages?.filter((m: any) => m.message_type === 'text').reverse() || [];

    if (textMessages.length === 0) {
      console.log('No text messages found, returning defaults');
      return new Response(
        JSON.stringify({ suggestions: defaultSuggestions, context: { contactName, lastMessage: '' } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Identificar última mensagem do cliente
    const lastClientMessage = textMessages.filter((m: any) => !m.is_from_me).pop();

    if (!lastClientMessage) {
      console.log('No client messages found, returning defaults');
      return new Response(
        JSON.stringify({ suggestions: defaultSuggestions, context: { contactName, lastMessage: '' } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Montar histórico das últimas 8 mensagens para contexto
    const recentMessages = textMessages.slice(-8).map((m: any) => 
      `${m.is_from_me ? 'Você' : contactName}: ${m.content}`
    ).join('\n');

    // Usar apenas GROQ
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    
    if (!GROQ_API_KEY) {
      console.warn('GROQ_API_KEY not configured, returning default suggestions');
      return new Response(
        JSON.stringify({ suggestions: defaultSuggestions, context: { contactName, lastMessage: lastClientMessage.content } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Importar modelo adequado - chat_fast para sugestões rápidas
    const { getGroqModel } = await import('../groq-models.ts');
    const model = getGroqModel('chat_fast'); // llama3-8b

    const systemPrompt = `Você é um assistente que gera respostas CURTAS (até 2 frases) e ÚTEIS para atendimento ao cliente.

REGRAS:
- Foque em resolver ou encaminhar, não cumprimente à toa
- Varie o tom: formal, amigável, direto
- Use português do Brasil
- Se for sobre agendamento, proponha 1-2 opções de horário
- Se for instrução operacional, traga passos claros
- Seja objetivo e útil

CONTEXTO:
- Cliente: ${contactName}
- Última mensagem do cliente: "${lastClientMessage.content}"
- Histórico recente:
${recentMessages}`;

    try {
      console.log('Calling GROQ AI for suggestions with model:', model);
      
      const groqResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: 'GERE_UM_JSON: Retorne exatamente um JSON com a chave "suggestions" contendo 3 objetos com "text" e "tone" (formal|friendly|direct). Não inclua texto adicional.' }
          ],
          max_tokens: 300,
          temperature: 0.7,
        }),
      });

      if (groqResp.ok) {
        const data = await groqResp.json();
        const content = data?.choices?.[0]?.message?.content || '';
        
        // Tentar extrair JSON da resposta
        try {
          // Primeiro tenta parsear direto
          const parsed = JSON.parse(content);
          if (parsed?.suggestions && Array.isArray(parsed.suggestions)) {
            console.log('GROQ suggestions parsed successfully');
            return new Response(
              JSON.stringify({ suggestions: parsed.suggestions, context: { contactName, lastMessage: lastClientMessage.content } }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } catch {
          // Tenta extrair JSON do meio do texto
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed?.suggestions && Array.isArray(parsed.suggestions)) {
                console.log('GROQ suggestions extracted from text');
                return new Response(
                  JSON.stringify({ suggestions: parsed.suggestions, context: { contactName, lastMessage: lastClientMessage.content } }),
                  { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
              }
            } catch {
              console.warn('Failed to parse JSON from GROQ response');
            }
          }
        }
      } else {
        const errorText = await groqResp.text();
        console.error('GROQ API error:', groqResp.status, errorText);
      }
    } catch (e) {
      console.error('Error calling GROQ API:', e);
    }

    // Fallback para sugestões padrão
    console.warn('GROQ did not return valid suggestions, returning defaults');
    return new Response(
      JSON.stringify({ suggestions: defaultSuggestions, context: { contactName, lastMessage: lastClientMessage.content } }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in suggest-smart-replies:', error);
    return new Response(
      JSON.stringify({ 
        suggestions: defaultSuggestions, 
        context: null, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
