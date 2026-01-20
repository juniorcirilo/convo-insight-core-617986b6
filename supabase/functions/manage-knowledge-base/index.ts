import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface KnowledgeItem {
  id?: string;
  sector_id: string;
  category: string;
  subcategory?: string;
  title: string;
  content: string;
  keywords?: string[];
  source?: string;
  confidence_score?: number;
  is_verified?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, ...params } = await req.json();

    console.log(`[Knowledge Base] Action: ${action}`);

    switch (action) {
      case 'search':
        return await handleSearch(supabase, params);
      case 'add':
        return await handleAdd(supabase, params);
      case 'update':
        return await handleUpdate(supabase, params);
      case 'delete':
        return await handleDelete(supabase, params);
      case 'verify':
        return await handleVerify(supabase, params);
      case 'import':
        return await handleImport(supabase, params);
      case 'extract':
        return await handleExtract(supabase, params);
      case 'get_stats':
        return await handleGetStats(supabase, params);
      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error: any) {
    console.error('[Knowledge Base] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Search knowledge base with semantic search
async function handleSearch(supabase: any, params: { query: string; sectorId: string; category?: string; limit?: number }) {
  const { query, sectorId, category, limit = 5 } = params;

  // Use the database function for full-text search
  const { data, error } = await supabase.rpc('search_knowledge_base', {
    p_query: query,
    p_sector_id: sectorId,
    p_category: category || null,
    p_limit: limit,
  });

  if (error) {
    console.error('[Knowledge Base] Search error:', error);
    // Fallback to simple query if function fails
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('business_knowledge_base')
      .select('*')
      .eq('sector_id', sectorId)
      .eq('is_active', true)
      .ilike('content', `%${query}%`)
      .limit(limit);

    if (fallbackError) throw fallbackError;
    return new Response(JSON.stringify({ results: fallbackData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Update usage count for returned items
  if (data && data.length > 0) {
    const ids = data.map((item: any) => item.id);
    await supabase
      .from('business_knowledge_base')
      .update({ 
        usage_count: supabase.rpc('increment', { x: 1 }),
        last_used_at: new Date().toISOString() 
      })
      .in('id', ids);
  }

  return new Response(JSON.stringify({ results: data }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Add new knowledge item
async function handleAdd(supabase: any, params: { item: KnowledgeItem; userId?: string }) {
  const { item, userId } = params;

  // Extract keywords from content if not provided
  const keywords = item.keywords || extractKeywords(item.title + ' ' + item.content);

  const { data, error } = await supabase
    .from('business_knowledge_base')
    .insert({
      ...item,
      keywords,
      created_by: userId,
      source: item.source || 'manual',
    })
    .select()
    .single();

  if (error) throw error;

  return new Response(JSON.stringify({ success: true, item: data }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Update existing knowledge item
async function handleUpdate(supabase: any, params: { id: string; updates: Partial<KnowledgeItem> }) {
  const { id, updates } = params;

  // If content changed, update keywords
  if (updates.content || updates.title) {
    const { data: existing } = await supabase
      .from('business_knowledge_base')
      .select('title, content, version')
      .eq('id', id)
      .single();

    if (existing) {
      const typedUpdates = updates as any;
      const newTitle = typedUpdates.title || existing.title;
      const newContent = typedUpdates.content || existing.content;
      typedUpdates.keywords = extractKeywords(newTitle + ' ' + newContent);
      typedUpdates.version = existing.version + 1;
    }
  }

  const { data, error } = await supabase
    .from('business_knowledge_base')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  return new Response(JSON.stringify({ success: true, item: data }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Soft delete knowledge item
async function handleDelete(supabase: any, params: { id: string }) {
  const { id } = params;

  const { error } = await supabase
    .from('business_knowledge_base')
    .update({ is_active: false })
    .eq('id', id);

  if (error) throw error;

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Verify knowledge item
async function handleVerify(supabase: any, params: { id: string; userId: string }) {
  const { id, userId } = params;

  const { data, error } = await supabase
    .from('business_knowledge_base')
    .update({ 
      is_verified: true, 
      verified_by: userId,
      confidence_score: 1.0 
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  return new Response(JSON.stringify({ success: true, item: data }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Import multiple knowledge items
async function handleImport(supabase: any, params: { items: KnowledgeItem[]; sectorId: string; userId?: string }) {
  const { items, sectorId, userId } = params;

  const processedItems = items.map(item => ({
    ...item,
    sector_id: sectorId,
    keywords: item.keywords || extractKeywords(item.title + ' ' + item.content),
    created_by: userId,
    source: 'imported',
    is_verified: false,
  }));

  const { data, error } = await supabase
    .from('business_knowledge_base')
    .insert(processedItems)
    .select();

  if (error) throw error;

  return new Response(JSON.stringify({ 
    success: true, 
    imported: data.length,
    items: data 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Extract knowledge from conversation using AI
async function handleExtract(supabase: any, params: { conversationId: string; sectorId: string }) {
  const { conversationId, sectorId } = params;
  const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');

  if (!GROQ_API_KEY) {
    return new Response(JSON.stringify({ error: 'AI not configured (GROQ_API_KEY missing)' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Fetch conversation messages
  const { data: messages } = await supabase
    .from('whatsapp_messages')
    .select('content, is_from_me, is_ai_generated')
    .eq('conversation_id', conversationId)
    .eq('is_internal', false)
    .order('created_at', { ascending: true })
    .limit(50);

  if (!messages || messages.length < 3) {
    return new Response(JSON.stringify({ 
      success: false, 
      reason: 'Not enough messages' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Build conversation text
  const conversationText = messages
    .map((m: any) => `${m.is_from_me ? 'Atendente' : 'Cliente'}: ${m.content}`)
    .join('\n');

  // Use GROQ to extract knowledge
  const groqResp = await fetch('https://api.groq.ai/v1/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'groq-1',
      prompt: `Você é um especialista em extração de conhecimento de conversas de atendimento ao cliente.\n\nAnalise a conversa e extraia conhecimentos úteis que podem ser reutilizados para futuros atendimentos.\n\nCONVERSA:\n${conversationText}\n\nRETORNE APENAS JSON VÁLIDO no formato {"knowledge_items": [...], "confidence": 0.0-1.0}`,
      max_tokens: 1000,
      temperature: 0.3,
      n: 1,
    }),
  });

  if (!groqResp.ok) {
    throw new Error(`AI extraction failed: ${groqResp.status}`);
  }

  const extractedText = await groqResp.text();

  // Parse JSON response
  let extracted;
  try {
    // Clean the response in case it has markdown code blocks
    const cleanedText = extractedText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    extracted = JSON.parse(cleanedText);
  } catch {
    console.error('[Knowledge Base] Failed to parse AI response:', extractedText);
    return new Response(JSON.stringify({ 
      success: false, 
      reason: 'Failed to parse AI response' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Save extracted knowledge items
  if (extracted.knowledge_items && extracted.knowledge_items.length > 0) {
    const items = extracted.knowledge_items.map((item: any) => ({
      sector_id: sectorId,
      category: item.category,
      subcategory: item.subcategory,
      title: item.title,
      content: item.content,
      keywords: extractKeywords(item.title + ' ' + item.content),
      source: 'conversation',
      confidence_score: extracted.confidence || 0.7,
      is_verified: false,
    }));

    const { data: insertedItems, error } = await supabase
      .from('business_knowledge_base')
      .insert(items)
      .select();

    if (error) throw error;

    return new Response(JSON.stringify({ 
      success: true, 
      extracted: insertedItems.length,
      items: insertedItems 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ 
    success: true, 
    extracted: 0,
    message: 'No knowledge to extract' 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Get knowledge base statistics
async function handleGetStats(supabase: any, params: { sectorId: string }) {
  const { sectorId } = params;

  // Total items by category
  const { data: categoryStats } = await supabase
    .from('business_knowledge_base')
    .select('category')
    .eq('sector_id', sectorId)
    .eq('is_active', true);

  const categoryCounts: Record<string, number> = {};
  (categoryStats || []).forEach((item: any) => {
    categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
  });

  // Verification status
  const { count: verifiedCount } = await supabase
    .from('business_knowledge_base')
    .select('id', { count: 'exact', head: true })
    .eq('sector_id', sectorId)
    .eq('is_active', true)
    .eq('is_verified', true);

  const { count: unverifiedCount } = await supabase
    .from('business_knowledge_base')
    .select('id', { count: 'exact', head: true })
    .eq('sector_id', sectorId)
    .eq('is_active', true)
    .eq('is_verified', false);

  // Most used items
  const { data: mostUsed } = await supabase
    .from('business_knowledge_base')
    .select('id, title, category, usage_count')
    .eq('sector_id', sectorId)
    .eq('is_active', true)
    .order('usage_count', { ascending: false })
    .limit(10);

  // Items by source
  const { data: sourceStats } = await supabase
    .from('business_knowledge_base')
    .select('source')
    .eq('sector_id', sectorId)
    .eq('is_active', true);

  const sourceCounts: Record<string, number> = {};
  (sourceStats || []).forEach((item: any) => {
    sourceCounts[item.source] = (sourceCounts[item.source] || 0) + 1;
  });

  return new Response(JSON.stringify({
    total: (categoryStats || []).length,
    byCategory: categoryCounts,
    verified: verifiedCount || 0,
    unverified: unverifiedCount || 0,
    bySource: sourceCounts,
    mostUsed: mostUsed || [],
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Helper: Extract keywords from text
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'a', 'o', 'e', 'de', 'da', 'do', 'em', 'um', 'uma', 'para', 'com', 'não',
    'que', 'os', 'as', 'no', 'na', 'por', 'mais', 'mas', 'se', 'já', 'ou',
    'ter', 'ser', 'quando', 'muito', 'há', 'nos', 'eu', 'também', 'só',
    'pelo', 'pela', 'até', 'isso', 'ela', 'entre', 'era', 'depois', 'sem',
    'mesmo', 'aos', 'têm', 'seus', 'quem', 'nas', 'me', 'esse', 'eles',
    'está', 'você', 'tinha', 'foram', 'essa', 'num', 'nem', 'suas', 'meu',
    'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
    'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
    'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to'
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^\w\sáàâãéèêíìîóòôõúùûç]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  // Count word frequency
  const wordCount: Record<string, number> = {};
  words.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });

  // Return top keywords
  return Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word]) => word);
}
