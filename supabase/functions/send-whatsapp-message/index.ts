import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.85.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendMessageRequest {
  conversationId: string;
  content?: string;
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document';
  mediaUrl?: string;
  mediaBase64?: string;
  mediaMimetype?: string;
  fileName?: string;
  quotedMessageId?: string;
  // Supervisor message support
  isSupervisorMessage?: boolean;
  supervisorId?: string;
  // When true, do not record this message in the chat or update conversation metadata
  skip_chat?: boolean;
  // When true, skip adding agent name prefix (for automatic messages)
  skipAgentPrefix?: boolean;
  // Used for template variable replacement in automatic messages
  templateContext?: {
    clienteNome?: string;
    clienteTelefone?: string;
    atendenteNome?: string;
    ticketNumero?: number | string;
    setorNome?: string;
  };
} 

// Helper function to get Evolution API auth headers based on provider type
function getEvolutionAuthHeaders(apiKey: string, providerType: string): Record<string, string> {
  // Evolution Cloud confirmou: ambos usam header 'apikey'
  return { apikey: apiKey };
}

// Helper function to replace template variables in message content
function replaceTemplateVariables(content: string, context: SendMessageRequest['templateContext']): string {
  if (!context) return content;
  
  let result = content;
  
  // Replace all template variables
  if (context.clienteNome) {
    result = result.replace(/\{\{clienteNome\}\}/g, context.clienteNome);
  }
  if (context.clienteTelefone) {
    result = result.replace(/\{\{clienteTelefone\}\}/g, context.clienteTelefone);
  }
  if (context.atendenteNome) {
    result = result.replace(/\{\{atendenteNome\}\}/g, context.atendenteNome);
  }
  if (context.ticketNumero !== undefined) {
    result = result.replace(/\{\{ticketNumero\}\}/g, String(context.ticketNumero));
  }
  if (context.setorNome) {
    result = result.replace(/\{\{setorNome\}\}/g, context.setorNome);
  }
  
  // Replace date/time variables
  const now = new Date();
  const dataAtual = now.toLocaleDateString('pt-BR');
  const horaAtual = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  
  result = result.replace(/\{\{dataAtual\}\}/g, dataAtual);
  result = result.replace(/\{\{horaAtual\}\}/g, horaAtual);
  
  return result;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body: SendMessageRequest = await req.json();
    console.log('[send-whatsapp-message] Request received:', { 
      conversationId: body.conversationId, 
      messageType: body.messageType 
    });

    // Default skip_chat to false when not provided
    const skipChat: boolean = body.skip_chat ?? false;
    console.log('[send-whatsapp-message] skip_chat:', skipChat);

    // Validate request
    if (!body.conversationId || !body.messageType) {
      return new Response(
        JSON.stringify({ success: false, error: 'conversationId and messageType are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.messageType === 'text' && !body.content) {
      return new Response(
        JSON.stringify({ success: false, error: 'content is required for text messages' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.messageType !== 'text' && !body.mediaUrl && !body.mediaBase64) {
      return new Response(
        JSON.stringify({ success: false, error: 'mediaUrl or mediaBase64 is required for media messages' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get conversation details including instance info and provider_type
    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select(`
        *,
        whatsapp_contacts!inner (
          phone_number,
          name
        ),
        whatsapp_instances!inner (
          id,
          instance_name,
          provider_type,
          instance_id_external
        )
      `)
      .eq('id', body.conversationId)
      .single();

    if (convError || !conversation) {
      console.error('[send] Conversation not found:', convError);
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch instance secrets
    const { data: secrets, error: secretsError } = await supabase
      .from('whatsapp_instance_secrets')
      .select('api_url, api_key')
      .eq('instance_id', (conversation as any).whatsapp_instances.id)
      .single();

    if (secretsError || !secrets) {
      console.error('[send] Failed to fetch instance secrets:', secretsError);
      return new Response(JSON.stringify({ error: 'Instance secrets not found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const instanceName = (conversation as any).whatsapp_instances.instance_name;
    const providerType = (conversation as any).whatsapp_instances.provider_type || 'self_hosted';
    const instanceIdExternal = (conversation as any).whatsapp_instances.instance_id_external;
    const contact = (conversation as any).whatsapp_contacts;

    // For Cloud, use instance_id_external (UUID) instead of instance_name
    const instanceIdentifier = providerType === 'cloud' && instanceIdExternal
      ? instanceIdExternal
      : instanceName;

    console.log('[send-whatsapp-message] Sending to:', contact.phone_number, 'Provider:', providerType, 'Instance:', instanceIdentifier);

    // Get current user (agent) info for message prefix
    let agentName: string | null = null;
    if (!body.skipAgentPrefix && body.messageType === 'text') {
      // Try to get current user from auth header
      const authHeader = req.headers.get('Authorization');
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user?.id) {
          // Fetch user profile to get full name
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .single();
          
          agentName = profile?.full_name || null;
        }
      }
    }

    // Process message content - apply template variables and agent prefix
    let processedContent = body.content || '';
    
    // Apply template variable replacements if context provided
    if (body.templateContext) {
      processedContent = replaceTemplateVariables(processedContent, body.templateContext);
    }
    
    // Add agent name prefix for text messages (if agent is identified and prefix not skipped)
    if (agentName && body.messageType === 'text' && !body.skipAgentPrefix) {
      processedContent = `*[ ${agentName} ]*\n${processedContent}`;
    }

    // Determine destination number format
    const destinationNumber = getDestinationNumber(contact.phone_number);

    // Build request for Evolution API (use processedContent instead of body.content)
    const { endpoint, requestBody } = buildEvolutionRequest(
      secrets.api_url,
      instanceIdentifier,
      destinationNumber,
      { ...body, content: processedContent }
    );

    console.log('[send-whatsapp-message] Evolution API endpoint:', endpoint);

    // Get correct auth headers based on provider type
    const authHeaders = getEvolutionAuthHeaders(secrets.api_key, providerType);

    // Send to Evolution API
    const evolutionResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify(requestBody),
    });

    if (!evolutionResponse.ok) {
      const errorText = await evolutionResponse.text();
      console.error('[send-whatsapp-message] Evolution API error:', errorText);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to send message via Evolution API' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const evolutionData = await evolutionResponse.json();
    console.log('[send-whatsapp-message] Evolution API response:', evolutionData);

    // Extract message ID from Evolution API response
    const messageId = evolutionData.key?.id || `msg_${Date.now()}`;

    // Extract media URL from Evolution API response
    let extractedMediaUrl: string | null = null;
    
    if (body.messageType === 'audio' && evolutionData.message?.audioMessage?.url) {
      extractedMediaUrl = evolutionData.message.audioMessage.url;
    } else if (body.messageType === 'image' && evolutionData.message?.imageMessage?.url) {
      extractedMediaUrl = evolutionData.message.imageMessage.url;
    } else if (body.messageType === 'video' && evolutionData.message?.videoMessage?.url) {
      extractedMediaUrl = evolutionData.message.videoMessage.url;
    } else if (body.messageType === 'document' && evolutionData.message?.documentMessage?.url) {
      extractedMediaUrl = evolutionData.message.documentMessage.url;
    }

    if (extractedMediaUrl) {
      console.log('[send-whatsapp-message] Extracted media URL:', extractedMediaUrl);
    }

    // If skip_chat is true, do not save the message or update conversation metadata
    if (skipChat) {
      console.log('[send-whatsapp-message] skip_chat=true, not saving message or updating conversation');
      const responsePayload = {
        success: true,
        message: {
          id: messageId,
          message_id: messageId,
          content: processedContent || '',
          message_type: body.messageType,
          media_url: extractedMediaUrl || body.mediaUrl || null,
          media_mimetype: body.mediaMimetype || null,
          status: 'sent',
          is_from_me: true,
          timestamp: new Date().toISOString(),
          skipped_chat: true,
        }
      };

      return new Response(
        JSON.stringify(responsePayload),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Save message to database (use processedContent which includes agent prefix and template vars)
    const messageContent = body.messageType === 'text' 
      ? processedContent 
      : (body.content || `Sent ${body.messageType}`);

    const { data: savedMessage, error: saveError } = await supabase
      .from('whatsapp_messages')
      .insert({
        conversation_id: body.conversationId,
        message_id: messageId,
        remote_jid: contact.phone_number,
        content: messageContent,
        message_type: body.messageType,
        media_url: extractedMediaUrl || body.mediaUrl || null,
        media_mimetype: body.mediaMimetype || null,
        status: 'sent',
        is_from_me: true,
        timestamp: new Date().toISOString(),
        quoted_message_id: body.quotedMessageId || null,
        is_supervisor_message: body.isSupervisorMessage || false,
        metadata: {
          fileName: body.fileName,
          supervisorId: body.isSupervisorMessage ? body.supervisorId : null,
        },
      })
      .select()
      .single();

    if (saveError) {
      console.error('[send-whatsapp-message] Error saving message:', saveError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to save message' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update conversation metadata
    await supabase
      .from('whatsapp_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: messageContent.substring(0, 100),
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.conversationId);

    console.log('[send-whatsapp-message] Message sent and saved:', savedMessage.id);

    return new Response(
      JSON.stringify({ success: true, message: savedMessage }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[send-whatsapp-message] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function getDestinationNumber(phoneNumber: string): string {
  // If phone ends with @lid (LinkedIn format), use complete format
  if (phoneNumber.includes('@lid')) {
    return phoneNumber;
  }
  // Otherwise, use only digits
  return phoneNumber.replace(/\D/g, '');
}

function buildEvolutionRequest(
  apiUrl: string,
  instanceName: string,
  number: string,
  body: SendMessageRequest
): { endpoint: string; requestBody: any } {
  // Remove trailing slash
  let baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
  
  // Remove /manager suffix if present (message endpoints are at root level)
  baseUrl = baseUrl.replace(/\/manager$/, '');

  switch (body.messageType) {
    case 'text': {
      const requestBody: any = {
        number,
        text: body.content,
      };

      if (body.quotedMessageId) {
        requestBody.quoted = {
          key: {
            id: body.quotedMessageId,
          },
        };
      }

      return {
        endpoint: `${baseUrl}/message/sendText/${instanceName}`,
        requestBody,
      };
    }

    case 'audio': {
      // Evolution API expects either a plain base64 string or a public URL
      let audioData: string | undefined;

      if (body.mediaBase64) {
        // Strip possible data URI prefix and keep only the base64 payload
        const base64 = body.mediaBase64.startsWith('data:')
          ? body.mediaBase64.split(',')[1] || ''
          : body.mediaBase64;

        audioData = base64;
      } else if (body.mediaUrl) {
        audioData = body.mediaUrl;
      }

      if (!audioData) {
        throw new Error('Missing audio data');
      }

      console.log('[send-whatsapp-message] Audio payload prepared:', {
        type: body.mediaBase64 ? 'base64' : 'url',
        length: audioData.length,
      });
      
      return {
        endpoint: `${baseUrl}/message/sendWhatsAppAudio/${instanceName}`,
        requestBody: {
          number,
          audio: audioData,
        },
      };
    }

    case 'image':
    case 'video':
    case 'document': {
      const requestBody: any = {
        number,
        mediatype: body.messageType,
        media: body.mediaBase64 || body.mediaUrl,
      };

      if (body.content) {
        requestBody.caption = body.content;
      }

      if (body.messageType === 'document' && body.fileName) {
        requestBody.fileName = body.fileName;
      }

      return {
        endpoint: `${baseUrl}/message/sendMedia/${instanceName}`,
        requestBody,
      };
    }

    default:
      throw new Error(`Unsupported message type: ${body.messageType}`);
  }
}
