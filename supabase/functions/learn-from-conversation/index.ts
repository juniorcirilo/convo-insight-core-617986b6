import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LearningExample {
  input_context: string;
  ideal_response: string;
  scenario_type: string;
  tags: string[];
  quality_score: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!GROQ_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI not configured (GROQ_API_KEY missing)' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, conversationId, sectorId, messageId, userId } = await req.json();

    console.log(`[Learn] Action: ${action}, Conversation: ${conversationId}`);

    switch (action) {
      case 'analyze':
        return await analyzeConversation(supabase, GROQ_API_KEY!, conversationId, sectorId);
      case 'mark_good':
        return await markAsGoodExample(supabase, messageId, conversationId, sectorId, userId);
      case 'learn_from_feedback':
        return await learnFromFeedback(supabase, GROQ_API_KEY!, sectorId);
      case 'find_patterns':
        return await findPatterns(supabase, GROQ_API_KEY!, sectorId);
      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error: any) {
    console.error('[Learn] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Analyze a successful conversation and extract learning examples
async function analyzeConversation(
  supabase: any, 
  apiKey: string, 
  conversationId: string, 
  sectorId: string
) {
  // Fetch conversation with lead info
  const { data: conversation } = await supabase
    .from('whatsapp_conversations')
    .select(`
      *,
      contact:whatsapp_contacts(name),
      lead:leads(status, lead_score)
    `)
    .eq('id', conversationId)
    .single();

  if (!conversation) {
    return new Response(JSON.stringify({ error: 'Conversation not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Fetch messages
  const { data: messages } = await supabase
    .from('whatsapp_messages')
    .select('id, content, is_from_me, is_ai_generated, created_at')
    .eq('conversation_id', conversationId)
    .eq('is_internal', false)
    .order('created_at', { ascending: true });

  if (!messages || messages.length < 4) {
    return new Response(JSON.stringify({ 
      success: false, 
      reason: 'Not enough messages for analysis' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Check if lead converted
  const leadConverted = conversation.lead?.status === 'closed' || 
                        conversation.lead?.status === 'qualified';
  const highScore = conversation.lead?.lead_score >= 70;

  // Build conversation for AI analysis
  const conversationText = messages
    .map((m: any) => `${m.is_from_me ? (m.is_ai_generated ? '[IA]' : '[Humano]') : '[Cliente]'}: ${m.content}`)
    .join('\n');

  // AI analysis prompt using GROQ (chat completion)
  try {
    const { getGroqModel } = await import('../groq-models.ts');
    const model = getGroqModel('chat_complex');

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Você é um especialista em análise de conversas de atendimento e vendas. Retorne apenas JSON quando solicitado.' },
          { role: 'user', content: `CONTEXT: Lead convertido: ${leadConverted ? 'Sim' : 'Não'}, Score alto: ${highScore ? 'Sim' : 'Não'}\n\nCONVERSA:\n${conversationText}\n\nRETORNE UM JSON VÁLIDO COM examples, overall_quality e key_techniques.` }
        ],
        temperature: 0.3,
        max_tokens: 1500,
        n: 1,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('[Learn] GROQ error:', errText);
      return new Response(JSON.stringify({ success: false, reason: 'AI analysis failed', details: errText }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await resp.json();
    const assistant = body?.choices?.[0]?.message?.content ?? body?.choices?.[0]?.text ?? '';
    let analysis;
    try {
      const cleanedText = String(assistant).replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      analysis = JSON.parse(cleanedText);
    } catch (err) {
      console.error('[Learn] Failed to parse AI response:', assistant);
      return new Response(JSON.stringify({ success: false, reason: 'Failed to parse AI response' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  // Save learning examples
  if (analysis.examples && analysis.examples.length > 0) {
    const examples = analysis.examples.map((ex: LearningExample) => ({
      sector_id: sectorId,
      conversation_id: conversationId,
      input_context: ex.input_context,
      ideal_response: ex.ideal_response,
      scenario_type: ex.scenario_type,
      tags: ex.tags || [],
      quality_score: ex.quality_score || analysis.overall_quality || 0.7,
      lead_converted: leadConverted,
      customer_satisfied: analysis.overall_quality >= 0.7,
    }));

    const { data: savedExamples, error } = await supabase
      .from('learning_examples')
      .insert(examples)
      .select();

    if (error) {
      console.error('[Learn] Error saving examples:', error);
      throw error;
    }

    return new Response(JSON.stringify({ 
      success: true, 
      examples_saved: savedExamples.length,
      key_techniques: analysis.key_techniques,
      overall_quality: analysis.overall_quality
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ 
    success: true, 
    examples_saved: 0,
    message: 'No quality examples found' 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Mark a specific message as a good example
async function markAsGoodExample(
  supabase: any,
  messageId: string,
  conversationId: string,
  sectorId: string,
  userId: string
) {
  // Get the message and the preceding client message
  const { data: messages } = await supabase
    .from('whatsapp_messages')
    .select('id, content, is_from_me, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (!messages) {
    return new Response(JSON.stringify({ error: 'Messages not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Find the marked message and the preceding client message
  const messageIndex = messages.findIndex((m: any) => m.id === messageId);
  if (messageIndex === -1) {
    return new Response(JSON.stringify({ error: 'Message not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const markedMessage = messages[messageIndex];
  
  // Find the last client message before this one
  let clientMessage = null;
  for (let i = messageIndex - 1; i >= 0; i--) {
    if (!messages[i].is_from_me) {
      clientMessage = messages[i];
      break;
    }
  }

  if (!clientMessage) {
    return new Response(JSON.stringify({ error: 'No preceding client message' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Create learning example
  const { data: example, error } = await supabase
    .from('learning_examples')
    .insert({
      sector_id: sectorId,
      conversation_id: conversationId,
      message_id: messageId,
      input_context: clientMessage.content,
      ideal_response: markedMessage.content,
      scenario_type: 'manual',
      quality_score: 1.0, // User marked, so assume high quality
      marked_as_good_by: userId,
      marked_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;

  return new Response(JSON.stringify({ success: true, example }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Learn from agent feedback on AI responses
async function learnFromFeedback(supabase: any, apiKey: string, sectorId: string) {
  // Get recent feedback with corrections
  const { data: feedback } = await supabase
    .from('ai_response_feedback')
    .select(`
      *,
      log:ai_agent_logs(input_message, response_content)
    `)
    .eq('feedback_type', 'incorrect')
    .not('corrected_response', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!feedback || feedback.length === 0) {
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'No feedback to learn from' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Create learning examples from corrections
  const examples = feedback
    .filter((f: any) => f.log?.input_message && f.corrected_response)
    .map((f: any) => ({
      sector_id: sectorId,
      conversation_id: f.conversation_id,
      input_context: f.log.input_message,
      ideal_response: f.corrected_response,
      scenario_type: 'correction',
      tags: ['from_feedback', 'ai_correction'],
      quality_score: 0.9,
      notes: f.correction_reason,
    }));

  if (examples.length > 0) {
    const { data: saved, error } = await supabase
      .from('learning_examples')
      .insert(examples)
      .select();

    if (error) throw error;

    return new Response(JSON.stringify({ 
      success: true, 
      learned_from: saved.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ 
    success: true, 
    learned_from: 0 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Find patterns across learning examples
async function findPatterns(supabase: any, apiKey: string, sectorId: string) {
  // Get learning examples
  const { data: examples } = await supabase
    .from('learning_examples')
    .select('*')
    .eq('sector_id', sectorId)
    .gte('quality_score', 0.7)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!examples || examples.length < 5) {
    return new Response(JSON.stringify({ 
      success: false, 
      reason: 'Not enough examples for pattern analysis' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Group by scenario type
  const byScenario: Record<string, any[]> = {};
  examples.forEach((ex: any) => {
    const type = ex.scenario_type || 'other';
    if (!byScenario[type]) byScenario[type] = [];
    byScenario[type].push(ex);
  });

  // Use AI to find patterns
  const examplesText = examples
    .slice(0, 20)
    .map((ex: any) => `[${ex.scenario_type}]\nCliente: ${ex.input_context}\nResposta: ${ex.ideal_response}`)
    .join('\n\n---\n\n');

  // Use GROQ (chat) for pattern analysis
  const { getGroqModel } = await import('../groq-models.ts');
  const patternsModel = getGroqModel('chat_complex');
  const patternsResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: patternsModel,
      messages: [
        { role: 'system', content: 'Analise os exemplos de atendimento bem-sucedido e identifique padrões. Retorne um JSON com keys: patterns, common_techniques, suggested_templates' },
        { role: 'user', content: `EXEMPLOS:\n${examplesText}\n\nRETORNE UM JSON COM keys: patterns, common_techniques, suggested_templates` }
      ],
      max_tokens: 1500,
      temperature: 0.3,
      n: 1,
    }),
  });

  if (!patternsResp.ok) {
    const err = await patternsResp.text();
    console.error('[Learn] GROQ error (patterns):', err);
    return new Response(JSON.stringify({ success: false, reason: 'AI pattern analysis failed', details: err }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const patBody = await patternsResp.json();
  let patterns;
  try {
    const assistant = patBody?.choices?.[0]?.message?.content ?? patBody?.choices?.[0]?.text ?? '';
    const cleanedText = String(assistant).replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    patterns = JSON.parse(cleanedText);
  } catch (err) {
    console.error('[Learn] Failed to parse patterns:', err);
    return new Response(JSON.stringify({ success: false, reason: 'Failed to parse pattern analysis' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ 
    success: true, 
    patterns: patterns.patterns,
    common_techniques: patterns.common_techniques,
    suggested_templates: patterns.suggested_templates,
    examples_analyzed: examples.length,
    by_scenario: Object.fromEntries(
      Object.entries(byScenario).map(([k, v]) => [k, v.length])
    )
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
