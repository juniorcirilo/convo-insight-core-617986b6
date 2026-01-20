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

    const contactName = conversation?.contact?.name || 'Cliente';

    // Filtrar apenas mensagens de texto e inverter ordem (mais antigas primeiro)
    const textMessages = messages?.filter(m => m.message_type === 'text').reverse() || [];

    if (textMessages.length === 0) {
      console.log('No text messages found, returning defaults');
      return new Response(
        JSON.stringify({ suggestions: defaultSuggestions, context: { contactName, lastMessage: '' } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Identificar última mensagem do cliente
    const lastClientMessage = textMessages.filter(m => !m.is_from_me).pop();

    if (!lastClientMessage) {
      console.log('No client messages found, returning defaults');
      return new Response(
        JSON.stringify({ suggestions: defaultSuggestions, context: { contactName, lastMessage: '' } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Montar histórico das últimas 8 mensagens para contexto
    const recentMessages = textMessages.slice(-8).map(m => 
      `${m.is_from_me ? 'Você' : contactName}: ${m.content}`
    ).join('\n');

    console.log('Preparing AI suggestions (prefer GROQ)');

    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    const systemPrompt = `Você é um assistente que gera respostas CURTAS (até 2 frases) e ÚTEIS para atendimento ao cliente.\n\nREGRAS:\n- Foque em resolver ou encaminhar, não cumprimente à toa\n- Varie o tom: formal, amigável, direto\n- Use português do Brasil\n- Se for sobre agendamento, proponha 1-2 opções de horário\n- Se for instrução operacional, traga passos claros\n- Seja objetivo e útil\n\nCONTEXTO:\n- Cliente: ${contactName}\n- Última mensagem do cliente: "${lastClientMessage.content}"\n- Histórico recente:\n${recentMessages}`;

    // Preferred: GROQ AI
    if (GROQ_API_KEY) {
      try {
        console.log('Calling GROQ AI for suggestions');
        // Request GROQ to return JSON with an array `suggestions` of { text, tone }
        const groqResp = await fetch('https://api.groq.ai/v1/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'groq-1',
            prompt: `${systemPrompt}\n\nGERE_UM_JSON: Retorne exatamente um JSON com a chave \"suggestions\" contendo 3 objetos com \"text\" e \"tone\" (formal|friendly|direct). Não inclua texto adicional.`,
            max_tokens: 300,
            temperature: 0.7,
            n: 1,
          }),
        });

        if (groqResp.ok) {
          const text = await groqResp.text();
          try {
            const parsed = JSON.parse(text);
            if (parsed?.suggestions && Array.isArray(parsed.suggestions)) {
              console.log('GROQ suggestions parsed successfully');
              return new Response(JSON.stringify({ suggestions: parsed.suggestions, context: { contactName, lastMessage: lastClientMessage.content } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
          } catch (e) {
            console.warn('GROQ response not JSON, attempting to extract JSON substring');
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed?.suggestions && Array.isArray(parsed.suggestions)) {
                  return new Response(JSON.stringify({ suggestions: parsed.suggestions, context: { contactName, lastMessage: lastClientMessage.content } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }
              } catch (e) {
                console.warn('Failed to parse JSON from GROQ response');
              }
            }
          }
        } else {
          console.error('GROQ API error:', groqResp.status, await groqResp.text());
        }
      } catch (e) {
        console.error('Error calling GROQ API:', e);
      }
      // If GROQ fails, we'll fallback to Lovable if available
    }

    // Fallback: Lovable AI
    console.log('Calling Lovable AI for suggestions (fallback)');
    if (!LOVABLE_API_KEY) {
      console.warn('No AI provider configured (GROQ_API_KEY or LOVABLE_API_KEY missing)');
      return new Response(
        JSON.stringify({ suggestions: defaultSuggestions, context: { contactName, lastMessage: lastClientMessage.content } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Gere 3 sugestões de resposta com tons diferentes.' }
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'suggest_replies',
            description: 'Retorna 3 sugestões de resposta com tons diferentes',
            parameters: {
              type: 'object',
              properties: {
                suggestions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      text: { type: 'string', description: 'Texto da sugestão (máximo 2 frases)' },
                      tone: { 
                        type: 'string', 
                        enum: ['formal', 'friendly', 'direct'],
                        description: 'Tom da resposta'
                      }
                    },
                    required: ['text', 'tone']
                  },
                  minItems: 3,
                  maxItems: 3
                }
              },
              required: ['suggestions']
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'suggest_replies' } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);

      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ 
            error: 'Rate limit exceeded. Please try again in a moment.',
            suggestions: defaultSuggestions,
            context: { contactName, lastMessage: lastClientMessage.content }
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ 
            error: 'Insufficient credits. Please add credits to your Lovable AI workspace.',
            suggestions: defaultSuggestions,
            context: { contactName, lastMessage: lastClientMessage.content }
          }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Fallback para sugestões padrão em caso de erro
      return new Response(
        JSON.stringify({ 
          suggestions: defaultSuggestions,
          context: { contactName, lastMessage: lastClientMessage.content }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    console.log('AI response received:', JSON.stringify(aiData));

    // Extrair sugestões do tool call
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error('No tool call in AI response');
      return new Response(
        JSON.stringify({ 
          suggestions: defaultSuggestions,
          context: { contactName, lastMessage: lastClientMessage.content }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const suggestionsData = JSON.parse(toolCall.function.arguments);
    const suggestions = suggestionsData.suggestions || defaultSuggestions;

    console.log('Returning suggestions:', suggestions);

    return new Response(
      JSON.stringify({
        suggestions,
        context: {
          contactName,
          lastMessage: lastClientMessage.content
        }
      }),
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
