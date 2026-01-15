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
    // 1. Get caller's authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Verify caller
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
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

    // 3. If conversationId is provided, verify access using RPC
    if (conversationId) {
      const { data: hasAccess, error: accessError } = await supabaseClient
        .rpc('can_access_conversation', {
          _conversation_id: conversationId,
          _user_id: user.id
        });

      if (accessError) {
        console.error('[get-media-signed-url] Error checking access:', accessError);
        return new Response(
          JSON.stringify({ error: 'Erro ao verificar acesso' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!hasAccess) {
        return new Response(
          JSON.stringify({ error: 'Sem permissão para acessar este arquivo' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 4. Generate signed URL using service role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Generate a signed URL that expires in 1 hour
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

    return new Response(
      JSON.stringify({ 
        signedUrl: signedUrlData.signedUrl 
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('[get-media-signed-url] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
