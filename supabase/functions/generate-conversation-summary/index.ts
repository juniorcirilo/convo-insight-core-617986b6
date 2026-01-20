import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId } = await req.json();

    if (!conversationId) {
      throw new Error('conversationId é obrigatório');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');

    if (!GROQ_API_KEY) {
      console.warn('GROQ_API_KEY not configured, returning minimal response');
      return new Response(
        JSON.stringify({ message: 'GROQ_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Gerando resumo para conversa:', conversationId);

    // 1. Buscar últimas 30 mensagens da conversa
    const { data: messages, error: messagesError } = await supabase
      .from('whatsapp_messages')
      .select('content, timestamp, is_from_me')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: false })
      .limit(30);

    if (messagesError) throw messagesError;

    if (!messages || messages.length < 5) {
      return new Response(
        JSON.stringify({ message: 'Mínimo de 5 mensagens necessário para resumo.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // 2. Buscar dados da conversa e contato
    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select(`
        *,
        contact:whatsapp_contacts(name)
      `)
      .eq('id', conversationId)
      .single();

    if (convError) throw convError;

    // 3. Formatar mensagens para IA
    const messagesText = messages
      .reverse()
      .map((m) => `[${m.is_from_me ? 'Atendente' : 'Cliente'}]: ${m.content}`)
      .join('\n');

    const contactName = conversation.contact?.name || 'Cliente';

    const prompt = `Analise esta conversa de WhatsApp e gere um resumo estruturado.

**Conversa com: ${contactName}**

${messagesText}

**Instruções:**
1. Crie um resumo conciso (máx 200 palavras) do que foi discutido
2. Liste os pontos-chave da conversa (máx 5)
3. Identifique ações pendentes ou próximos passos (máx 3)
4. Avalie o sentimento geral: "positive", "neutral" ou "negative"

Retorne APENAS um JSON válido sem markdown:
{
  "summary": "Resumo da conversa...",
  "key_points": ["Ponto 1", "Ponto 2"],
  "action_items": ["Ação 1", "Ação 2"],
  "sentiment": "positive"
}`;

    // 4. Call GROQ completions
    const systemPrompt = 'Você é um assistente de atendimento ao cliente. Gere resumos objetivos e úteis. Sempre responda com JSON válido sem formatação markdown.';
    let aiContent = '';
    try {
      const { getGroqModel } = await import('../groq-models.ts');
      const model = getGroqModel('chat_long_texts');

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
            { role: 'user', content: prompt }
          ],
          max_tokens: 800,
          temperature: 0.2,
        }),
      });

      if (!groqResp.ok) {
        const txt = await groqResp.text();
        console.error('GROQ error:', groqResp.status, txt);
        if (groqResp.status === 429) {
          return new Response(
            JSON.stringify({ error: 'Limite de requisições atingido. Tente novamente mais tarde.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ error: 'GROQ API error', status: groqResp.status, details: txt }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const parsed = await groqResp.json().catch(async () => {
        const txt = await groqResp.text();
        try { return JSON.parse(txt); } catch { return { text: txt }; }
      });

      aiContent = parsed?.choices?.[0]?.message?.content || parsed?.choices?.[0]?.text || parsed?.text || '';

      console.log('Resposta da IA:', aiContent);
    } catch (e) {
      console.error('Erro chamando GROQ:', e);
      throw e;
    }

    // Extrair JSON
    let result;
    try {
      result = JSON.parse(aiContent);
    } catch {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Resposta da IA não contém JSON válido');
      }
    }

    // 5. Salvar resumo
    const { data: savedSummary, error: saveError } = await supabase
      .from('whatsapp_conversation_summaries')
      .insert({
        conversation_id: conversationId,
        summary: result.summary,
        key_points: result.key_points || [],
        action_items: result.action_items || [],
        sentiment_at_time: result.sentiment,
        messages_count: messages.length,
        period_start: messages[0].timestamp,
        period_end: messages[messages.length - 1].timestamp,
      })
      .select()
      .single();

    if (saveError) throw saveError;

    console.log('Resumo salvo com sucesso');

    return new Response(
      JSON.stringify({ success: true, summary: savedSummary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro ao gerar resumo:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});