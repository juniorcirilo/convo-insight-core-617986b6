import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SchedulingConfig {
  id: string;
  sector_id: string;
  is_enabled: boolean;
  allow_ai_scheduling: boolean;
  default_duration_minutes: number;
  slot_interval_minutes: number;
  min_advance_hours: number;
  max_advance_days: number;
  allowed_meeting_types: string[];
  default_meeting_type: string;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  send_reminder_24h: boolean;
  send_reminder_1h: boolean;
  reminder_message_24h: string | null;
  reminder_message_1h: string | null;
  confirmation_message: string | null;
  require_confirmation: boolean;
}

interface DetectedIntent {
  has_scheduling_intent: boolean;
  intent_type: 'new_meeting' | 'reschedule' | 'cancel' | 'check_availability' | 'confirm_selection' | null;
  confidence: number;
  extracted_info: {
    preferred_dates?: string[];
    time_preference?: 'morning' | 'afternoon' | 'evening' | 'specific';
    specific_times?: string[];
    meeting_purpose?: string;
    duration_hint?: number;
    meeting_type_hint?: string;
    selected_slot_index?: number;
  };
  requires_slot_offer: boolean;
  reasoning: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');

    if (!GROQ_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI not configured (GROQ_API_KEY missing)' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { conversationId, action, message, intentData, slotIndex, meetingId, reason } = await req.json();

    console.log(`[Schedule Meeting] Action: ${action}, Conversation: ${conversationId}`);

    // Fetch conversation and sector
    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select(`
        *,
        contact:whatsapp_contacts(*),
        sector:sectors(*)
      `)
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch scheduling config
    const { data: config } = await supabase
      .from('scheduling_config')
      .select('*')
      .eq('sector_id', conversation.sector_id)
      .single();

    if (!config?.is_enabled) {
      return new Response(JSON.stringify({ 
        success: false, 
        reason: 'scheduling_disabled' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const schedulingConfig = config as SchedulingConfig;

    switch (action) {
      case 'detect':
        return await detectSchedulingIntent(supabase, lovableApiKey, conversationId, message);

      case 'offer_slots':
        return await offerAvailableSlots(supabase, conversation, schedulingConfig, intentData);

      case 'confirm':
        return await confirmMeeting(supabase, conversation, schedulingConfig, slotIndex);

      case 'cancel':
        return await cancelMeeting(supabase, meetingId, reason);

      case 'reschedule':
        return await rescheduleMeeting(supabase, meetingId);

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

  } catch (error) {
    console.error('[Schedule Meeting] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function detectSchedulingIntent(
  supabase: any,
  apiKey: string,
  conversationId: string,
  message: string
): Promise<Response> {
  console.log('[Schedule Meeting] Detecting intent for:', message.substring(0, 100));

  const systemPrompt = `Você é um especialista em detectar intenções de agendamento em mensagens de clientes.

Analise a mensagem e retorne APENAS um JSON válido (sem markdown, sem \`\`\`):
{
  "has_scheduling_intent": true/false,
  "intent_type": "new_meeting" | "reschedule" | "cancel" | "check_availability" | "confirm_selection" | null,
  "confidence": 0.0-1.0,
  "extracted_info": {
    "preferred_dates": ["2026-01-20"],
    "time_preference": "morning" | "afternoon" | "evening" | "specific" | null,
    "specific_times": ["10:00"],
    "meeting_purpose": "string",
    "duration_hint": 30,
    "meeting_type_hint": "video" | "call" | "presencial" | null,
    "selected_slot_index": null
  },
  "requires_slot_offer": true/false,
  "reasoning": "explicação breve"
}

EXEMPLOS DE DETECÇÃO:
- "Quero agendar uma reunião" → has_scheduling_intent: true, intent_type: "new_meeting"
- "Pode ser amanhã às 10h" → has_scheduling_intent: true, intent_type: "new_meeting", specific_times: ["10:00"]
- "Preciso remarcar" → intent_type: "reschedule"
- "Cancela minha reunião" → intent_type: "cancel"
- "Vocês tem horário disponível?" → intent_type: "check_availability"
- "A segunda opção" / "opção 2" / "o segundo horário" → intent_type: "confirm_selection", selected_slot_index: 1
- "Pode ser o primeiro" → intent_type: "confirm_selection", selected_slot_index: 0

Se o cliente selecionar uma opção numérica (1, 2, 3...) após oferta de horários, é confirm_selection.`;

  // Use GROQ to detect scheduling intent
  const groqResp = await fetch('https://api.groq.ai/v1/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'groq-1',
      prompt: `${systemPrompt}\n\n${message}`,
      max_tokens: 500,
      temperature: 0.1,
      n: 1,
    }),
  });

  if (!groqResp.ok) {
    const errorText = await groqResp.text();
    console.error('[Schedule Meeting] GROQ error:', errorText);
    return new Response(JSON.stringify({ error: 'AI detection failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const content = await groqResp.text();
  
  try {
    // Clean up potential markdown formatting
    const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
    const detected: DetectedIntent = JSON.parse(cleanContent);

    // Save intent if detected
    if (detected.has_scheduling_intent && detected.confidence > 0.5) {
      await supabase
        .from('scheduling_intents')
        .insert({
          conversation_id: conversationId,
          intent_type: detected.intent_type,
          confidence: detected.confidence,
          preferred_dates: detected.extracted_info.preferred_dates ? 
            JSON.stringify(detected.extracted_info.preferred_dates.map(d => ({ 
              date: d, 
              time_preference: detected.extracted_info.time_preference 
            }))) : null,
          meeting_purpose: detected.extracted_info.meeting_purpose,
          duration_requested: detected.extracted_info.duration_hint,
          status: 'pending',
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min expiry
        });
    }

    console.log('[Schedule Meeting] Detected:', detected);

    return new Response(JSON.stringify(detected), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (parseError) {
    console.error('[Schedule Meeting] Parse error:', parseError, content);
    return new Response(JSON.stringify({
      has_scheduling_intent: false,
      confidence: 0,
      error: 'Failed to parse AI response'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

async function offerAvailableSlots(
  supabase: any,
  conversation: any,
  config: SchedulingConfig,
  intentData: DetectedIntent
): Promise<Response> {
  console.log('[Schedule Meeting] Offering slots for sector:', conversation.sector_id);

  const now = new Date();
  const minDate = new Date(now.getTime() + config.min_advance_hours * 60 * 60 * 1000);
  const maxDate = new Date(now.getTime() + config.max_advance_days * 24 * 60 * 60 * 1000);

  // Fetch availability slots for sector
  const { data: availabilitySlots, error: slotsError } = await supabase
    .from('availability_slots')
    .select('*')
    .or(`sector_id.eq.${conversation.sector_id},agent_id.in.(select user_id from user_sectors where sector_id = '${conversation.sector_id}')`)
    .eq('is_active', true)
    .eq('slot_type', 'available');

  if (slotsError) {
    console.error('[Schedule Meeting] Error fetching slots:', slotsError);
  }

  // Fetch existing meetings to exclude
  const { data: existingMeetings } = await supabase
    .from('meeting_schedules')
    .select('scheduled_at, duration_minutes, assigned_agent_id')
    .eq('sector_id', conversation.sector_id)
    .in('status', ['scheduled', 'confirmed'])
    .gte('scheduled_at', minDate.toISOString())
    .lte('scheduled_at', maxDate.toISOString());

  // Generate available slots
  const slots: { datetime: string; formatted: string; agent_id: string | null }[] = [];
  const daysOfWeek = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  
  // If we have availability slots configured, use them
  if (availabilitySlots && availabilitySlots.length > 0) {
    let currentDate = new Date(minDate);
    
    while (currentDate <= maxDate && slots.length < 5) {
      const dayOfWeek = currentDate.getDay();
      
      const daySlots = availabilitySlots.filter((slot: any) => 
        slot.day_of_week === dayOfWeek || 
        (slot.specific_date && new Date(slot.specific_date).toDateString() === currentDate.toDateString())
      );

      for (const slot of daySlots) {
        const [startHour, startMinute] = slot.start_time.split(':').map(Number);
        const slotDateTime = new Date(currentDate);
        slotDateTime.setHours(startHour, startMinute, 0, 0);

        if (slotDateTime > minDate) {
          // Check if slot is taken
          const isTaken = existingMeetings?.some((meeting: any) => {
            const meetingStart = new Date(meeting.scheduled_at);
            const meetingEnd = new Date(meetingStart.getTime() + (meeting.duration_minutes || 30) * 60 * 1000);
            const slotEnd = new Date(slotDateTime.getTime() + config.default_duration_minutes * 60 * 1000);
            return slotDateTime < meetingEnd && slotEnd > meetingStart;
          });

          if (!isTaken && slots.length < 5) {
            const day = daysOfWeek[slotDateTime.getDay()];
            const date = slotDateTime.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            const time = slotDateTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            
            slots.push({
              datetime: slotDateTime.toISOString(),
              formatted: `${day}, ${date} às ${time}`,
              agent_id: slot.agent_id
            });
          }
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
  } else {
    // Default: offer slots during business hours
    let currentDate = new Date(minDate);
    const businessHours = [9, 10, 11, 14, 15, 16, 17];

    while (currentDate <= maxDate && slots.length < 5) {
      if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) { // Skip weekends
        for (const hour of businessHours) {
          if (slots.length >= 5) break;
          
          const slotDateTime = new Date(currentDate);
          slotDateTime.setHours(hour, 0, 0, 0);

          if (slotDateTime > minDate) {
            const isTaken = existingMeetings?.some((meeting: any) => {
              const meetingStart = new Date(meeting.scheduled_at);
              return Math.abs(slotDateTime.getTime() - meetingStart.getTime()) < config.default_duration_minutes * 60 * 1000;
            });

            if (!isTaken) {
              const day = daysOfWeek[slotDateTime.getDay()];
              const date = slotDateTime.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
              const time = slotDateTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
              
              slots.push({
                datetime: slotDateTime.toISOString(),
                formatted: `${day}, ${date} às ${time}`,
                agent_id: null
              });
            }
          }
        }
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  if (slots.length === 0) {
    return new Response(JSON.stringify({
      success: false,
      no_slots: true,
      formatted_message: 'Infelizmente não temos horários disponíveis nos próximos dias. Por favor, entre em contato novamente em breve ou fale com um atendente.'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Save offered slots to latest intent
  await supabase
    .from('scheduling_intents')
    .update({
      offered_slots: slots,
      status: 'slots_offered'
    })
    .eq('conversation_id', conversation.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1);

  // Format message
  const slotsList = slots.map((slot, i) => `${i + 1}) ${slot.formatted}`).join('\n');
  const formattedMessage = `Ótimo! Temos os seguintes horários disponíveis:\n\n${slotsList}\n\nQual opção você prefere? Responda com o número.`;

  return new Response(JSON.stringify({
    success: true,
    slots,
    formatted_message: formattedMessage
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function confirmMeeting(
  supabase: any,
  conversation: any,
  config: SchedulingConfig,
  slotIndex: number
): Promise<Response> {
  console.log('[Schedule Meeting] Confirming slot index:', slotIndex);

  // Get the latest intent with offered slots
  const { data: intent } = await supabase
    .from('scheduling_intents')
    .select('*')
    .eq('conversation_id', conversation.id)
    .eq('status', 'slots_offered')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!intent || !intent.offered_slots) {
    return new Response(JSON.stringify({
      success: false,
      error: 'No pending slot offer found'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const slots = intent.offered_slots;
  if (slotIndex < 0 || slotIndex >= slots.length) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Invalid slot selection'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const selectedSlot = slots[slotIndex];
  const contactName = conversation.contact?.name || 'Cliente';

  // Create meeting
  const { data: meeting, error: meetingError } = await supabase
    .from('meeting_schedules')
    .insert({
      conversation_id: conversation.id,
      contact_id: conversation.contact_id,
      sector_id: conversation.sector_id,
      assigned_agent_id: selectedSlot.agent_id || conversation.assigned_to,
      title: `Reunião com ${contactName}`,
      description: intent.meeting_purpose,
      scheduled_at: selectedSlot.datetime,
      duration_minutes: config.default_duration_minutes,
      meeting_type: config.default_meeting_type,
      status: config.require_confirmation ? 'scheduled' : 'confirmed',
      created_by: 'ai',
    })
    .select()
    .single();

  if (meetingError) {
    console.error('[Schedule Meeting] Error creating meeting:', meetingError);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to create meeting'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Update intent
  await supabase
    .from('scheduling_intents')
    .update({
      status: 'confirmed',
      selected_slot_index: slotIndex,
      resulting_meeting_id: meeting.id
    })
    .eq('id', intent.id);

  // Update lead if exists
  if (conversation.lead_id) {
    await supabase
      .from('leads')
      .update({ status: 'qualificado' })
      .eq('id', conversation.lead_id);

    await supabase
      .from('lead_status_history')
      .insert({
        lead_id: conversation.lead_id,
        old_status: null,
        new_status: 'qualificado',
        changed_by: null,
        notes: `Reunião agendada para ${selectedSlot.formatted}`
      });
  }

  // Format confirmation message
  const meetingTypeLabels: Record<string, string> = {
    'call': 'ligação',
    'video': 'videochamada',
    'in_person': 'presencial',
    'whatsapp': 'WhatsApp'
  };

  const typeLabel = meetingTypeLabels[config.default_meeting_type] || 'reunião';
  
  let confirmationMessage = config.confirmation_message || 
    `Perfeito! Sua ${typeLabel} está agendada para ${selectedSlot.formatted}. Duração estimada: ${config.default_duration_minutes} minutos.`;
  
  if (config.send_reminder_24h || config.send_reminder_1h) {
    confirmationMessage += '\n\nVocê receberá um lembrete antes do horário marcado.';
  }

  console.log('[Schedule Meeting] Meeting created:', meeting.id);

  return new Response(JSON.stringify({
    success: true,
    meeting,
    formatted_message: confirmationMessage
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function cancelMeeting(supabase: any, meetingId: string, reason?: string): Promise<Response> {
  console.log('[Schedule Meeting] Cancelling meeting:', meetingId);

  const { error } = await supabase
    .from('meeting_schedules')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason
    })
    .eq('id', meetingId);

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    success: true,
    formatted_message: 'Sua reunião foi cancelada. Se precisar reagendar, é só me avisar!'
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function rescheduleMeeting(supabase: any, meetingId: string): Promise<Response> {
  console.log('[Schedule Meeting] Marking for reschedule:', meetingId);

  const { data: meeting } = await supabase
    .from('meeting_schedules')
    .update({ status: 'rescheduled' })
    .eq('id', meetingId)
    .select()
    .single();

  return new Response(JSON.stringify({
    success: true,
    meeting,
    formatted_message: 'Vamos remarcar sua reunião. Qual novo horário seria melhor para você?',
    requires_new_slots: true
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
