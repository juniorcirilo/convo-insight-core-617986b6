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
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');

    if (!GROQ_API_KEY) {
      console.error('[transcribe-audio] GROQ_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Transcription not supported: GROQ does not provide audio transcription' }),
        { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // GROQ does not currently support audio transcription. Mark as failed and return an explanatory error.
    await supabase
      .from('whatsapp_messages')
      .update({ transcription_status: 'failed' })
      .eq('id', messageId);

    return new Response(
      JSON.stringify({ error: 'Transcription not supported: configure a dedicated transcription provider (e.g., Whisper or other service).' }),
      { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[transcribe-audio] Error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
