import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, action, targetLanguage } = await req.json();

    if (!message || !action) {
      throw new Error('Message and action are required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('VITE_SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('VITE_SUPABASE_ANON_KEY');
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') || Deno.env.get('VITE_GROQ_API_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase env missing. SUPABASE_URL:', !!supabaseUrl, 'SUPABASE_KEY:', !!supabaseKey);
      return new Response(JSON.stringify({ error: 'Supabase configuration missing in function env' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!GROQ_API_KEY) {
      console.error('GROQ_API_KEY missing in function env');
      return new Response(JSON.stringify({ error: 'GROQ_API_KEY not configured' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    let prompt = '';
    let userHistory = '';

    // Para "my_tone", buscar histórico de mensagens enviadas para aprender o estilo
    if (action === 'my_tone') {
      const { data: messages } = await supabase
        .from('whatsapp_messages')
        .select('content')
        .eq('is_from_me', true)
        .not('content', 'is', null)
        .order('timestamp', { ascending: false })
        .limit(20);

      if (messages && messages.length > 0) {
        userHistory = messages
          .map((m, i) => `${i + 1}. "${m.content}"`)
          .join('\n');
      }
    }

    // Definir prompts para cada ação
    switch (action) {
      case 'expand':
        prompt = `Você é um assistente de atendimento. Expanda esta mensagem curta em uma resposta completa e profissional, mantendo o mesmo significado mas adicionando contexto e detalhes úteis:

"${message}"

Responda apenas com o texto expandido, sem explicações.`;
        break;

      case 'rephrase':
        prompt = `Reformule esta mensagem mantendo exatamente o mesmo significado, mas usando palavras e estrutura diferentes:

"${message}"

Responda apenas com o texto reformulado.`;
        break;

      case 'my_tone':
        if (!userHistory) {
          prompt = `Reescreva esta mensagem de forma profissional e amigável:

"${message}"

Responda apenas com a mensagem reescrita.`;
        } else {
          prompt = `Aqui estão exemplos de mensagens enviadas anteriormente:

${userHistory}

Agora reescreva esta mensagem usando o mesmo estilo de escrita dos exemplos acima, incluindo o tom, vocabulário e uso de emojis:

"${message}"

Responda apenas com a mensagem reescrita no mesmo estilo.`;
        }
        break;

      case 'friendly':
        prompt = `Reescreva esta mensagem de forma mais casual, amigável e acolhedora. Use emojis apropriados:

"${message}"

Responda apenas com a versão amigável.`;
        break;

      case 'formal':
        prompt = `Reescreva esta mensagem de forma mais profissional e formal, removendo gírias e mantendo um tom corporativo:

"${message}"

Responda apenas com a versão formal.`;
        break;

      case 'fix_grammar':
        prompt = `Corrija todos os erros de gramática, ortografia e pontuação nesta mensagem, mantendo o tom e significado:

"${message}"

Responda apenas com o texto corrigido.`;
        break;

      case 'translate':
        const languageNames: Record<string, string> = {
          'en': 'inglês',
          'es': 'espanhol',
          'fr': 'francês',
          'de': 'alemão',
          'it': 'italiano',
          'pt': 'português'
        };
        const langName = languageNames[targetLanguage || 'en'] || targetLanguage;
        prompt = `Traduza esta mensagem para ${langName}, mantendo o tom e o contexto:

"${message}"

Responda apenas com a tradução.`;
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    console.log('Calling GROQ for composition action:', action);
    const { getGroqModel } = await import('../groq-models.ts');
    // For grammar correction use the tested example model
    const model = action === 'fix_grammar' ? 'llama-3.3-70b-versatile' : getGroqModel('chat_simple');

    const groqResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: '' }
        ],
        max_tokens: 300,
        temperature: 0.6,
      }),
    });

    if (!groqResp.ok) {
      const errText = await groqResp.text();
      console.error('GROQ error:', groqResp.status, errText);
      // Surface upstream error to caller for easier debugging
      return new Response(
        JSON.stringify({ error: 'GROQ API error', status: groqResp.status, details: errText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const text = await groqResp.text();
    let composedText = '';
    try {
      const parsed = JSON.parse(text);
      composedText = parsed?.choices?.[0]?.message?.content || parsed?.choices?.[0]?.text || parsed?.text || text;
    } catch {
      composedText = text;
    }

    if (!composedText) {
      console.error('No composed text returned from GROQ response');
      return new Response(
        JSON.stringify({ error: 'No response from AI' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('AI composition successful for action:', action);

    return new Response(
      JSON.stringify({
        original: message,
        composed: composedText.trim(),
        action
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in compose-whatsapp-message:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
