import { useState, useEffect } from "react";
import { useWhatsAppMessages, useWhatsAppSend, useWhatsAppSentiment } from "@/hooks/whatsapp";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChatHeader } from "./ChatHeader";
import { MessagesContainer } from "./MessagesContainer";
import { MessageInputContainer, MediaSendParams } from "./input";
import { MessageCircle } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";
import { useConversationLead } from "@/hooks/sales/useConversationLead";

type Message = Tables<'whatsapp_messages'>;

interface ChatAreaProps {
  conversationId: string | null;
}

export const ChatArea = ({ conversationId }: ChatAreaProps) => {
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const { messages, isLoading: messagesLoading } = useWhatsAppMessages(conversationId);
  const { sentiment, isAnalyzing, analyze } = useWhatsAppSentiment(conversationId);
  const sendMutation = useWhatsAppSend();
  const queryClient = useQueryClient();
  const { lead } = useConversationLead(conversationId);

  // Real-time subscription for the active conversation
  useEffect(() => {
    if (!conversationId) return;

    let conversationInvalidateTimeout: NodeJS.Timeout;

    const channel = supabase
      .channel(`active-conv-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_conversations',
          filter: `id=eq.${conversationId}`,
        },
        () => {
          clearTimeout(conversationInvalidateTimeout);
          conversationInvalidateTimeout = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
            queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
          }, 100);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(conversationInvalidateTimeout);
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  // Fetch conversation details including contact
  const { data: conversation } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: async () => {
      if (!conversationId) return null;
      
      const { data, error } = await supabase
        .from('whatsapp_conversations')
        .select(`
          *,
          contact:whatsapp_contacts(*)
        `)
        .eq('id', conversationId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!conversationId,
  });

  const handleRefresh = () => {
    if (!conversationId) return;
    queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
  };

  const handleSendText = (content: string, quotedMessageId?: string) => {
    if (!conversationId || !content.trim()) return;
    
    sendMutation.mutate({
      conversationId,
      content,
      messageType: 'text',
      quotedMessageId,
    });
    setReplyingTo(null);
  };

  const handleReply = (message: Message) => {
    setReplyingTo(message);
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  const handleSendMedia = (params: MediaSendParams) => {
    if (!conversationId) return;
    
    sendMutation.mutate({
      conversationId,
      ...params,
    });
  };

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/20">
        <div className="text-center space-y-3">
          <MessageCircle className="w-24 h-24 mx-auto text-muted-foreground/40" />
          <h3 className="text-lg font-semibold text-foreground">
            Selecione uma conversa
          </h3>
          <p className="text-sm text-muted-foreground">
            Escolha uma conversa na lista para começar
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen">
      <ChatHeader
        contact={conversation?.contact}
        sentiment={sentiment}
        isAnalyzing={isAnalyzing}
        onAnalyze={analyze}
        conversationId={conversationId}
        conversation={conversation}
        onRefresh={handleRefresh}
      />
      
      <MessagesContainer 
        messages={messages} 
        isLoading={messagesLoading}
        conversationId={conversationId}
        onReplyMessage={handleReply}
      />
      
      <MessageInputContainer
        conversationId={conversationId}
        replyingTo={replyingTo}
        leadId={lead?.id}
        sectorId={conversation?.sector_id ?? undefined}
        onSendText={handleSendText}
        onSendMedia={handleSendMedia}
        onCancelReply={handleCancelReply}
      />
    </div>
  );
};
