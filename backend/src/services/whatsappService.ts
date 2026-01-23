import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { 
  whatsappMessages, 
  whatsappConversations,
  whatsappInstances,
  whatsappContacts
} from '../db/schema/whatsapp.js';
import axios from 'axios';

interface SendMessageData {
  conversationId: string;
  content?: string;
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document';
  mediaUrl?: string;
  mediaBase64?: string;
  mediaMimetype?: string;
  fileName?: string;
  quotedMessageId?: string;
  isSupervisorMessage?: boolean;
  supervisorId?: string;
  skipChat?: boolean;
  skipAgentPrefix?: boolean;
  templateContext?: {
    clienteNome?: string;
    clienteTelefone?: string;
    atendenteNome?: string;
    ticketNumero?: number | string;
    setorNome?: string;
  };
}

// Helper function to replace template variables
function replaceTemplateVariables(
  content: string,
  context?: SendMessageData['templateContext']
): string {
  if (!context) return content;

  let result = content;

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

export const whatsappService = {
  async sendMessage(data: SendMessageData) {
    // 1. Get conversation with instance details
    const [conversation] = await db
      .select({
        id: whatsappConversations.id,
        contact_phone: whatsappConversations.contact_phone,
        instance_id: whatsappConversations.instance_id,
        instance: whatsappInstances,
      })
      .from(whatsappConversations)
      .leftJoin(
        whatsappInstances,
        eq(whatsappConversations.instance_id, whatsappInstances.id)
      )
      .where(eq(whatsappConversations.id, data.conversationId))
      .limit(1);

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    if (!conversation.instance) {
      throw new Error('WhatsApp instance not found');
    }

    // 2. Replace template variables in content
    const processedContent = data.content 
      ? replaceTemplateVariables(data.content, data.templateContext)
      : data.content;

    // 3. Prepare Evolution API request
    const evolutionApiUrl = conversation.instance.api_url;
    const apiKey = conversation.instance.api_key;

    let evolutionResponse;

    try {
      if (data.messageType === 'text') {
        evolutionResponse = await axios.post(
          `${evolutionApiUrl}/message/sendText/${conversation.instance_id}`,
          {
            number: conversation.contact_phone,
            text: processedContent,
            ...(data.quotedMessageId && { quoted: { key: { id: data.quotedMessageId } } }),
          },
          {
            headers: { apikey: apiKey },
          }
        );
      } else if (data.messageType === 'image') {
        evolutionResponse = await axios.post(
          `${evolutionApiUrl}/message/sendMedia/${conversation.instance_id}`,
          {
            number: conversation.contact_phone,
            mediatype: 'image',
            media: data.mediaUrl || data.mediaBase64,
            caption: processedContent,
            mimetype: data.mediaMimetype || 'image/jpeg',
          },
          {
            headers: { apikey: apiKey },
          }
        );
      } else {
        // Handle other media types (audio, video, document)
        evolutionResponse = await axios.post(
          `${evolutionApiUrl}/message/sendMedia/${conversation.instance_id}`,
          {
            number: conversation.contact_phone,
            mediatype: data.messageType,
            media: data.mediaUrl || data.mediaBase64,
            caption: processedContent,
            fileName: data.fileName,
            mimetype: data.mediaMimetype,
          },
          {
            headers: { apikey: apiKey },
          }
        );
      }
    } catch (error: any) {
      console.error('Evolution API error:', error.response?.data || error.message);
      throw new Error(`Failed to send message via Evolution API: ${error.message}`);
    }

    // 4. Store message in database (unless skipChat is true)
    if (!data.skipChat) {
      const [message] = await db
        .insert(whatsappMessages)
        .values({
          conversation_id: data.conversationId,
          content: processedContent,
          message_type: data.messageType,
          is_from_me: true,
          external_id: evolutionResponse.data.key?.id,
          media_url: data.mediaUrl,
          media_mimetype: data.mediaMimetype,
          file_name: data.fileName,
          quoted_message_id: data.quotedMessageId,
          status: 'sent',
          timestamp: new Date(),
        })
        .returning();

      // 5. Update conversation metadata
      await db
        .update(whatsappConversations)
        .set({
          last_message_at: new Date(),
          last_message: processedContent || `[${data.messageType}]`,
          unread_count: 0,
        })
        .where(eq(whatsappConversations.id, data.conversationId));

      return { message, evolutionResponse: evolutionResponse.data };
    }

    return { evolutionResponse: evolutionResponse.data };
  },

  async getConversation(conversationId: string) {
    const [conversation] = await db
      .select({
        id: whatsappConversations.id,
        contact_phone: whatsappConversations.contact_phone,
        contact_name: whatsappConversations.contact_name,
        last_message: whatsappConversations.last_message,
        last_message_at: whatsappConversations.last_message_at,
        unread_count: whatsappConversations.unread_count,
        instance: whatsappInstances,
      })
      .from(whatsappConversations)
      .leftJoin(
        whatsappInstances,
        eq(whatsappConversations.instance_id, whatsappInstances.id)
      )
      .where(eq(whatsappConversations.id, conversationId))
      .limit(1);

    return conversation;
  },

  async getMessages(conversationId: string, limit: number = 50, offset: number = 0) {
    const messages = await db
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.conversation_id, conversationId))
      .orderBy(whatsappMessages.timestamp)
      .limit(limit)
      .offset(offset);

    return messages;
  },

  async updateMessageStatus(messageId: string, status: string) {
    const [message] = await db
      .update(whatsappMessages)
      .set({ status, updated_at: new Date() })
      .where(eq(whatsappMessages.id, messageId))
      .returning();

    return message;
  },
};
