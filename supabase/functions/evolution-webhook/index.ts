import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to dispatch webhooks via HTTP call
async function dispatchWebhook(supabase: any, event: string, data: any, instanceId?: string) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !serviceKey) {
      console.error('[webhook] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return;
    }
    
    console.log(`[webhook] Dispatching event: ${event}`);
    
    const response = await fetch(`${supabaseUrl}/functions/v1/dispatch-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ event, data, instance_id: instanceId })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[webhook] Error dispatching ${event}: ${response.status} - ${errorText}`);
    } else {
      console.log(`[webhook] Event ${event} dispatched successfully`);
    }
  } catch (error) {
    console.error(`[webhook] Error dispatching ${event}:`, error);
  }
}

// Auto sentiment analysis threshold (number of client messages to trigger analysis)
const AUTO_SENTIMENT_THRESHOLD = 5;

// Auto categorization threshold (number of client messages to trigger categorization)
const AUTO_CATEGORIZATION_THRESHOLD = 5;

interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data: any;
}

// Normalize phone number by removing WhatsApp suffixes
// Also extracts lid (LinkedIn ID) when present
function normalizePhoneNumber(remoteJid: string): { phone: string; isGroup: boolean; lid: string | null } {
  const isGroup = remoteJid.includes('@g.us');
  const isLid = remoteJid.includes('@lid');
  
  // Extract lid if present (format: xxxx:yyyy@lid or xxxx@lid)
  let lid: string | null = null;
  if (isLid) {
    lid = remoteJid.replace('@lid', '');
    console.log(`[evolution-webhook] Extracted lid: ${lid}`);
  }
  
  let phone = remoteJid
    .replace('@s.whatsapp.net', '')
    .replace('@g.us', '')
    .replace('@lid', '')
    .replace(/:\d+/, ''); // Remove device suffix if present

  // Normalização para números brasileiros
  // Adiciona nono dígito (9) se número brasileiro com 12 dígitos
  // Formato esperado: 55 + DDD(2) + 9 + número(8) = 13 dígitos
  if (phone.startsWith('55') && phone.length === 12) {
    const countryCode = phone.substring(0, 2); // 55
    const ddd = phone.substring(2, 4);          // DDD (ex: 48)
    const number = phone.substring(4);          // 8 dígitos restantes
    phone = `${countryCode}${ddd}9${number}`;
    console.log(`[evolution-webhook] Brazilian phone normalized: ${phone}`);
  }
  
  return { phone, isGroup, lid };
}

// Extract participant lid from message data (for group messages or alternative sender identification)
function extractParticipantLid(data: any): string | null {
  // Check various places where lid might be present
  const participant = data.key?.participant || data.participant || null;
  
  if (participant && participant.includes('@lid')) {
    return participant.replace('@lid', '');
  }
  
  // Check if remoteJid itself is a lid
  const remoteJid = data.key?.remoteJid;
  if (remoteJid && remoteJid.includes('@lid')) {
    return remoteJid.replace('@lid', '');
  }
  
  return null;
}

// Detect message type from Evolution API message object
function getMessageType(message: any): string {
  if (message.reactionMessage) return 'reaction';
  if (message.conversation || message.extendedTextMessage) return 'text';
  if (message.imageMessage) return 'image';
  if (message.audioMessage) return 'audio';
  if (message.videoMessage) return 'video';
  if (message.documentMessage) return 'document';
  if (message.stickerMessage) return 'sticker';
  if (message.contactMessage) return 'contact';
  if (message.contactsArrayMessage) return 'contacts';
  return 'text';
}

// Detect if message is an edited message
function isEditedMessage(message: any): boolean {
  return !!(message?.editedMessage || message?.protocolMessage?.editedMessage);
}

// Extract content/caption from message
function getMessageContent(message: any, type: string): string {
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  
  // Handle contact messages
  if (message.contactMessage) {
    return message.contactMessage.displayName || '📇 Contato';
  }
  if (message.contactsArrayMessage) {
    const count = message.contactsArrayMessage.contacts?.length || 0;
    return `📇 ${count} contato${count !== 1 ? 's' : ''}`;
  }
  
  // For media messages, try to get caption
  const mediaMessage = message[`${type}Message`];
  if (mediaMessage?.caption) return mediaMessage.caption;
  
  // Fallback descriptions
  const descriptions: Record<string, string> = {
    image: '📷 Imagem',
    audio: '🎵 Áudio',
    video: '🎥 Vídeo',
    document: '📄 Documento',
    sticker: '🎨 Sticker',
  };
  
  return descriptions[type] || 'Mensagem';
}

// Download media from Evolution API and upload to Supabase Storage
async function downloadAndUploadMedia(
  apiUrl: string,
  apiKey: string,
  instanceName: string,
  messageKey: any,
  supabase: any,
  mimetype: string,
  providerType: string = 'self_hosted'
): Promise<string | null> {
  try {
    console.log('[evolution-webhook] Downloading media from Evolution API...');
    
    // Determine correct auth header based on provider type
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (providerType === 'cloud') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else {
      headers['apikey'] = apiKey;
    }
    
    const response = await fetch(
      `${apiUrl}/chat/getBase64FromMediaMessage/${instanceName}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: { key: messageKey } }),
      }
    );

    if (!response.ok) {
      console.error('[evolution-webhook] Failed to download media:', response.status);
      return null;
    }

    const data = await response.json();
    const base64Data = data.base64;
    
    if (!base64Data) {
      console.error('[evolution-webhook] No base64 data in response');
      return null;
    }

    // Convert base64 to blob
    const base64String = base64Data.split(',')[1] || base64Data;
    const binaryString = atob(base64String);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimetype });

    // Generate unique filename
    // Extract extension correctly, removing codec info
    const extension = (mimetype.split('/')[1] || 'bin').split(';')[0].trim();
    const filename = `${Date.now()}-${messageKey.id}.${extension}`;
    const filePath = `${instanceName}/${filename}`;

    console.log('[evolution-webhook] Uploading to Supabase Storage:', filePath);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('whatsapp-media')
      .upload(filePath, blob, {
        contentType: mimetype,
        upsert: false,
      });

    if (uploadError) {
      console.error('[evolution-webhook] Storage upload error:', uploadError);
      return null;
    }

    // Return the file path instead of public URL
    // The client will request signed URLs when displaying media
    console.log('[evolution-webhook] Media uploaded successfully:', filePath);
    return filePath;
  } catch (error) {
    console.error('[evolution-webhook] Error in downloadAndUploadMedia:', error);
    return null;
  }
}

// Fetch and update profile picture in background
async function fetchAndUpdateProfilePicture(
  supabase: any,
  apiUrl: string,
  apiKey: string,
  instanceName: string,
  phoneNumber: string,
  contactId: string,
  providerType: string = 'self_hosted'
): Promise<void> {
  try {
    // Determine correct auth header based on provider type
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (providerType === 'cloud') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else {
      headers['apikey'] = apiKey;
    }
    
    const response = await fetch(
      `${apiUrl}/chat/fetchProfile/${instanceName}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ number: phoneNumber }),
      }
    );

    if (!response.ok) {
      console.log(`[evolution-webhook] Failed to fetch profile for ${phoneNumber}: ${response.status}`);
      return;
    }

    const data = await response.json();
    const profilePictureUrl = data.profilePictureUrl || data.picture;

    if (profilePictureUrl) {
      await supabase
        .from('whatsapp_contacts')
        .update({ 
          profile_picture_url: profilePictureUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', contactId);
      
      console.log(`[evolution-webhook] Profile picture updated for contact: ${contactId}`);
    }
  } catch (error) {
    console.log('[evolution-webhook] Failed to fetch profile picture:', error);
    // Erro silencioso - cron job vai pegar depois
  }
}

// Find or create contact - only update name if message is FROM contact
// Now supports finding by phone_number OR lid
async function findOrCreateContact(
  supabase: any,
  instanceId: string,
  phoneNumber: string,
  name: string,
  isGroup: boolean,
  isFromMe: boolean,
  apiUrl?: string,
  apiKey?: string,
  instanceName?: string,
  providerType: string = 'self_hosted',
  lid: string | null = null
): Promise<string | null> {
  try {
    // Gerar variantes do número para números brasileiros
    // Isso trata casos onde contatos existentes podem ter formatos diferentes
    const phoneVariants = [phoneNumber];

    // Se 13 dígitos (com 9), também buscar versão de 12 dígitos
    if (phoneNumber.startsWith('55') && phoneNumber.length === 13) {
      const withoutNinth = phoneNumber.slice(0, 4) + phoneNumber.slice(5);
      phoneVariants.push(withoutNinth);
    }
    // Se 12 dígitos (sem 9), também buscar versão de 13 dígitos
    if (phoneNumber.startsWith('55') && phoneNumber.length === 12) {
      const withNinth = phoneNumber.slice(0, 4) + '9' + phoneNumber.slice(4);
      phoneVariants.push(withNinth);
    }

    console.log(`[evolution-webhook] Searching contacts with variants: ${phoneVariants.join(', ')} and lid: ${lid}`);

    // First, try to find by lid if available (more unique identifier)
    let existingContact = null;
    
    if (lid) {
      const { data: lidContact } = await supabase
        .from('whatsapp_contacts')
        .select('id, name, phone_number, is_group, lid')
        .eq('instance_id', instanceId)
        .eq('lid', lid)
        .maybeSingle();
      
      if (lidContact) {
        existingContact = lidContact;
        console.log(`[evolution-webhook] Contact found by lid: ${lid}`);
      }
    }

    // If not found by lid, search by phone number variants
    if (!existingContact) {
      const { data: phoneContact } = await supabase
        .from('whatsapp_contacts')
        .select('id, name, phone_number, is_group, lid')
        .eq('instance_id', instanceId)
        .in('phone_number', phoneVariants)
        .maybeSingle();
      
      existingContact = phoneContact;
    }

    // Se encontrou com formato antigo, atualizar para formato normalizado
    if (existingContact && existingContact.phone_number !== phoneNumber) {
      await supabase
        .from('whatsapp_contacts')
        .update({ 
          phone_number: phoneNumber,
          updated_at: new Date().toISOString() 
        })
        .eq('id', existingContact.id);
      console.log(`[evolution-webhook] Contact phone normalized: ${existingContact.phone_number} -> ${phoneNumber}`);
    }

    if (existingContact) {
      // Update lid if we have one and it's different or not set
      if (lid && existingContact.lid !== lid) {
        await supabase
          .from('whatsapp_contacts')
          .update({ 
            lid: lid,
            updated_at: new Date().toISOString() 
          })
          .eq('id', existingContact.id);
        console.log(`[evolution-webhook] Contact lid updated: ${existingContact.id} -> ${lid}`);
      }

      // Update is_group if contact exists but is_group is incorrect
      if (isGroup && !existingContact.is_group) {
        await supabase
          .from('whatsapp_contacts')
          .update({ 
            is_group: true,
            updated_at: new Date().toISOString() 
          })
          .eq('id', existingContact.id);
        console.log(`[evolution-webhook] Contact marked as group: ${existingContact.id}`);
      }

      // Only update name if:
      // 1. Message is NOT from me (avoid setting contact name to instance owner)
      // 2. We have a real name (not just phone number)
      // 3. Current name is the phone number
      const shouldUpdateName = !isFromMe && 
                               name !== phoneNumber && 
                               existingContact.name === phoneNumber;
      
      if (shouldUpdateName) {
        await supabase
          .from('whatsapp_contacts')
          .update({ 
            name: name,
            updated_at: new Date().toISOString() 
          })
          .eq('id', existingContact.id);
        
        console.log(`[evolution-webhook] Contact name updated: ${existingContact.id} -> ${name}`);
      }
      
      return existingContact.id;
    }

    // Create new contact using upsert to handle race conditions
    // If message is from me, use phone number as name (to avoid using instance owner's name)
    const contactName = isFromMe ? phoneNumber : (name || phoneNumber);
    
    const { data: newContact, error } = await supabase
      .from('whatsapp_contacts')
      .upsert({
        instance_id: instanceId,
        phone_number: phoneNumber,
        name: contactName,
        is_group: isGroup,
        lid: lid,
      }, {
        onConflict: 'instance_id,phone_number',
        ignoreDuplicates: false,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[evolution-webhook] Error creating contact:', error);
      
      // If upsert failed, try to fetch the existing contact one more time
      const { data: retryContact } = await supabase
        .from('whatsapp_contacts')
        .select('id')
        .eq('instance_id', instanceId)
        .eq('phone_number', phoneNumber)
        .maybeSingle();
      
      if (retryContact) {
        console.log(`[evolution-webhook] Contact found on retry: ${retryContact.id}`);
        return retryContact.id;
      }
      
      return null;
    }

    console.log(`[evolution-webhook] Contact created/upserted: ${newContact.id} Name: ${name} Lid: ${lid}`);
    
    // Buscar foto de perfil em background (fire-and-forget)
    if (apiUrl && apiKey && instanceName) {
      fetchAndUpdateProfilePicture(supabase, apiUrl, apiKey, instanceName, phoneNumber, newContact.id, providerType)
        .catch(err => console.log('[evolution-webhook] Background profile fetch error:', err));
    }
    
    return newContact.id;
  } catch (error) {
    console.error('[evolution-webhook] Error in findOrCreateContact:', error);
    return null;
  }
}

// Apply auto-assignment rules with sector priority
async function applyAutoAssignment(
  supabase: any,
  instanceId: string,
  conversationId: string,
  sectorId?: string | null
): Promise<void> {
  try {
    // 1. Buscar regra ativa para o setor primeiro (se tiver setor)
    let rule = null;
    
    if (sectorId) {
      const { data: sectorRule } = await supabase
        .from('assignment_rules')
        .select('*')
        .eq('instance_id', instanceId)
        .eq('sector_id', sectorId)
        .eq('is_active', true)
        .maybeSingle();
      
      rule = sectorRule;
      console.log('[auto-assignment] Sector-specific rule:', sectorRule ? 'found' : 'not found');
    }

    // 2. Fallback para regra geral da instância (sem setor específico)
    if (!rule) {
      const { data: instanceRule } = await supabase
        .from('assignment_rules')
        .select('*')
        .eq('instance_id', instanceId)
        .is('sector_id', null)
        .eq('is_active', true)
        .maybeSingle();
      
      rule = instanceRule;
      console.log('[auto-assignment] Instance rule:', instanceRule ? 'found' : 'not found');
    }

    if (!rule) {
      console.log('[auto-assignment] No active rule found for instance:', instanceId);
      return; // Sem regra, conversa fica na fila
    }

    let assignedTo: string | null = null;

    if (rule.rule_type === 'fixed') {
      // Atribuição fixa
      assignedTo = rule.fixed_agent_id;
      console.log('[auto-assignment] Fixed assignment to:', assignedTo);
    } else if (rule.rule_type === 'round_robin') {
      // Round-robin
      let agents = rule.round_robin_agents || [];
      
      // Se temos setor, priorizar agentes do setor
      if (sectorId && agents.length > 0) {
        const { data: sectorAgents } = await supabase
          .from('user_sectors')
          .select('user_id')
          .eq('sector_id', sectorId);
        
        const sectorAgentIds = (sectorAgents || []).map((sa: any) => sa.user_id);
        const sectorEligibleAgents = agents.filter((id: string) => sectorAgentIds.includes(id));
        
        if (sectorEligibleAgents.length > 0) {
          agents = sectorEligibleAgents;
          console.log('[auto-assignment] Filtered to sector agents:', agents.length);
        }
      }

      if (agents.length === 0) {
        console.log('[auto-assignment] No agents in round-robin list');
        return;
      }

      const nextIndex = (rule.round_robin_last_index + 1) % agents.length;
      assignedTo = agents[nextIndex];
      console.log(`[auto-assignment] Round-robin assignment to: ${assignedTo} (index: ${nextIndex})`);

      // Atualizar índice para próxima vez
      await supabase
        .from('assignment_rules')
        .update({ round_robin_last_index: nextIndex })
        .eq('id', rule.id);
    }

    if (assignedTo) {
      // Atribuir conversa
      await supabase
        .from('whatsapp_conversations')
        .update({ assigned_to: assignedTo })
        .eq('id', conversationId);

      // Registrar no histórico
      await supabase
        .from('conversation_assignments')
        .insert({
          conversation_id: conversationId,
          assigned_to: assignedTo,
          reason: `Auto-atribuição: ${rule.name}`,
        });

      console.log('[auto-assignment] Conversation assigned successfully');
    }
  } catch (error) {
    console.error('[auto-assignment] Error applying auto-assignment:', error);
  }
}

// Update first_response_at and ticket status when agent responds
async function updateFirstResponseIfNeeded(
  supabase: any,
  ticketId: string
): Promise<void> {
  try {
    // Check if ticket already has first_response_at
    const { data: ticket } = await supabase
      .from('tickets')
      .select('first_response_at, status')
      .eq('id', ticketId)
      .single();

    if (!ticket) {
      console.log('[evolution-webhook] Ticket not found for first response update:', ticketId);
      return;
    }

    // Only update if first_response_at is not set
    if (!ticket.first_response_at) {
      const updateData: any = {
        first_response_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Also update status to em_atendimento if it was aberto
      if (ticket.status === 'aberto') {
        updateData.status = 'em_atendimento';
      }

      await supabase
        .from('tickets')
        .update(updateData)
        .eq('id', ticketId);

      console.log('[evolution-webhook] First response recorded for ticket:', ticketId);
    }
  } catch (error) {
    console.error('[evolution-webhook] Error updating first response:', error);
  }
}

// Update ticket updated_at timestamp
async function updateTicketTimestamp(
  supabase: any,
  ticketId: string
): Promise<void> {
  try {
    await supabase
      .from('tickets')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', ticketId);
  } catch (error) {
    console.error('[evolution-webhook] Error updating ticket timestamp:', error);
  }
}

// Check and record automatic feedback from customer messages
async function checkAndRecordFeedback(
  supabase: any,
  conversationId: string,
  messageContent: string,
  isFromMe: boolean
): Promise<boolean> {
  // Only process messages from customer (not from me)
  if (isFromMe) return false;
  
  // Check if message is a number between 1-5
  const trimmed = messageContent.trim();
  if (!/^[1-5]$/.test(trimmed)) return false;
  const nota = parseInt(trimmed, 10);
  
  try {
    // Find ticket closed in the last 24 hours for this conversation
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: ticket } = await supabase
      .from('tickets')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('status', 'finalizado')
      .gte('closed_at', twentyFourHoursAgo)
      .order('closed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!ticket) {
      console.log('[evolution-webhook] No recently closed ticket found for feedback');
      return false;
    }

    // Check if feedback already exists for this ticket
    const { data: existingFeedback } = await supabase
      .from('feedbacks')
      .select('id')
      .eq('ticket_id', ticket.id)
      .maybeSingle();

    if (existingFeedback) {
      console.log('[evolution-webhook] Feedback already exists for ticket:', ticket.id);
      return false;
    }

    // Record feedback
    const { error } = await supabase
      .from('feedbacks')
      .insert({ ticket_id: ticket.id, nota });

    if (error) {
      console.error('[evolution-webhook] Error recording feedback:', error);
      return false;
    }

    console.log(`[evolution-webhook] Feedback recorded: ticket=${ticket.id} nota=${nota}`);
    return true;
  } catch (error) {
    console.error('[evolution-webhook] Error in checkAndRecordFeedback:', error);
    return false;
  }
}

// Create ticket for conversation if sector requires it
// forceNewTicket: when true, creates a new ticket even if one exists (used when customer reopens closed conversation)
async function createTicketIfNeeded(
  supabase: any,
  conversationId: string,
  sectorId: string | null,
  forceNewTicket: boolean = false
): Promise<{ ticketId: string | null; welcomeMessage: string | null; ticketNumber: number | null }> {
  if (!sectorId) {
    return { ticketId: null, welcomeMessage: null, ticketNumber: null };
  }

  try {
    // Check if sector generates tickets
    const { data: sector } = await supabase
      .from('sectors')
      .select('gera_ticket, mensagem_boas_vindas')
      .eq('id', sectorId)
      .single();

    if (!sector?.gera_ticket) {
      console.log('[evolution-webhook] Sector does not generate tickets');
      return { ticketId: null, welcomeMessage: null, ticketNumber: null };
    }

    // Check if there's already an open ticket for this conversation
    const { data: existingTicket } = await supabase
      .from('tickets')
      .select('id, numero')
      .eq('conversation_id', conversationId)
      .neq('status', 'finalizado')
      .maybeSingle();

    if (existingTicket) {
      console.log('[evolution-webhook] Open ticket already exists:', existingTicket.id);
      return { ticketId: existingTicket.id, welcomeMessage: null, ticketNumber: null };
    }
    
    // Only create new ticket if forceNewTicket is true OR no ticket exists at all
    if (!forceNewTicket) {
      // Check if ANY ticket exists (even closed) - if so, don't create new one unless forced
      const { data: anyTicket } = await supabase
        .from('tickets')
        .select('id')
        .eq('conversation_id', conversationId)
        .limit(1)
        .maybeSingle();
      
      if (anyTicket) {
        console.log('[evolution-webhook] Ticket exists but closed, not forcing new ticket');
        return { ticketId: null, welcomeMessage: null, ticketNumber: null };
      }
    }

    console.log('[evolution-webhook] Creating new ticket, forceNew:', forceNewTicket);

    // Create new ticket with SLA defaults
    const { data: newTicket, error } = await supabase
      .from('tickets')
      .insert({
        conversation_id: conversationId,
        sector_id: sectorId,
        status: 'aberto',
        canal: 'whatsapp',
        prioridade: 'media',
        categoria: 'outro',
      })
      .select('id, numero')
      .single();

    if (error) {
      console.error('[evolution-webhook] Error creating ticket:', error);
      return { ticketId: null, welcomeMessage: null, ticketNumber: null };
    }

    console.log('[evolution-webhook] Ticket created:', newTicket.id, 'numero:', newTicket.numero);
    
    // Get the timestamp of the last ticket_closed marker to place this marker right after it
    const { data: lastClosedMarker } = await supabase
      .from('whatsapp_messages')
      .select('timestamp')
      .eq('conversation_id', conversationId)
      .eq('message_type', 'ticket_closed')
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Use timestamp 1ms after the last closed marker (if exists), otherwise use current time
    const markerTimestamp = lastClosedMarker?.timestamp 
      ? new Date(new Date(lastClosedMarker.timestamp).getTime() + 1).toISOString()
      : new Date().toISOString();

    // Insert ticket opened event marker
    const { error: markerError } = await supabase
      .from('whatsapp_messages')
      .insert({
        conversation_id: conversationId,
        message_id: `ticket-opened-${newTicket.id}`,
        remote_jid: 'system',
        content: `TICKET_EVENT:${newTicket.numero}`,
        message_type: 'ticket_opened',
        is_from_me: true,
        status: 'sent',
        timestamp: markerTimestamp,
      });
    
    if (markerError) {
      console.error('[evolution-webhook] Error inserting ticket opened marker:', markerError);
    } else {
      console.log('[evolution-webhook] Ticket opened marker inserted');
    }
    
    // Dispatch webhook for ticket created
    await dispatchWebhook(supabase, 'ticket_created', {
      ticket_id: newTicket.id,
      ticket_number: newTicket.numero,
      conversation_id: conversationId,
      sector_id: sectorId
    });
    
    return { 
      ticketId: newTicket.id, 
      welcomeMessage: sector.mensagem_boas_vindas,
      ticketNumber: newTicket.numero
    };
  } catch (error) {
    console.error('[evolution-webhook] Error in createTicketIfNeeded:', error);
    return { ticketId: null, welcomeMessage: null, ticketNumber: null };
  }
}

// Find or create conversation
// When customer sends message to closed conversation, reopen it and create a NEW ticket
// Only agents can reopen manually and keep the existing ticket
async function findOrCreateConversation(
  supabase: any,
  instanceId: string,
  contactId: string
): Promise<{ conversationId: string | null; isNew: boolean; sectorId: string | null; wasReopened: boolean; shouldCreateNewTicket: boolean }> {
  try {
    // Try to find existing conversation (any status)
    const { data: existingConversation, error: findError } = await supabase
      .from('whatsapp_conversations')
      .select('id, sector_id, status')
      .eq('instance_id', instanceId)
      .eq('contact_id', contactId)
      .maybeSingle();

    if (findError) {
      console.error('[evolution-webhook] Error finding conversation:', findError);
    }

    if (existingConversation) {
      console.log('[evolution-webhook] Conversation found:', existingConversation.id, 'status:', existingConversation.status);
      
      // Check if conversation was previously closed/archived
      const wasClosedOrArchived = existingConversation.status === 'closed' || existingConversation.status === 'archived';
      let wasReopened = false;
      let shouldCreateNewTicket = false;
      
      if (wasClosedOrArchived) {
        console.log('[evolution-webhook] Conversation was closed/archived, creating NEW ticket...');
        
        // Reopen the conversation (set status back to active)
        await supabase
          .from('whatsapp_conversations')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('id', existingConversation.id);
        
        console.log('[evolution-webhook] Conversation status set to active');
        wasReopened = true;
        shouldCreateNewTicket = true; // Any message triggers NEW ticket
        
        // Note: We don't insert "conversation_reopened" marker here
        // That marker is only for MANUAL reopening by agents
        // The "ticket_opened" marker will be inserted by createTicketIfNeeded
      }
      
      return { 
        conversationId: existingConversation.id, 
        isNew: false, 
        sectorId: existingConversation.sector_id,
        wasReopened,
        shouldCreateNewTicket
      };
    }

    // Find default sector for this instance
    const { data: defaultSector } = await supabase
      .from('sectors')
      .select('id')
      .eq('instance_id', instanceId)
      .eq('is_default', true)
      .eq('is_active', true)
      .maybeSingle();

    const sectorId = defaultSector?.id || null;
    console.log('[evolution-webhook] Default sector for new conversation:', sectorId);

    // Create new conversation with sector
    const { data: newConversation, error: createError } = await supabase
      .from('whatsapp_conversations')
      .insert({
        instance_id: instanceId,
        contact_id: contactId,
        status: 'active',
        sector_id: sectorId,
      })
      .select('id')
      .single();

    if (createError) {
      console.error('[evolution-webhook] Error creating conversation:', createError);
      return { conversationId: null, isNew: false, sectorId: null, wasReopened: false, shouldCreateNewTicket: false };
    }

    console.log('[evolution-webhook] Conversation created:', newConversation.id);
    
    // Apply auto-assignment for new conversations (with sector context)
    await applyAutoAssignment(supabase, instanceId, newConversation.id, sectorId);
    
    // Dispatch webhook for new conversation
    await dispatchWebhook(supabase, 'new_conversation', {
      conversation_id: newConversation.id,
      instance_id: instanceId,
      contact_id: contactId,
      sector_id: sectorId
    }, instanceId);
    
    return { conversationId: newConversation.id, isNew: true, sectorId, wasReopened: false, shouldCreateNewTicket: false };
  } catch (error) {
    console.error('[evolution-webhook] Error in findOrCreateConversation:', error);
    return { conversationId: null, isNew: false, sectorId: null, wasReopened: false, shouldCreateNewTicket: false };
  }
}

// Check and trigger automatic sentiment analysis
async function checkAndTriggerAutoSentiment(
  supabase: any,
  conversationId: string,
  supabaseUrl: string
) {
  try {
    // 1. Buscar última análise de sentimento
    const { data: lastAnalysis } = await supabase
      .from('whatsapp_sentiment_analysis')
      .select('created_at')
      .eq('conversation_id', conversationId)
      .maybeSingle();

    // 2. Contar mensagens do cliente desde última análise
    let query = supabase
      .from('whatsapp_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('is_from_me', false);

    // Se há análise anterior, contar apenas mensagens mais recentes
    if (lastAnalysis?.created_at) {
      query = query.gt('timestamp', lastAnalysis.created_at);
    }

    const { count } = await query;

    console.log(`[auto-sentiment] Messages since last analysis: ${count}`);

    // 3. Se atingiu threshold, disparar análise (async, não bloqueia)
    if (count && count >= AUTO_SENTIMENT_THRESHOLD) {
      console.log(`[auto-sentiment] Triggering auto analysis for ${conversationId}`);
      
      // Chamar edge function de análise de sentimento (fire and forget)
      fetch(`${supabaseUrl}/functions/v1/analyze-whatsapp-sentiment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        },
        body: JSON.stringify({ conversationId }),
      }).catch(err => console.error('[auto-sentiment] Error triggering:', err));
    }
  } catch (error) {
    console.error('[auto-sentiment] Error checking sentiment:', error);
  }
}

// Check and trigger automatic categorization
async function checkAndTriggerAutoCategorization(
  supabase: any,
  conversationId: string,
  supabaseUrl: string
) {
  try {
    // 1. Buscar metadata da conversa para ver última categorização
    const { data: conversation } = await supabase
      .from('whatsapp_conversations')
      .select('metadata')
      .eq('id', conversationId)
      .maybeSingle();

    const lastCategorizedAt = conversation?.metadata?.categorized_at;

    // 2. Contar mensagens do cliente desde última categorização
    let query = supabase
      .from('whatsapp_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('is_from_me', false);

    // Se há categorização anterior, contar apenas mensagens mais recentes
    if (lastCategorizedAt) {
      query = query.gt('timestamp', lastCategorizedAt);
    }

    const { count } = await query;

    console.log(`[auto-categorization] Messages since last categorization: ${count}`);

    // 3. Se atingiu threshold, disparar categorização (async, não bloqueia)
    if (count && count >= AUTO_CATEGORIZATION_THRESHOLD) {
      console.log(`[auto-categorization] Triggering auto categorization for ${conversationId}`);
      
      // Chamar edge function de categorização (fire and forget)
      fetch(`${supabaseUrl}/functions/v1/categorize-whatsapp-conversation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        },
        body: JSON.stringify({ conversationId }),
      }).catch(err => console.error('[auto-categorization] Error triggering:', err));
    }
  } catch (error) {
    console.error('[auto-categorization] Error checking categorization:', error);
  }
}

// Process reaction message
async function processReaction(payload: EvolutionWebhookPayload, supabase: any) {
  try {
    const { data } = payload;
    const { key, message } = data;
    const reaction = message.reactionMessage;
    
    if (!reaction?.key?.id) {
      console.log('[evolution-webhook] Invalid reaction data');
      return;
    }
    
    const targetMessageId = reaction.key.id;
    const emoji = reaction.text;
    const reactorJid = key.remoteJid;
    
    console.log('[evolution-webhook] Processing reaction:', emoji || '(removed)', 'on message:', targetMessageId);
    
    // Find the target message to get conversation_id
    const { data: targetMessage } = await supabase
      .from('whatsapp_messages')
      .select('conversation_id')
      .eq('message_id', targetMessageId)
      .maybeSingle();
    
    if (!targetMessage) {
      console.log('[evolution-webhook] Target message not found:', targetMessageId);
      return;
    }
    
    // If emoji is empty, it's a reaction removal
    if (!emoji || emoji === '') {
      const { error } = await supabase
        .from('whatsapp_reactions')
        .delete()
        .eq('message_id', targetMessageId)
        .eq('reactor_jid', reactorJid);
      
      if (error) {
        console.error('[evolution-webhook] Error removing reaction:', error);
      } else {
        console.log('[evolution-webhook] Reaction removed successfully');
      }
      return;
    }
    
    // UPSERT: update if exists, insert if not
    const { error } = await supabase
      .from('whatsapp_reactions')
      .upsert({
        message_id: targetMessageId,
        conversation_id: targetMessage.conversation_id,
        emoji,
        reactor_jid: reactorJid,
        is_from_me: key.fromMe,
      }, { 
        onConflict: 'message_id,reactor_jid',
        ignoreDuplicates: false 
      });
    
    if (error) {
      console.error('[evolution-webhook] Error saving reaction:', error);
    } else {
      console.log('[evolution-webhook] Reaction saved successfully');
    }
  } catch (error) {
    console.error('[evolution-webhook] Error in processReaction:', error);
  }
}

// Process message upsert event
async function processMessageUpsert(payload: EvolutionWebhookPayload, supabase: any) {
  try {
    const { instance, data } = payload;
    const { key, pushName, message, messageTimestamp } = data;

    console.log('[evolution-webhook] Processing message:', key.id);

    // Get instance data - try by instance_name first (self-hosted), then by instance_id_external (Cloud)
    let { data: instanceData } = await supabase
      .from('whatsapp_instances')
      .select('id, instance_name, instance_id_external, provider_type, status')
      .eq('instance_name', instance)
      .maybeSingle();

    // If not found by name, try by instance_id_external (Evolution Cloud sends UUID)
    if (!instanceData) {
      const { data: cloudInstance } = await supabase
        .from('whatsapp_instances')
        .select('id, instance_name, instance_id_external, provider_type, status')
        .eq('instance_id_external', instance)
        .maybeSingle();
      instanceData = cloudInstance;
    }

    if (!instanceData) {
      console.error('[evolution-webhook] Instance not found:', instance);
      return;
    }
    
    // Determine which identifier to use for Evolution API calls
    // Cloud instances use instance_id_external (UUID), self-hosted use instance_name
    const evolutionInstanceId = instanceData.provider_type === 'cloud' && instanceData.instance_id_external
      ? instanceData.instance_id_external
      : instanceData.instance_name;
    
    // Update status to 'connected' if processing a message (instance is clearly connected)
    if (instanceData.status !== 'connected') {
      await supabase
        .from('whatsapp_instances')
        .update({ 
          status: 'connected',
          updated_at: new Date().toISOString()
        })
        .eq('id', instanceData.id);
      console.log(`[evolution-webhook] Updated instance ${instanceData.instance_name} status to connected`);
    }
    
    // Get instance secrets
    const { data: secrets, error: secretsError } = await supabase
      .from('whatsapp_instance_secrets')
      .select('api_url, api_key')
      .eq('instance_id', instanceData.id)
      .single();

    if (secretsError || !secrets) {
      console.error('[evolution-webhook] Failed to fetch instance secrets:', secretsError);
      return;
    }

    // Normalize phone number and extract lid
    const { phone, isGroup, lid } = normalizePhoneNumber(key.remoteJid);
    
    // Also check for participant lid (especially in group messages)
    const participantLid = extractParticipantLid(data);
    const effectiveLid = lid || participantLid;
    
    console.log('[evolution-webhook] Normalized phone:', phone, 'isGroup:', isGroup, 'lid:', effectiveLid);

    // Find or create contact
    // If message is from me, use phone number instead of pushName (which would be the instance owner's name)
    const contactId = await findOrCreateContact(
      supabase,
      instanceData.id,
      phone,
      pushName || phone,
      isGroup,
      key.fromMe,
      secrets.api_url,
      secrets.api_key,
      evolutionInstanceId,
      instanceData.provider_type || 'self_hosted',
      effectiveLid
    );

    if (!contactId) {
      console.error('[evolution-webhook] Failed to create/find contact');
      return;
    }

    // Find or create conversation
    const { conversationId, isNew, sectorId, wasReopened, shouldCreateNewTicket } = await findOrCreateConversation(
      supabase,
      instanceData.id,
      contactId
    );

    if (!conversationId) {
      console.error('[evolution-webhook] Failed to create/find conversation');
      return;
    }
    
    if (wasReopened) {
      console.log('[evolution-webhook] Conversation was reopened, marker and webhook already dispatched');
    }

    // Create ticket if sector requires it (for ANY message that starts a conversation)
    // If conversation was reopened, force new ticket creation
    let currentTicketId: string | null = null;
    if (sectorId) {
      // Force new ticket if conversation was reopened (any message - customer or agent)
      const forceNew = shouldCreateNewTicket;
      const { ticketId, welcomeMessage, ticketNumber } = await createTicketIfNeeded(supabase, conversationId, sectorId, forceNew);
      currentTicketId = ticketId;
      
      // Send welcome message if this is a new ticket (ticketNumber indicates new ticket)
      if (welcomeMessage && ticketId && ticketNumber) {
        // TODO: Send welcome message via Evolution API
        console.log('[evolution-webhook] Would send welcome message:', welcomeMessage);
      }
    }

    // Detect message type and content
    const messageType = getMessageType(message);
    
    // If it's a reaction, process it separately
    if (messageType === 'reaction') {
      await processReaction(payload, supabase);
      return;
    }
    
    const content = getMessageContent(message, messageType);
    console.log('[evolution-webhook] Message type:', messageType, 'Content preview:', content.substring(0, 50));

    // Process media if present
    let mediaUrl: string | null = null;
    let mediaMimetype: string | null = null;

    if (messageType !== 'text') {
      const mediaMessage = message[`${messageType}Message`];
      if (mediaMessage) {
        mediaMimetype = mediaMessage.mimetype || `${messageType}/*`;
        if (mediaMimetype) {
          mediaUrl = await downloadAndUploadMedia(
            secrets.api_url,
            secrets.api_key,
            evolutionInstanceId,
            key,
            supabase,
            mediaMimetype,
            instanceData.provider_type || 'self_hosted'
          );
        }
      }
    }

    // Get quoted message ID if this is a reply
    const quotedMessageId = message.extendedTextMessage?.contextInfo?.stanzaId || null;

    // Create message timestamp
    const timestamp = new Date(messageTimestamp * 1000).toISOString();

    // Save message with sender_lid for tracking
    const { error: messageError } = await supabase
      .from('whatsapp_messages')
      .insert({
        conversation_id: conversationId,
        remote_jid: key.remoteJid,
        message_id: key.id,
        content,
        message_type: messageType,
        media_url: mediaUrl,
        media_mimetype: mediaMimetype,
        is_from_me: key.fromMe || false,
        status: 'sent',
        quoted_message_id: quotedMessageId,
        timestamp,
        ticket_id: currentTicketId,
        sender_lid: effectiveLid,
      });

    if (messageError) {
      console.error('[evolution-webhook] Error saving message:', messageError);
      return;
    }

    console.log('[evolution-webhook] Message saved successfully');

    // SLA tracking: If agent responds to a ticket, track first response
    if (key.fromMe && currentTicketId) {
      await updateFirstResponseIfNeeded(supabase, currentTicketId);
    }

    // Update ticket timestamp when any message is associated with it
    if (currentTicketId) {
      await updateTicketTimestamp(supabase, currentTicketId);
    }

    // Trigger automatic audio transcription for audio messages (fire-and-forget)
    if (messageType === 'audio' && mediaUrl) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      
      // Get the message ID that was just inserted
      const { data: insertedMessage } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .eq('message_id', key.id)
        .eq('conversation_id', conversationId)
        .single();

      if (insertedMessage) {
        console.log('[evolution-webhook] Triggering auto-transcription for message:', insertedMessage.id);
        
        // Fire-and-forget: call transcription without awaiting
        fetch(`${supabaseUrl}/functions/v1/transcribe-audio`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ messageId: insertedMessage.id }),
        })
          .then(res => {
            if (res.ok) {
              console.log('[evolution-webhook] Auto-transcription triggered successfully');
            } else {
              console.error('[evolution-webhook] Failed to trigger auto-transcription:', res.status);
            }
          })
          .catch(err => console.error('[evolution-webhook] Error triggering auto-transcription:', err));
      }
    }

    // Update conversation metadata
    const updateData: any = {
      last_message_at: timestamp,
      last_message_preview: content.substring(0, 100),
    };

    // For group messages, save sender info in metadata
    if (isGroup && !key.fromMe) {
      const existingMetadata = (await supabase
        .from('whatsapp_conversations')
        .select('metadata')
        .eq('id', conversationId)
        .single()).data?.metadata || {};
      
      updateData.metadata = {
        ...existingMetadata,
        last_sender: {
          name: pushName || phone,
          phone: phone,
          lid: effectiveLid,
          // avatar_url will be fetched separately if needed
        }
      };
    }

    // Increment unread count only if message is not from me
    if (!key.fromMe) {
      const { data: currentConv } = await supabase
        .from('whatsapp_conversations')
        .select('unread_count')
        .eq('id', conversationId)
        .single();

      updateData.unread_count = (currentConv?.unread_count || 0) + 1;
    }

    const { error: updateError } = await supabase
      .from('whatsapp_conversations')
      .update(updateData)
      .eq('id', conversationId);

    if (updateError) {
      console.error('[evolution-webhook] Error updating conversation:', updateError);
    } else {
      console.log('[evolution-webhook] Conversation updated successfully');
    }

    // Se mensagem é do cliente (não é minha), verificar análises automáticas e feedback
    if (!key.fromMe) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      checkAndTriggerAutoSentiment(supabase, conversationId, supabaseUrl);
      checkAndTriggerAutoCategorization(supabase, conversationId, supabaseUrl);
      
      // Check if this is a feedback response (1-5)
      checkAndRecordFeedback(supabase, conversationId, content, false);
    }
  } catch (error) {
    console.error('[evolution-webhook] Error in processMessageUpsert:', error);
  }
}

// Process message update event (status changes: sent, delivered, read)
async function processMessageUpdate(payload: EvolutionWebhookPayload, supabase: any) {
  try {
    const { instance, data } = payload;
    
    // Handle different Evolution API payload formats
    // Format 1: { data: { key: { id, remoteJid }, update: { status } } }
    // Format 2: { data: { id, remoteJid, status } }
    // Format 3: { data: [{ key: {...}, update: {...} }] }
    // Format 4: { data: { key: {...}, status: 3 } } (direct status on key level)
    // Format 5: { data: { keyId, messageId, status } } (Evolution Cloud format)
    // Format 6: { data: { key: {...}, ack: 3 } } (ACK format)
    
    let updates: any[] = [];
    
    if (Array.isArray(data)) {
      updates = data;
    } else if (data.key && (data.update || data.status !== undefined || data.ack !== undefined)) {
      // Single update with key at root level
      updates = [{
        ...data,
        ...(data.update || {}),
        key: data.key,
      }];
    } else if (data.update) {
      updates = [data.update];
    } else {
      updates = [data];
    }
    
    console.log('[evolution-webhook] Processing message update(s):', JSON.stringify(updates).substring(0, 1500));

    for (const update of updates) {
      // Extract status from multiple possible fields
      let status = 'sent';
      const rawStatus = update.status ?? update.ack ?? update.state ?? update.type ?? 
                        update.statusText ?? data.status ?? data.ack ?? 
                        update.update?.status ?? update.update?.ack ?? null;

      if (rawStatus !== null) {
        const s = String(rawStatus).toUpperCase();
        // WhatsApp status codes:
        // 0 = ERROR, 1 = PENDING/SENT, 2 = DELIVERED/RECEIVED, 3 = READ, 4 = PLAYED (for audio)
        // Also handle string values
        if (s === '4' || s === 'PLAYED') {
          status = 'read'; // PLAYED is basically read for audio
        } else if (s === '3' || s === 'READ' || s.includes('READ')) {
          status = 'read';
        } else if (s === '2' || s === 'DELIVERED' || s === 'RECEIVED' || 
                   s.includes('DELIVERY') || s.includes('DELIVERED') || 
                   s.includes('DELIVERY_ACK') || s === 'RECEIVED_BY_DEVICE') {
          status = 'delivered';
        } else if (s === '1' || s === 'SENT' || s === 'PENDING' || 
                   s.includes('SERVER_ACK') || s.includes('ACK') || s === 'ON_SERVER') {
          status = 'sent';
        } else if (s === '0' || s === 'ERROR' || s === 'FAILED') {
          status = 'failed';
        }
      }

      // Try to locate message by multiple ID fields
      // keyId is the actual WhatsApp message ID (3EB0...)
      // messageId might be Evolution's internal ID
      const keyId = update.keyId || update.key?.id || data.keyId || data.key?.id || 
                    update.update?.key?.id || update.message?.key?.id;
      const messageId = update.messageId || update.message?.key?.id || update.id || 
                        data.messageId || update.update?.id;
      const remoteJid = update.key?.remoteJid || update.remoteJid || 
                        update.message?.key?.remoteJid || data.key?.remoteJid || 
                        data.remoteJid || update.update?.key?.remoteJid;
      const fromMe = update.key?.fromMe ?? update.fromMe ?? data.key?.fromMe ?? 
                     data.fromMe ?? update.update?.key?.fromMe;
      
      console.log(`[evolution-webhook] Status Update: keyId=${keyId}, messageId=${messageId}, remoteJid=${remoteJid}, fromMe=${fromMe}, status=${status}, rawStatus=${rawStatus}`);

      // Only update status for messages FROM ME (outgoing messages)
      // Status updates for incoming messages don't make sense
      let updated = false;

      // Try keyId first (this is the actual WhatsApp message ID)
      if (keyId) {
        const { data: updatedMsg, error } = await supabase
          .from('whatsapp_messages')
          .update({ status })
          .eq('message_id', keyId)
          .eq('is_from_me', true)  // Only update outgoing messages
          .select('id, message_id, status')
          .maybeSingle();

        if (error) {
          console.error('[evolution-webhook] Error updating message status by keyId:', error);
        } else if (updatedMsg) {
          console.log('[evolution-webhook] Message status updated by keyId:', status, 'keyId:', keyId, 'dbId:', updatedMsg.id);
          updated = true;
        }
      }

      // Try messageId if keyId didn't work
      if (!updated && messageId && messageId !== keyId) {
        const { data: updatedMsg, error } = await supabase
          .from('whatsapp_messages')
          .update({ status })
          .eq('message_id', messageId)
          .eq('is_from_me', true)
          .select('id, message_id, status')
          .maybeSingle();

        if (error) {
          console.error('[evolution-webhook] Error updating message status by messageId:', error);
        } else if (updatedMsg) {
          console.log('[evolution-webhook] Message status updated by messageId:', status, 'messageId:', messageId, 'dbId:', updatedMsg.id);
          updated = true;
        }
      }

      // NOTE: Removed timestamp-based fallback matching as it was causing 
      // status updates to affect multiple messages incorrectly.
      // Status updates MUST have a valid keyId or messageId to work correctly.
      
      if (!updated && !keyId && !messageId) {
        console.log('[evolution-webhook] No message id or timestamp found to match status update');
      } else if (!updated) {
        console.log('[evolution-webhook] Could not find message to update status for keyId:', keyId, 'messageId:', messageId);
      }
    }
  } catch (error) {
    console.error('[evolution-webhook] Error in processMessageUpdate:', error);
  }
}

// Process connection update event
async function processConnectionUpdate(payload: EvolutionWebhookPayload, supabase: any) {
  try {
    const { instance, data } = payload;
    const state = data.state || data.connection;

    console.log('[evolution-webhook] Connection update for:', instance, 'State:', state);

    // Map Evolution API states to our status
    let status = 'disconnected';
    if (state === 'open' || state === 'connected') status = 'connected';
    else if (state === 'connecting') status = 'connecting';
    else if (state === 'close' || state === 'closed') status = 'disconnected';

    // Update instance status
    const { error } = await supabase
      .from('whatsapp_instances')
      .update({ status })
      .eq('instance_name', instance);

    if (error) {
      console.error('[evolution-webhook] Error updating instance status:', error);
    } else {
      console.log('[evolution-webhook] Instance status updated to:', status);
    }
  } catch (error) {
    console.error('[evolution-webhook] Error in processConnectionUpdate:', error);
  }
}

// Process message edit
async function processMessageEdit(payload: EvolutionWebhookPayload, supabase: any) {
  try {
    const { data } = payload;
    const editedMessage = data.message?.editedMessage || data.message?.protocolMessage?.editedMessage;
    
    if (!editedMessage) {
      console.log('[evolution-webhook] No editedMessage found in payload');
      return;
    }
    
    const messageId = editedMessage.key?.id || data.key?.id;
    const newContent = editedMessage.conversation || editedMessage.extendedTextMessage?.text || '';
    
    console.log('[evolution-webhook] Processing message edit:', messageId);
    
    // 1. Fetch current message
    const { data: currentMessage, error: fetchError } = await supabase
      .from('whatsapp_messages')
      .select('id, content, original_content, conversation_id')
      .eq('message_id', messageId)
      .maybeSingle();
    
    if (fetchError || !currentMessage) {
      console.error('[evolution-webhook] Error fetching message or message not found:', fetchError);
      return;
    }
    
    // 2. Save to edit history
    const { error: historyError } = await supabase
      .from('whatsapp_message_edit_history')
      .insert({
        message_id: messageId,
        conversation_id: currentMessage.conversation_id,
        previous_content: currentMessage.content,
      });
    
    if (historyError) {
      console.error('[evolution-webhook] Error saving edit history:', historyError);
    }
    
    // 3. Update message
    const { error: updateError } = await supabase
      .from('whatsapp_messages')
      .update({
        content: newContent,
        edited_at: new Date().toISOString(),
        // Store original content only on first edit
        original_content: currentMessage.original_content || currentMessage.content,
      })
      .eq('message_id', messageId);
    
    if (updateError) {
      console.error('[evolution-webhook] Error updating message:', updateError);
    } else {
      console.log('[evolution-webhook] Message edited successfully:', messageId);
    }
  } catch (error) {
    console.error('[evolution-webhook] Error in processMessageEdit:', error);
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: EvolutionWebhookPayload = await req.json();
    console.log('[evolution-webhook] Event received:', payload.event, 'Instance:', payload.instance);
    console.log('[evolution-webhook] Payload data:', JSON.stringify(payload.data).substring(0, 1000));

    // Route to appropriate handler
    // Handle various event naming conventions from Evolution API
    const eventLower = (payload.event || '').toLowerCase().replace(/_/g, '.');
    
    // Log event for debugging
    console.log('[evolution-webhook] Normalized event:', eventLower);
    
    switch (true) {
      case eventLower === 'messages.upsert':
        // Check if it's an edited message
        if (isEditedMessage(payload.data?.message)) {
          await processMessageEdit(payload, supabase);
        } else {
          await processMessageUpsert(payload, supabase);
        }
        break;
      
      // Handle all status update events
      case eventLower === 'messages.update':
      case eventLower === 'message.update':
      case eventLower === 'messages.ack':
      case eventLower === 'message.ack':
      case eventLower === 'send.message':
      case eventLower === 'message.status':
      case eventLower === 'messages.status':
      case eventLower === 'message.delivery':
      case eventLower === 'messages.delivery':
      case eventLower.includes('ack'):
      case eventLower.includes('delivery'):
      case eventLower.includes('status'):
        console.log('[evolution-webhook] Processing status update event:', eventLower);
        await processMessageUpdate(payload, supabase);
        break;
        
      case eventLower === 'connection.update':
        await processConnectionUpdate(payload, supabase);
        break;
        
      default:
        console.log('[evolution-webhook] Unhandled event type:', payload.event);
    }

    // Always return 200 to prevent webhook reprocessing
    return new Response(
      JSON.stringify({ success: true, event: payload.event }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('[evolution-webhook] Fatal error:', error);
    
    // Still return 200 to prevent reprocessing
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});
