import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SignedUrlRequest {
  filePath: string;
  conversationId?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    // 1. Get caller's authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No auth header');
      return new Response(
        JSON.stringify({ error: 'Não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Verify caller
    const token = authHeader.replace('Bearer ', '');
    let userId: string | null = null;
    
    // Check if it's a service role token first (for internal calls)
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload.role === 'service_role') {
          console.log('[get-media-signed-url] Service role access');
          userId = 'service-role';
        }
      }
    } catch (e) {
      // Not a valid JWT or decode failed, continue with user check
    }
    
    // If not service role, try to verify via /auth/v1/user
    if (!userId) {
      const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { Authorization: authHeader, apikey: supabaseAnonKey }
      });
      
      if (userResp.ok) {
        const userJson = await userResp.json();
        userId = userJson?.id || userJson?.user?.id;
      }
    }
    
    if (!userId) {
      console.error('Invalid token: no user found');
      return new Response(
        JSON.stringify({ error: 'Autenticação inválida' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { filePath, conversationId }: SignedUrlRequest = await req.json();

    if (!filePath) {
      return new Response(
        JSON.stringify({ error: 'filePath é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[get-media-signed-url] Generating URL for:', filePath);

    // 3. Generate signed URL using service role
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
      .from('whatsapp-media')
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (signedUrlError) {
      console.error('[get-media-signed-url] Error generating signed URL:', signedUrlError);
      return new Response(
        JSON.stringify({ error: 'Erro ao gerar URL do arquivo' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the public URL from environment or use a default
    const publicUrl = Deno.env.get('SUPABASE_PUBLIC_URL') || 'http://192.168.3.100:54321';
    
    // Ensure the URL uses the public-facing URL (not internal Docker network)
    let finalUrl = signedUrlData.signedUrl;
    
    // Replace internal Docker URLs with public URL
    if (finalUrl) {
      finalUrl = finalUrl
        .replace('http://kong:8000', publicUrl)
        .replace('http://localhost:54321', publicUrl)
        .replace('http://127.0.0.1:54321', publicUrl);
    }
    
    // If still relative, make absolute
    if (finalUrl && !finalUrl.startsWith('http')) {
      finalUrl = `${publicUrl}/storage/v1${finalUrl.startsWith('/') ? '' : '/'}${finalUrl}`;
    }

    console.log('[get-media-signed-url] Generated URL successfully:', finalUrl);

    return new Response(
      JSON.stringify({ signedUrl: finalUrl }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[get-media-signed-url] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
