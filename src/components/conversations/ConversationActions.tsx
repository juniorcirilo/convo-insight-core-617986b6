import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Mail, Archive } from 'lucide-react';
import { useWhatsAppActions } from '@/hooks/whatsapp/useWhatsAppActions';

interface ConversationActionsProps {
  conversation: any;
  children: React.ReactNode; // trigger element (button)
}

export function ConversationActions({ conversation, children }: ConversationActionsProps) {
  const { markAsUnread, archiveConversation, isMarkingUnread, isArchiving } = useWhatsAppActions();

  const handleMarkUnread = (e: React.MouseEvent) => {
    e.stopPropagation();
    markAsUnread(conversation.id);
  };

  const handleArchive = (e: React.MouseEvent) => {
    e.stopPropagation();
    archiveConversation(conversation.id);
  };

  const isRead = (conversation.unread_count || 0) === 0;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>

      <ContextMenuContent className="w-48 bg-background">
        {isRead && (
          <ContextMenuItem onClick={handleMarkUnread} disabled={isMarkingUnread}>
            <Mail className="mr-2 h-4 w-4" />
            Marcar como não lida
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={handleArchive} disabled={isArchiving}>
          <Archive className="mr-2 h-4 w-4" />
          Arquivar
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
