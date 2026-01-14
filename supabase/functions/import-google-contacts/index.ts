import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GoogleContact {
  resourceName: string;
  names?: Array<{ displayName: string }>;
  phoneNumbers?: Array<{ value: string; canonicalForm?: string }>;
  emailAddresses?: Array<{ value: string }>;
}

interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Get auth header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user auth
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const supabaseUser = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get current user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { 
      googleAccessToken, 
      instanceId, 
      sectorId 
    } = body;

    if (!googleAccessToken) {
      return new Response(
        JSON.stringify({ error: 'Token de acesso do Google não fornecido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!instanceId) {
      return new Response(
        JSON.stringify({ error: 'ID da instância não fornecido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[import-google-contacts] Starting import for user ${user.id}`);

    // Fetch contacts from Google People API
    const googleApiUrl = 'https://people.googleapis.com/v1/people/me/connections';
    const params = new URLSearchParams({
      personFields: 'names,phoneNumbers,emailAddresses',
      pageSize: '1000',
    });

    const googleResponse = await fetch(`${googleApiUrl}?${params}`, {
      headers: {
        Authorization: `Bearer ${googleAccessToken}`,
      },
    });

    if (!googleResponse.ok) {
      const errorText = await googleResponse.text();
      console.error('[import-google-contacts] Google API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Erro ao acessar contatos do Google. Verifique se autorizou o acesso.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const googleData = await googleResponse.json();
    const connections: GoogleContact[] = googleData.connections || [];

    console.log(`[import-google-contacts] Found ${connections.length} contacts from Google`);

    const result: ImportResult = {
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    // Process each contact
    for (const contact of connections) {
      try {
        // Get phone number (required field)
        const phoneNumbers = contact.phoneNumbers || [];
        if (phoneNumbers.length === 0) {
          result.skipped++;
          continue;
        }

        // Normalize phone number
        let phoneNumber = phoneNumbers[0].canonicalForm || phoneNumbers[0].value;
        phoneNumber = phoneNumber.replace(/\D/g, '');
        
        // Skip if no valid phone
        if (!phoneNumber || phoneNumber.length < 8) {
          result.skipped++;
          continue;
        }

        // Ensure phone has country code (default Brazil +55)
        if (!phoneNumber.startsWith('55') && phoneNumber.length <= 11) {
          phoneNumber = '55' + phoneNumber;
        }

        // Get name
        const name = contact.names?.[0]?.displayName || `Contato ${phoneNumber.slice(-4)}`;
        
        // Get email
        const email = contact.emailAddresses?.[0]?.value || null;

        // Check if contact already exists in this instance
        const { data: existingContact } = await supabaseAdmin
          .from('whatsapp_contacts')
          .select('id')
          .eq('instance_id', instanceId)
          .eq('phone_number', phoneNumber)
          .maybeSingle();

        if (existingContact) {
          // Update existing contact
          const { error: updateError } = await supabaseAdmin
            .from('whatsapp_contacts')
            .update({
              name,
              email,
              source: 'google',
              sector_id: sectorId || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingContact.id);

          if (updateError) {
            result.errors.push(`Erro ao atualizar ${name}: ${updateError.message}`);
          } else {
            result.updated++;
          }
        } else {
          // Create new contact
          const { error: insertError } = await supabaseAdmin
            .from('whatsapp_contacts')
            .insert({
              instance_id: instanceId,
              phone_number: phoneNumber,
              name,
              email,
              source: 'google',
              created_by: user.id,
              sector_id: sectorId || null,
            });

          if (insertError) {
            result.errors.push(`Erro ao importar ${name}: ${insertError.message}`);
          } else {
            result.imported++;
          }
        }
      } catch (contactError: unknown) {
        console.error('[import-google-contacts] Error processing contact:', contactError);
        const message = contactError instanceof Error ? contactError.message : 'Erro desconhecido';
        result.errors.push(`Erro ao processar contato: ${message}`);
      }
    }

    console.log(`[import-google-contacts] Import complete:`, result);

    return new Response(
      JSON.stringify({
        success: true,
        result,
        message: `Importação concluída: ${result.imported} novos, ${result.updated} atualizados, ${result.skipped} ignorados`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[import-google-contacts] Error:', error);
    const message = error instanceof Error ? error.message : 'Erro interno do servidor';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
