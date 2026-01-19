import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[Meeting Reminders] Processing reminders...');

    const now = new Date();
    const in1Hour = new Date(now.getTime() + 60 * 60 * 1000);
    const in25Hours = new Date(now.getTime() + 25 * 60 * 60 * 1000);
    const past30Min = new Date(now.getTime() - 30 * 60 * 1000);

    // 1. Process 24h reminders
    const { data: meetings24h } = await supabase
      .from('meeting_schedules')
      .select(`
        *,
        contact:whatsapp_contacts(*),
        conversation:whatsapp_conversations(instance_id),
        sector:sectors(*)
      `)
      .in('status', ['scheduled', 'confirmed'])
      .eq('reminder_24h_sent', false)
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', in25Hours.toISOString());

    console.log(`[Meeting Reminders] Found ${meetings24h?.length || 0} meetings for 24h reminder`);

    for (const meeting of meetings24h || []) {
      const meetingTime = new Date(meeting.scheduled_at);
      const hoursUntil = (meetingTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      // Only send if between 23-25 hours ahead
      if (hoursUntil <= 25 && hoursUntil >= 23) {
        // Fetch config for custom message
        const { data: config } = await supabase
          .from('scheduling_config')
          .select('reminder_message_24h')
          .eq('sector_id', meeting.sector_id)
          .single();

        const formattedDate = meetingTime.toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: '2-digit',
          month: '2-digit'
        });
        const formattedTime = meetingTime.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit'
        });

        const defaultMessage = `Olá! 📅 Lembrete: você tem uma reunião agendada para amanhã, ${formattedDate} às ${formattedTime}.\n\nConfirma sua presença?`;
        const message = config?.reminder_message_24h || defaultMessage;

        await sendWhatsAppMessage(supabase, meeting, message);

        await supabase
          .from('meeting_schedules')
          .update({ reminder_24h_sent: true })
          .eq('id', meeting.id);

        console.log(`[Meeting Reminders] 24h reminder sent for meeting ${meeting.id}`);
      }
    }

    // 2. Process 1h reminders
    const { data: meetings1h } = await supabase
      .from('meeting_schedules')
      .select(`
        *,
        contact:whatsapp_contacts(*),
        conversation:whatsapp_conversations(instance_id),
        sector:sectors(*)
      `)
      .in('status', ['scheduled', 'confirmed'])
      .eq('reminder_1h_sent', false)
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', in1Hour.toISOString());

    console.log(`[Meeting Reminders] Found ${meetings1h?.length || 0} meetings for 1h reminder`);

    for (const meeting of meetings1h || []) {
      const meetingTime = new Date(meeting.scheduled_at);
      const minutesUntil = (meetingTime.getTime() - now.getTime()) / (1000 * 60);

      // Only send if between 55-65 minutes ahead
      if (minutesUntil <= 65 && minutesUntil >= 55) {
        const { data: config } = await supabase
          .from('scheduling_config')
          .select('reminder_message_1h')
          .eq('sector_id', meeting.sector_id)
          .single();

        const formattedTime = meetingTime.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit'
        });

        const defaultMessage = `⏰ Sua reunião começa em 1 hora, às ${formattedTime}!\n\n${meeting.meeting_link ? `Link: ${meeting.meeting_link}` : 'Aguardamos você!'}`;
        const message = config?.reminder_message_1h || defaultMessage;

        await sendWhatsAppMessage(supabase, meeting, message);

        await supabase
          .from('meeting_schedules')
          .update({ reminder_1h_sent: true })
          .eq('id', meeting.id);

        // Notify assigned agent
        if (meeting.assigned_agent_id) {
          await supabase
            .from('escalation_notifications')
            .insert({
              escalation_id: null, // No escalation, just a meeting reminder
              user_id: meeting.assigned_agent_id,
              notification_type: 'meeting_reminder',
              metadata: {
                meeting_id: meeting.id,
                meeting_title: meeting.title,
                scheduled_at: meeting.scheduled_at,
                contact_name: meeting.contact?.name
              }
            });
        }

        console.log(`[Meeting Reminders] 1h reminder sent for meeting ${meeting.id}`);
      }
    }

    // 3. Check for no-shows
    const { data: potentialNoShows } = await supabase
      .from('meeting_schedules')
      .select('*')
      .in('status', ['scheduled', 'confirmed'])
      .lt('scheduled_at', past30Min.toISOString());

    console.log(`[Meeting Reminders] Found ${potentialNoShows?.length || 0} potential no-shows`);

    for (const meeting of potentialNoShows || []) {
      // Mark as no-show (agent can change this later)
      await supabase
        .from('meeting_schedules')
        .update({ status: 'no_show' })
        .eq('id', meeting.id);

      console.log(`[Meeting Reminders] Marked meeting ${meeting.id} as no-show`);
    }

    // 4. Expire old scheduling intents
    const { data: expiredIntents } = await supabase
      .from('scheduling_intents')
      .update({ status: 'expired' })
      .in('status', ['pending', 'slots_offered', 'awaiting_confirmation'])
      .lt('expires_at', now.toISOString())
      .select();

    console.log(`[Meeting Reminders] Expired ${expiredIntents?.length || 0} scheduling intents`);

    return new Response(JSON.stringify({
      success: true,
      processed: {
        reminders_24h: meetings24h?.length || 0,
        reminders_1h: meetings1h?.length || 0,
        no_shows: potentialNoShows?.length || 0,
        expired_intents: expiredIntents?.length || 0
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Meeting Reminders] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function sendWhatsAppMessage(supabase: any, meeting: any, message: string) {
  if (!meeting.contact?.phone_number || !meeting.conversation?.instance_id) {
    console.log('[Meeting Reminders] Missing contact or instance info');
    return;
  }

  // Fetch instance secrets
  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('id, name')
    .eq('id', meeting.conversation.instance_id)
    .single();

  if (!instance) return;

  const { data: secrets } = await supabase
    .from('whatsapp_instance_secrets')
    .select('api_url, api_key')
    .eq('instance_id', instance.id)
    .single();

  if (!secrets) return;

  const remoteJid = meeting.contact.phone_number.includes('@')
    ? meeting.contact.phone_number
    : `${meeting.contact.phone_number.replace(/\D/g, '')}@s.whatsapp.net`;

  try {
    const response = await fetch(`${secrets.api_url}/message/sendText/${instance.name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': secrets.api_key,
      },
      body: JSON.stringify({
        number: remoteJid,
        text: message,
      }),
    });

    if (response.ok) {
      // Save message to database
      await supabase
        .from('whatsapp_messages')
        .insert({
          conversation_id: meeting.conversation_id,
          message_id: `reminder_${meeting.id}_${Date.now()}`,
          content: message,
          message_type: 'text',
          is_from_me: true,
          is_ai_generated: true,
          status: 'sent',
          timestamp: new Date().toISOString(),
        });
    }
  } catch (error) {
    console.error('[Meeting Reminders] Error sending message:', error);
  }
}
