import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      console.error('[transcribe-audio] LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { messageId } = await req.json();

    if (!messageId) {
      return new Response(
        JSON.stringify({ error: 'Message ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[transcribe-audio] Processing message:', messageId);

    // Get message data
    const { data: message, error: messageError } = await supabase
      .from('whatsapp_messages')
      .select('id, media_url, media_mimetype, audio_transcription, transcription_status')
      .eq('id', messageId)
      .single();

    if (messageError || !message) {
      console.error('[transcribe-audio] Message not found:', messageError);
      return new Response(
        JSON.stringify({ error: 'Message not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Skip if already transcribed or in progress
    if (message.audio_transcription || message.transcription_status === 'processing') {
      console.log('[transcribe-audio] Already transcribed or in progress');
      return new Response(
        JSON.stringify({ success: true, transcription: message.audio_transcription }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!message.media_url) {
      console.error('[transcribe-audio] No media URL');
      return new Response(
        JSON.stringify({ error: 'No audio URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark as processing
    await supabase
      .from('whatsapp_messages')
      .update({ transcription_status: 'processing' })
      .eq('id', messageId);

    console.log('[transcribe-audio] Downloading audio from:', message.media_url);

    // Download audio file
    const audioResponse = await fetch(message.media_url);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.status}`);
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));

    console.log('[transcribe-audio] Audio downloaded, size:', audioBuffer.byteLength);

    // Determine mime type
    const mimeType = message.media_mimetype || 'audio/ogg';

    // Call Lovable AI for transcription using Gemini
    const response = await fetch('https://api.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Transcreva este áudio em português. Retorne APENAS o texto transcrito, sem explicações ou formatação adicional. Se não conseguir entender o áudio, responda com "[Áudio inaudível]".'
              },
              {
                type: 'input_audio',
                input_audio: {
                  data: base64Audio,
                  format: mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp3') ? 'mp3' : 'wav'
                }
              }
            ]
          }
        ],
        max_tokens: 1000,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[transcribe-audio] AI API error:', response.status, errorText);
      
      await supabase
        .from('whatsapp_messages')
        .update({ transcription_status: 'failed' })
        .eq('id', messageId);
      
      return new Response(
        JSON.stringify({ error: 'Transcription failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    const transcription = result.choices?.[0]?.message?.content?.trim() || '';

    console.log('[transcribe-audio] Transcription result:', transcription.substring(0, 100));

    // Save transcription
    await supabase
      .from('whatsapp_messages')
      .update({
        audio_transcription: transcription,
        transcription_status: 'completed',
      })
      .eq('id', messageId);

    console.log('[transcribe-audio] Transcription saved successfully');

    return new Response(
      JSON.stringify({ success: true, transcription }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[transcribe-audio] Error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
