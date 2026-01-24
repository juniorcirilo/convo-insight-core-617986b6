import { Router, Request, Response } from 'express';
import { db } from '../db';
import { 
  whatsappInstances, 
  whatsappInstanceSecrets,
  whatsappContacts, 
  whatsappConversationNotes, 
  whatsappMessages,
  whatsappSentimentAnalysis,
  whatsappSentimentHistory,
  whatsappConversationSummaries,
  whatsappMacros,
  whatsappReactions
} from '../db/schema/index';
import { authenticate } from '../middleware/auth';
import { eq, and, desc, sql } from 'drizzle-orm';
import { uploadFile } from '../utils/fileUpload';

const router = Router();

// Send WhatsApp message
router.post('/messages/send', authenticate, async (req: Request, res: Response) => {
  try {
    const {
      conversationId,
      content,
      messageType = 'text',
      mediaUrl,
      mediaBase64,
      mediaMimetype,
      fileName,
      quotedMessageId,
      skipAgentPrefix = false,
      templateContext
    } = req.body;

    if (!conversationId || !messageType) {
      return res.status(400).json({ error: 'conversationId and messageType are required' });
    }

    // Get conversation and instance details
    const [conversation] = await db
      .select()
      .from(whatsappConversationNotes)
      .where(eq(whatsappConversationNotes.id, conversationId))
      .limit(1);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const [instance] = await db
      .select()
      .from(whatsappInstances)
      .where(eq(whatsappInstances.id, conversation.instanceId))
      .limit(1);

    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    const [secrets] = await db
      .select()
      .from(whatsappInstanceSecrets)
      .where(eq(whatsappInstanceSecrets.instanceId, instance.id))
      .limit(1);

    if (!secrets) {
      return res.status(404).json({ error: 'Instance secrets not found' });
    }

    // Prepare message content
    let finalContent = content || '';
    
    // Replace template variables if provided
    if (templateContext) {
      finalContent = replaceTemplateVariables(finalContent, templateContext);
    }

    // Add agent prefix if not skipped
    if (!skipAgentPrefix && req.user) {
      const user = req.user;
      const profilesTable = (await import('../db/schema')).profiles;
      const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.id, user.userId));
      if (profile) {
        finalContent = `*${profile.fullName}*: ${finalContent}`;
      }
    }

    // Send message via Evolution API
    const evolutionPayload: any = {
      number: conversation.contactPhone,
      text: finalContent,
    };

    if (messageType !== 'text' && mediaUrl) {
      evolutionPayload.mediaUrl = mediaUrl;
    }

    if (quotedMessageId) {
      evolutionPayload.quoted = { key: { id: quotedMessageId } };
    }

    const authHeader = secrets.providerType === 'cloud' 
      ? { 'Authorization': `Bearer ${secrets.apiKey}` }
      : { 'apikey': secrets.apiKey };

    // Filter undefined values from auth header
    const cleanAuthHeader = Object.fromEntries(
      Object.entries(authHeader).filter(([_, v]) => v !== undefined)
    ) as Record<string, string>;

    const response = await fetch(
      `${secrets.apiUrl}/message/sendText/${instance.instanceName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...cleanAuthHeader,
        },
        body: JSON.stringify(evolutionPayload),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Evolution API error:', errorText);
      return res.status(500).json({ error: 'Failed to send message' });
    }

    const result = await response.json();

    // Save message to database
    const [message] = await db.insert(whatsappMessages).values({
      conversationId,
      content: finalContent,
      isFromMe: true,
      messageType,
      messageId: result.key?.id || crypto.randomUUID(),
      status: 'sent',
      timestamp: new Date(),
      metadata: { evolutionResponse: result },
    }).returning();

    // Update conversation last message
    await db
      .update(whatsappConversationNotes)
      .set({
        lastMessageAt: new Date(),
        lastMessagePreview: finalContent.substring(0, 100),
        unreadCount: 0,
        updatedAt: new Date(),
      })
      .where(eq(whatsappConversationNotes.id, conversationId));

    res.json({ success: true, message, evolutionResponse: result });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Evolution webhook endpoint
router.post('/webhooks/evolution', async (req: Request, res: Response) => {
  try {
    const { event, instance, data } = req.body;

    console.log(`[Webhook] Received event: ${event} from instance: ${instance}`);

    // Get instance from database
    const [instanceRecord] = await db
      .select()
      .from(whatsappInstances)
      .where(eq(whatsappInstances.instanceName, instance))
      .limit(1);

    if (!instanceRecord) {
      console.warn(`Instance not found: ${instance}`);
      return res.json({ received: true, warning: 'Instance not found' });
    }

    // Handle different event types
    switch (event) {
      case 'messages.upsert':
        await handleMessageUpsert(instanceRecord, data);
        break;
      case 'messages.update':
        await handleMessageUpdate(instanceRecord, data);
        break;
      case 'messages.delete':
        await handleMessageDelete(instanceRecord, data);
        break;
      case 'connection.update':
        await handleConnectionUpdate(instanceRecord, data);
        break;
      default:
        console.log(`Unhandled event type: ${event}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Test instance connection
router.post('/instances/:instanceId/test', authenticate, async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.params;

    const [instance] = await db
      .select()
      .from(whatsappInstances)
      .where(eq(whatsappInstances.id, instanceId))
      .limit(1);

    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    const [secrets] = await db
      .select()
      .from(whatsappInstanceSecrets)
      .where(eq(whatsappInstanceSecrets.instanceId, instanceId))
      .limit(1);

    if (!secrets) {
      return res.status(404).json({ error: 'Instance secrets not found' });
    }

    const authHeader = secrets.providerType === 'cloud'
      ? { 'Authorization': `Bearer ${secrets.apiKey}` }
      : { 'apikey': secrets.apiKey };

    // Filter undefined values from auth header
    const cleanAuthHeader2 = Object.fromEntries(
      Object.entries(authHeader).filter(([_, v]) => v !== undefined)
    ) as Record<string, string>;

    const response = await fetch(
      `${secrets.apiUrl}/instance/connectionState/${instance.instanceName}`,
      {
        method: 'GET',
        headers: cleanAuthHeader2,
      }
    );

    if (!response.ok) {
      return res.status(500).json({ success: false, error: 'Failed to check connection' });
    }

    const connectionData = await response.json();

    // Update instance status
    await db
      .update(whatsappInstances)
      .set({
        status: connectionData.state === 'open' ? 'connected' : 'disconnected',
        updatedAt: new Date(),
      })
      .where(eq(whatsappInstances.id, instanceId));

    res.json({ success: true, connectionState: connectionData });
  } catch (error) {
    console.error('Error testing connection:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check instances status
router.get('/instances/check-status', authenticate, async (req: Request, res: Response) => {
  try {
    const instances = await db
      .select()
      .from(whatsappInstances)
      .where(eq(whatsappInstances.isActive, true));

    const statusChecks = await Promise.all(
      instances.map(async (instance) => {
        try {
          const [secrets] = await db
            .select()
            .from(whatsappInstanceSecrets)
            .where(eq(whatsappInstanceSecrets.instanceId, instance.id))
            .limit(1);

          if (!secrets) return { instanceId: instance.id, error: 'No secrets found' };

          const authHeader = secrets.providerType === 'cloud'
            ? { 'Authorization': `Bearer ${secrets.apiKey}` }
            : { 'apikey': secrets.apiKey };

          const response = await fetch(
            `${secrets.apiUrl}/instance/connectionState/${instance.instanceName}`,
            { 
              method: 'GET', 
              headers: Object.fromEntries(
                Object.entries(authHeader).filter(([_, v]) => v !== undefined)
              ) as HeadersInit 
            }
          );

          if (!response.ok) {
            return { instanceId: instance.id, error: 'Failed to check' };
          }

          const data = await response.json();
          
          // Update database
          await db
            .update(whatsappInstances)
            .set({ 
              status: data.state === 'open' ? 'connected' : 'disconnected',
              updatedAt: new Date() 
            })
            .where(eq(whatsappInstances.id, instance.id));

          return {
            instanceId: instance.id,
            instanceName: instance.instanceName,
            status: data.state,
            success: true,
          };
        } catch (error) {
          return { instanceId: instance.id, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      })
    );

    res.json({ statusChecks });
  } catch (error) {
    console.error('Error checking instances:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Edit message
router.put('/messages/:messageId', authenticate, async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const [message] = await db
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.id, messageId))
      .limit(1);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Update message
    const [updated] = await db
      .update(whatsappMessages)
      .set({
        content,
        isEdited: true,
        updatedAt: new Date(),
      })
      .where(eq(whatsappMessages.id, messageId))
      .returning();

    res.json({ success: true, message: updated });
  } catch (error) {
    console.error('Error editing message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Analyze sentiment
router.post('/sentiment/analyze', authenticate, async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.body;

    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    // Get conversation to obtain contactId
    const [conversation] = await db
      .select()
      .from(whatsappConversationNotes)
      .where(eq(whatsappConversationNotes.id, conversationId))
      .limit(1);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const contactId = conversation.contactId;

    // Get last 10 messages from contact
    const messages = await db
      .select()
      .from(whatsappMessages)
      .where(
        and(
          eq(whatsappMessages.conversationId, conversationId),
          eq(whatsappMessages.isFromMe, false)
        )
      )
      .orderBy(desc(whatsappMessages.timestamp))
      .limit(10);

    if (messages.length < 3) {
      return res.json({
        success: false,
        message: 'Mínimo 3 mensagens necessário para análise',
        messagesFound: messages.length,
      });
    }

    // Call AI service for sentiment analysis (placeholder)
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'AI service not configured' });
    }

    const prompt = `Analise o sentimento das seguintes mensagens e retorne um JSON com:
- sentiment: "positive", "neutral" ou "negative"
- confidence: número de 0 a 1
- summary: resumo breve
- reasoning: explicação

Mensagens:
${messages.map((m, i) => `${i + 1}. ${m.content}`).join('\n')}`;

    const aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      return res.status(500).json({ error: 'AI service error' });
    }

    const aiData = await aiResponse.json();
    const analysisText = aiData.choices[0]?.message?.content || '{}';
    const analysis = JSON.parse(analysisText.replace(/```json\n?|\n?```/g, ''));

    // Save analysis
    await db.insert(whatsappSentimentAnalysis).values({
      conversationId,
      contactId,
      sentiment: analysis.sentiment,
      messagesAnalyzed: messages.length,
    });

    // Save history
    await db.insert(whatsappSentimentHistory).values({
      conversationId,
      contactId,
      sentiment: analysis.sentiment,
      messagesAnalyzed: messages.length,
    });

    res.json({ success: true, analysis });
  } catch (error) {
    console.error('Error analyzing sentiment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate conversation summary
router.post('/conversations/:conversationId/summary', authenticate, async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;

    const messages = await db
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.conversationId, conversationId))
      .orderBy(desc(whatsappMessages.timestamp))
      .limit(50);

    if (messages.length === 0) {
      return res.json({ success: false, message: 'No messages found' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'AI service not configured' });
    }

    const prompt = `Resuma a seguinte conversa em português, destacando:
- Assunto principal
- Principais pontos discutidos
- Ações necessárias
- Tom da conversa

Mensagens:
${messages.reverse().map((m) => `${m.isFromMe ? 'Atendente' : 'Cliente'}: ${m.content}`).join('\n')}`;

    const aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
      }),
    });

    if (!aiResponse.ok) {
      return res.status(500).json({ error: 'AI service error' });
    }

    const aiData = await aiResponse.json();
    const summary = aiData.choices[0]?.message?.content || 'Sem resumo disponível';

    // Save summary
    await db.insert(whatsappConversationSummaries).values({
      conversationId: Array.isArray(conversationId) ? conversationId[0] : conversationId,
      summary,
    });

    res.json({ success: true, summary });
  } catch (error) {
    console.error('Error generating summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Categorize conversation
router.post('/conversations/:conversationId/categorize', authenticate, async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { category, subcategory } = req.body;

    if (!category) {
      return res.status(400).json({ error: 'Category is required' });
    }

    await db
      .update(whatsappConversationNotes)
      .set({
        category,
        subcategory,
        updatedAt: new Date(),
      })
      .where(eq(whatsappConversationNotes.id, conversationId));

    res.json({ success: true });
  } catch (error) {
    console.error('Error categorizing conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fix contact names
router.post('/contacts/fix-names', authenticate, async (req: Request, res: Response) => {
  try {
    const contacts = await db
      .select()
      .from(whatsappContacts)
      .where(sql`name LIKE '%@%' OR name = phone_number`);

    let fixed = 0;
    for (const contact of contacts) {
      const cleanName = contact.phoneNumber.replace(/\D/g, '');
      await db
        .update(whatsappContacts)
        .set({ name: cleanName })
        .where(eq(whatsappContacts.id, contact.id));
      fixed++;
    }

    res.json({ success: true, fixed });
  } catch (error) {
    console.error('Error fixing names:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sync contact profiles
router.post('/contacts/sync-profiles', authenticate, async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.body;

    // Implementation would fetch contacts from Evolution API and sync
    res.json({ success: true, message: 'Sync initiated' });
  } catch (error) {
    console.error('Error syncing contacts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper functions
function replaceTemplateVariables(content: string, context: any): string {
  let result = content;
  
  if (context.clienteNome) result = result.replace(/\{\{clienteNome\}\}/g, context.clienteNome);
  if (context.clienteTelefone) result = result.replace(/\{\{clienteTelefone\}\}/g, context.clienteTelefone);
  if (context.atendenteNome) result = result.replace(/\{\{atendenteNome\}\}/g, context.atendenteNome);
  if (context.ticketNumero) result = result.replace(/\{\{ticketNumero\}\}/g, String(context.ticketNumero));
  if (context.setorNome) result = result.replace(/\{\{setorNome\}\}/g, context.setorNome);
  
  const now = new Date();
  result = result.replace(/\{\{dataAtual\}\}/g, now.toLocaleDateString('pt-BR'));
  result = result.replace(/\{\{horaAtual\}\}/g, now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  
  return result;
}

async function handleMessageUpsert(instance: any, data: any) {
  // Implementation for message upsert webhook
  console.log('Handling message upsert:', data);
}

async function handleMessageUpdate(instance: any, data: any) {
  // Implementation for message update webhook
  console.log('Handling message update:', data);
}

async function handleMessageDelete(instance: any, data: any) {
  // Implementation for message delete webhook
  console.log('Handling message delete:', data);
}

async function handleConnectionUpdate(instance: any, data: any) {
  // Implementation for connection update webhook
  console.log('Handling connection update:', data);
  await db
    .update(whatsappInstances)
    .set({
      status: data.state === 'open' ? 'connected' : 'disconnected',
      updatedAt: new Date(),
    })
    .where(eq(whatsappInstances.id, instance.id));
}

export default router;
