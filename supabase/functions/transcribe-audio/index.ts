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

    console.log('[transcribe-audio] Processing audio from storage path:', message.media_url);

    // Get audio URL - either it's already a URL or it's a storage path
    let audioUrl = message.media_url;
    
    // Check if it's a storage path (not a URL)
    if (!audioUrl.startsWith('http://') && !audioUrl.startsWith('https://')) {
      // It's a storage path, generate signed URL
      console.log('[transcribe-audio] Generating signed URL for storage path:', audioUrl);
      
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('whatsapp-media')
        .createSignedUrl(audioUrl, 3600); // 1 hour expiry
      
      if (signedUrlError || !signedUrlData?.signedUrl) {
        console.error('[transcribe-audio] Failed to generate signed URL:', signedUrlError);
        await supabase
          .from('whatsapp_messages')
          .update({ transcription_status: 'failed' })
          .eq('id', messageId);
        return new Response(
          JSON.stringify({ error: 'Failed to access audio file' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      audioUrl = signedUrlData.signedUrl;
      console.log('[transcribe-audio] Signed URL generated successfully');
    }

    console.log('[transcribe-audio] Downloading audio...');

    // Download audio file
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      console.error('[transcribe-audio] Failed to download audio:', audioResponse.status, await audioResponse.text().catch(() => ''));
      await supabase
        .from('whatsapp_messages')
        .update({ transcription_status: 'failed' })
        .eq('id', messageId);
      throw new Error(`Failed to download audio: ${audioResponse.status}`);
    }

    const audioBuffer = await audioResponse.arrayBuffer();

    console.log('[transcribe-audio] Audio downloaded, size:', audioBuffer.byteLength);

    // Determine mime type
    const mimeType = message.media_mimetype || 'audio/m4a';

    // Prepare multipart form for GROQ transcription (example provided)
    const form = new FormData();
    const blob = new Blob([audioBuffer], { type: mimeType });
    form.append('file', blob, 'audio.m4a');
    form.append('model', 'whisper-large-v3');

    // Call GROQ transcription endpoint
    try {
      const groqResp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          // Let fetch set Content-Type for multipart/form-data
        },
        body: form as unknown as BodyInit,
      });

      if (!groqResp.ok) {
        const errText = await groqResp.text();
        console.error('[transcribe-audio] GROQ transcription error:', groqResp.status, errText);
        await supabase
          .from('whatsapp_messages')
          .update({ transcription_status: 'failed' })
          .eq('id', messageId);
        return new Response(JSON.stringify({ error: 'Transcription failed', details: errText }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const parsed = await groqResp.json().catch(async () => {
        const t = await groqResp.text();
        try { return JSON.parse(t); } catch { return { text: t }; }
      });

      const transcription = parsed?.text ?? parsed?.transcription ?? parsed?.data?.transcription ?? parsed?.results?.[0]?.alternatives?.[0]?.transcript ?? JSON.stringify(parsed);

      // Save transcription
      await supabase
        .from('whatsapp_messages')
        .update({ audio_transcription: transcription, transcription_status: 'completed' })
        .eq('id', messageId);

      return new Response(JSON.stringify({ success: true, transcription }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (err) {
      console.error('[transcribe-audio] Error calling GROQ transcription:', err);
      await supabase
        .from('whatsapp_messages')
        .update({ transcription_status: 'failed' })
        .eq('id', messageId);
      return new Response(JSON.stringify({ error: String(err) }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

  } catch (error) {
    console.error('[transcribe-audio] Error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
