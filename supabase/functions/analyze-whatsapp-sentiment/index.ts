import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalyzeRequest {
  conversationId: string;
}

interface SentimentResult {
  sentiment: 'positive' | 'neutral' | 'negative';
  confidence: number;
  summary: string;
  reasoning: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');

    if (!GROQ_API_KEY) {
      console.error('GROQ_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { conversationId } = await req.json() as AnalyzeRequest;

    if (!conversationId) {
      return new Response(
        JSON.stringify({ success: false, error: 'conversationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Analyzing sentiment for conversation: ${conversationId}`);

    // Fetch last 10 messages from contact (is_from_me = false)
    const { data: messages, error: messagesError } = await supabase
      .from('whatsapp_messages')
      .select('content, timestamp')
      .eq('conversation_id', conversationId)
      .eq('is_from_me', false)
      .order('timestamp', { ascending: false })
      .limit(10);

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch messages' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check minimum messages requirement
    if (!messages || messages.length < 3) {
      console.log(`Insufficient messages: ${messages?.length || 0}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Mínimo 3 mensagens necessário para análise',
          messagesFound: messages?.length || 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch conversation and contact data
    const { data: conversation, error: conversationError } = await supabase
      .from('whatsapp_conversations')
      .select(`
        id,
        contact_id,
        whatsapp_contacts (
          id,
          name,
          phone_number
        )
      `)
      .eq('id', conversationId)
      .single();

    if (conversationError || !conversation) {
      console.error('Error fetching conversation:', conversationError);
      return new Response(
        JSON.stringify({ success: false, error: 'Conversation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Reverse messages to show oldest first
    const orderedMessages = [...messages].reverse();

    // Build prompt for AI
    const messagesText = orderedMessages
      .map((msg, index) => `${index + 1}. [${new Date(msg.timestamp).toLocaleString('pt-BR')}]: "${msg.content}"`)
      .join('\n');

    const prompt = `Analise o sentimento das últimas mensagens deste cliente de WhatsApp.

**Mensagens (mais antigas para mais recentes):**
${messagesText}

**Critérios de Análise:**
- **positive**: Cliente satisfeito, agradecido, animado, elogios
- **neutral**: Tom profissional, dúvidas técnicas, informações
- **negative**: Frustrado, insatisfeito, reclamando, impaciente

Analise o contexto geral e determine o sentimento predominante.`;

    console.log('Calling GROQ for sentiment analysis...');

    const groqResp = await fetch('https://api.groq.ai/v1/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'groq-1',
        prompt: `${prompt}\n\nRETORNE APENAS UM JSON COM campos: sentiment, confidence, summary, reasoning`,
        max_tokens: 200,
        temperature: 0.2,
        n: 1,
      }),
    });

    if (!groqResp.ok) {
      const errorText = await groqResp.text();
      console.error('GROQ AI error:', groqResp.status, errorText);

      if (groqResp.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: 'Rate limit excedido. Tente novamente em alguns segundos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ success: false, error: 'AI analysis failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const text = await groqResp.text();
    let result: SentimentResult;
    try {
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      result = JSON.parse(cleaned);
    } catch (e) {
      console.error('Failed to parse GROQ response:', text);
      return new Response(JSON.stringify({ success: false, error: 'Invalid AI response format' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    console.log('Parsed sentiment result:', result);

    // Validate sentiment value
    if (!['positive', 'neutral', 'negative'].includes(result.sentiment)) {
      console.error('Invalid sentiment value:', result.sentiment);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid sentiment value from AI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // UPSERT into whatsapp_sentiment_analysis (trigger will archive old one)
    const { data: analysis, error: upsertError } = await supabase
      .from('whatsapp_sentiment_analysis')
      .upsert({
        conversation_id: conversationId,
        contact_id: conversation.contact_id,
        sentiment: result.sentiment,
        confidence_score: result.confidence,
        summary: result.summary.substring(0, 100), // Ensure max 100 chars
        reasoning: result.reasoning,
        messages_analyzed: messages.length,
        metadata: { 
          model: 'google/gemini-2.5-flash',
          analyzed_at: new Date().toISOString()
        }
      }, {
        onConflict: 'conversation_id'
      })
      .select()
      .single();

    if (upsertError) {
      console.error('Error saving analysis:', upsertError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to save analysis' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Analysis saved successfully:', analysis.id);

    return new Response(
      JSON.stringify({
        success: true,
        analysis: {
          id: analysis.id,
          conversation_id: analysis.conversation_id,
          sentiment: analysis.sentiment,
          confidence_score: analysis.confidence_score,
          summary: analysis.summary,
          reasoning: analysis.reasoning,
          messages_analyzed: analysis.messages_analyzed
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
