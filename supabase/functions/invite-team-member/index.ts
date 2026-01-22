import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InviteRequest {
  email: string;
  fullName: string;
  role: 'admin' | 'supervisor' | 'agent';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Get caller's authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[invite-team-member] No authorization header');
      return new Response(
        JSON.stringify({ error: 'Não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Verify caller with anon key using REST to avoid JWT verification in runtime
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: supabaseAnonKey }
    });

    if (!userResp.ok) {
      console.error('[invite-team-member] Invalid authentication via REST');
      return new Response(
        JSON.stringify({ error: 'Autenticação inválida' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userJson = await userResp.json();
    const user = userJson?.user;
    if (!user) {
      console.error('[invite-team-member] Invalid authentication: no user');
      return new Response(
        JSON.stringify({ error: 'Autenticação inválida' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[invite-team-member] Authenticated user:', user.id);

    // 3. Check if caller is admin (use a Supabase client with user auth header)
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: roleData, error: roleError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleError) {
      console.error('[invite-team-member] Error fetching user role:', roleError);
      return new Response(
        JSON.stringify({ error: 'Erro ao verificar permissões' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (roleData?.role !== 'admin') {
      console.error('[invite-team-member] User is not admin:', user.id, 'role:', roleData?.role);
      return new Response(
        JSON.stringify({ error: 'Apenas administradores podem convidar membros da equipe' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[invite-team-member] Admin authorization verified for user:', user.id);

    // 4. Now proceed with service role for user creation
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { email, fullName, role }: InviteRequest = await req.json();

    console.log('[invite-team-member] Creating user:', { email, fullName, role, invitedBy: user.id });

    // Create user via Admin API
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: false, // Require email confirmation
      user_metadata: {
        full_name: fullName
      }
    });

    if (createError) {
      console.error('[invite-team-member] Error creating user:', createError);
      throw createError;
    }

    console.log('[invite-team-member] User created:', userData.user.id);

    // Update role (trigger already created default 'agent' role)
    const { error: roleUpdateError } = await supabaseAdmin
      .from('user_roles')
      .update({ role: role })
      .eq('user_id', userData.user.id);

    if (roleUpdateError) {
      console.error('[invite-team-member] Error updating role:', roleUpdateError);
      throw roleUpdateError;
    }

    console.log('[invite-team-member] Role updated successfully to:', role);

    return new Response(
      JSON.stringify({ 
        success: true, 
        userId: userData.user.id,
        message: 'Convite enviado com sucesso. O membro receberá um email para confirmar o cadastro.' 
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('[invite-team-member] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
