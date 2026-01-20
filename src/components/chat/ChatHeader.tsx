import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Settings, UserPlus, Repeat, Pencil, Building2 } from "lucide-react";
import { SentimentCard } from "./SentimentCard";
import { Tables } from "@/integrations/supabase/types";
import { Link } from "react-router-dom";
import { useConversationTopics } from "@/hooks/whatsapp/useConversationTopics";
import { TopicBadges } from "./topics/TopicBadges";
import { ChatHeaderMenu } from "./ChatHeaderMenu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { useTickets } from '@/hooks/useTickets';
import { QueueIndicator } from "@/components/conversations/QueueIndicator";
import { AssignAgentDialog } from "@/components/conversations/AssignAgentDialog";
import { EditContactModal } from "./EditContactModal";
import { TicketIndicator } from "./TicketIndicator";
import { ConversationModeControls } from "./ConversationModeControls";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useConversationAssignment } from "@/hooks/whatsapp/useConversationAssignment";
import { isContactNameMissing } from "@/utils/contactUtils";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

type Contact = Tables<'whatsapp_contacts'>;
type Sentiment = Tables<'whatsapp_sentiment_analysis'>;

interface ChatHeaderProps {
  contact?: Contact;
  sentiment?: Sentiment | null;
  isAnalyzing: boolean;
  onAnalyze: () => void;
  conversationId?: string;
  conversation?: any;
  onRefresh?: () => void;
}

export const ChatHeader = ({ contact, sentiment, isAnalyzing, onAnalyze, conversationId, conversation, onRefresh }: ChatHeaderProps) => {
  const { data: topicsData } = useConversationTopics(conversationId || null);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isEditContactModalOpen, setIsEditContactModalOpen] = useState(false);
  const [sectorName, setSectorName] = useState<string | null>(null);
  const [sectorGeraTicket, setSectorGeraTicket] = useState<boolean>(false);
  const { user, isAdmin, isSupervisor } = useAuth();
  const { assignConversation } = useConversationAssignment();
  
  // Fetch sector name and gera_ticket
  useEffect(() => {
    if (conversation?.sector_id) {
      supabase
        .from('sectors')
        .select('name, gera_ticket')
        .eq('id', conversation.sector_id)
        .single()
        .then(({ data }) => {
          setSectorName(data?.name || null);
          setSectorGeraTicket(data?.gera_ticket || false);
        });
    } else {
      setSectorName(null);
      setSectorGeraTicket(false);
    }
  }, [conversation?.sector_id]);
  
  if (!contact) return null;
  
  const nameIsMissing = isContactNameMissing(contact.name, contact.phone_number);
  const displayName = nameIsMissing ? 'Sem nome' : contact.name;

  const isInQueue = !conversation?.assigned_to;
  const canAssign = isAdmin || isSupervisor;
  const isAssignedToMe = conversation?.assigned_to === user?.id;
  const canTransfer = canAssign || isAssignedToMe;

  const { ticket, updateTicketStatus } = useTickets(conversationId);

  const handleAssumeFromQueue = () => {
    if (conversationId && user?.id) {
      assignConversation({ conversationId, assignedTo: user.id });
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="p-4 border-b border-border bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10">
            <AvatarImage src={contact.profile_picture_url || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary">
              {getInitials(contact.name)}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className={cn(
                "text-base font-semibold",
                nameIsMissing ? "text-muted-foreground italic" : "text-foreground"
              )}>
                {displayName}
              </h2>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 w-6 p-0" 
                onClick={() => setIsEditContactModalOpen(true)}
                title="Editar contato"
              >
                <Pencil className="h-3 w-3 text-muted-foreground" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {contact.phone_number}
            </p>
            
            {/* Sector badge and topics */}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {sectorName && (
                <Badge variant="secondary" className="text-xs flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {sectorName}
                </Badge>
              )}
              {topicsData?.topics && topicsData.topics.length > 0 && (
                <TopicBadges topics={topicsData.topics} size="sm" showIcon={true} maxTopics={3} />
              )}
            </div>
            
            {conversation && (
              <div className="mt-1">
                <QueueIndicator
                  assignedTo={conversation.assigned_to}
                  assignedToName={conversation.assigned_profile?.full_name}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* AI Mode Controls */}
          {conversationId && (
            <ConversationModeControls 
              conversationId={conversationId}
              conversationMode={conversation?.conversation_mode}
            />
          )}
          
          {/* Ticket Indicator (badge + SLA only) */}
          {conversationId && (
            <TicketIndicator 
              conversationId={conversationId} 
              sectorGeraTicket={sectorGeraTicket} 
            />
          )}

          <SentimentCard sentiment={sentiment} />

          {/* Consolidated actions dropdown: Assumir, Analisar, Iniciar Atendimento */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="text-sm">
                Ações
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {conversation && isInQueue && (
                <DropdownMenuItem onClick={handleAssumeFromQueue}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Assumir
                </DropdownMenuItem>
              )}

              <DropdownMenuItem onClick={onAnalyze} disabled={isAnalyzing}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
                Analisar
              </DropdownMenuItem>

              {conversation && conversationId && (
                <DropdownMenuItem
                  onClick={async () => {
                    if (!ticket || ticket.status !== 'aberto') return;
                    try {
                      updateTicketStatus.mutate({ ticketId: ticket.id, status: 'em_atendimento' });
                    } catch (e) {
                      // noop
                    }
                  }}
                  disabled={!ticket || ticket.status !== 'aberto'}
                >
                  <Building2 className="mr-2 h-4 w-4" />
                  Iniciar Atendimento
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {conversation && (
            <ChatHeaderMenu conversation={conversation} onRefresh={onRefresh} />
          )}

          <Link to="/whatsapp/settings">
            <Button variant="ghost" size="icon">
              <Settings className="h-5 w-5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Assignment Dialog */}
      {conversation && conversationId && (
        <AssignAgentDialog
          open={isAssignDialogOpen}
          onOpenChange={setIsAssignDialogOpen}
          conversationId={conversationId}
          currentAssignee={conversation.assigned_to}
          isTransfer={!isInQueue}
        />
      )}
      
      {/* Edit Contact Modal */}
      <EditContactModal
        open={isEditContactModalOpen}
        onOpenChange={setIsEditContactModalOpen}
        contactId={contact.id}
        contactName={contact.name}
        contactPhone={contact.phone_number}
        contactNotes={contact.notes || ''}
        onSuccess={() => {
          setIsEditContactModalOpen(false);
          if (onRefresh) onRefresh();
        }}
      />
    </div>
  );
};
