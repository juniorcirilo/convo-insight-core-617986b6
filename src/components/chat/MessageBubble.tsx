import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { Check, CheckCheck, Clock, Reply, Pencil, User, Eye, UserCog, Loader2, Bot } from "lucide-react";
import { AIFeedbackButton } from "@/components/ai-agent";
import { cn } from "@/lib/utils";
import { QuotedMessagePreview } from "./QuotedMessagePreview";
import { ImageViewerModal } from "./ImageViewerModal";
import { MessageReactionButton } from "./MessageReactionButton";
import { useMessageReaction } from "@/hooks/whatsapp/useMessageReaction";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EditHistoryPopover } from "./EditHistoryPopover";
import { EditMessageModal } from "./EditMessageModal";
import { useEditMessage } from "@/hooks/whatsapp/useEditMessage";
import { useMediaSignedUrl } from "@/hooks/whatsapp/useMediaSignedUrl";

type Message = Tables<'whatsapp_messages'>;
type Reaction = Tables<'whatsapp_reactions'>;

interface MessageBubbleProps {
  message: Message;
  reactions?: Reaction[];
  onReply?: (message: Message) => void;
  isGroupChat?: boolean;
  senderName?: string;
}

export const MessageBubble = ({ message, reactions = [], onReply, isGroupChat = false, senderName }: MessageBubbleProps) => {
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const isFromMe = message.is_from_me;
  const time = format(new Date(message.timestamp), 'HH:mm');
  const { sendReaction } = useMessageReaction();
  const editMessage = useEditMessage();

  // Get signed URL for media if needed
  const { signedUrl: mediaUrl, isLoading: isMediaLoading } = useMediaSignedUrl(
    message.media_url,
    message.conversation_id
  );

  // Check if message can be edited (within 15 minutes and text only)
  const canEdit = isFromMe && 
    message.message_type === 'text' && 
    (Date.now() - new Date(message.timestamp).getTime()) < 15 * 60 * 1000;

  const handleReact = (emoji: string) => {
    sendReaction.mutate({
      messageId: message.message_id,
      conversationId: message.conversation_id,
      emoji,
      reactorJid: message.remote_jid,
      isFromMe: true,
    });
  };

  const handleEditSave = (newContent: string) => {
    editMessage.mutate({
      messageId: message.message_id,
      conversationId: message.conversation_id,
      newContent,
    }, {
      onSuccess: () => {
        setIsEditModalOpen(false);
      },
    });
  };

  const getStatusIcon = () => {
    if (!isFromMe) return null;
    
    switch (message.status) {
      case 'sending':
        return <Clock className="w-4 h-4 text-primary-foreground/60" />;
      case 'sent':
        return <Check className="w-4 h-4 text-primary-foreground/70" />;
      case 'delivered':
        return <CheckCheck className="w-4 h-4 text-primary-foreground/80" />;
      case 'read':
        return <CheckCheck className="w-4 h-4 text-sky-400" />;
      default:
        return <Check className="w-4 h-4 text-primary-foreground/70" />;
    }
  };

  const renderReactions = () => {
    if (!reactions || reactions.length === 0) return null;
    
    // Group reactions by emoji and count
    const grouped = reactions.reduce((acc, r) => {
      acc[r.emoji] = (acc[r.emoji] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return (
      <div className="flex gap-1 flex-wrap mt-1">
        {Object.entries(grouped).map(([emoji, count]) => (
          <span 
            key={emoji}
            className="px-1.5 py-0.5 bg-muted rounded-full text-xs flex items-center gap-1 border border-border"
          >
            <span className="text-sm">{emoji}</span>
            {count > 1 && <span className="text-muted-foreground font-medium">{count}</span>}
          </span>
        ))}
      </div>
    );
  };

  const renderMediaLoading = () => (
    <div className="flex items-center justify-center p-4">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  const renderMediaError = (type: string) => (
    <div className="flex items-center justify-center p-4 bg-muted/50 rounded-md">
      <p className="text-sm text-muted-foreground">
        Não foi possível carregar {type === 'audio' ? 'o áudio' : type === 'video' ? 'o vídeo' : 'a mídia'}
      </p>
    </div>
  );

  const renderContent = () => {
    switch (message.message_type) {
      case 'image':
        return (
          <div className="space-y-2">
            {isMediaLoading ? renderMediaLoading() : mediaUrl ? (
              <img
                src={mediaUrl}
                alt="Imagem"
                className="max-w-xs rounded-md cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setViewerImage(mediaUrl)}
              />
            ) : message.media_url ? renderMediaError('image') : null}
            {message.content && <p className="text-sm">{message.content}</p>}
          </div>
        );
      
      case 'sticker':
        return (
          <div>
            {isMediaLoading ? renderMediaLoading() : mediaUrl ? (
              <img
                src={mediaUrl}
                alt="Sticker"
                className="max-w-[150px] cursor-pointer hover:scale-105 transition-transform"
                onClick={() => setViewerImage(mediaUrl)}
              />
            ) : message.media_url ? renderMediaError('sticker') : null}
          </div>
        );
      
      case 'audio':
        return (
          <div className="space-y-2">
            {isMediaLoading ? renderMediaLoading() : mediaUrl ? (
              <audio controls className="max-w-xs">
                <source src={mediaUrl} type={message.media_mimetype || 'audio/ogg'} />
              </audio>
            ) : message.media_url ? renderMediaError('audio') : null}
            {message.transcription_status === 'processing' && (
              <p className={cn(
                "text-xs italic",
                isFromMe ? "text-white/70" : "text-muted-foreground"
              )}>
                Transcrevendo...
              </p>
            )}
            {message.audio_transcription && (
              <div className={cn(
                "text-xs p-2 rounded-md",
                isFromMe ? "bg-white/10 text-white" : "bg-muted"
              )}>
                <p className="font-medium mb-0.5 text-[10px] uppercase tracking-wide opacity-70">Transcrição</p>
                <p>{message.audio_transcription}</p>
              </div>
            )}
          </div>
        );
      
      case 'video':
        return (
          <div className="space-y-2">
            {isMediaLoading ? renderMediaLoading() : mediaUrl ? (
              <video controls className="max-w-xs rounded-md">
                <source src={mediaUrl} type={message.media_mimetype || 'video/mp4'} />
              </video>
            ) : message.media_url ? renderMediaError('video') : null}
            {message.content && <p className="text-sm">{message.content}</p>}
          </div>
        );
      
      case 'document':
        return (
          <div className="space-y-2">
            {isMediaLoading ? renderMediaLoading() : mediaUrl ? (
              <a
                href={mediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm underline"
              >
                📄 {message.content || 'Documento'}
              </a>
            ) : message.media_url ? renderMediaError('document') : null}
          </div>
        );
      
      case 'contact':
      case 'contacts':
        return (
          <div className="flex items-center gap-3 p-2 bg-muted/50 rounded-md min-w-[200px]">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{message.content}</p>
              <p className="text-xs text-muted-foreground">Contato compartilhado</p>
            </div>
          </div>
        );
      
      default:
        return (
          <p className="text-sm whitespace-pre-wrap break-words">
            {message.content}
          </p>
        );
    }
  };

  return (
    <div
      className={cn(
        'flex group relative',
        isFromMe ? 'justify-end' : 'justify-start'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="max-w-[70%] relative">
        {isHovered && (
          <div className={cn(
            "absolute top-1/2 -translate-y-1/2 flex items-center gap-1 z-10",
            isFromMe ? "left-0 -translate-x-full -ml-1" : "right-0 translate-x-full ml-1"
          )}>
            <MessageReactionButton
              messageId={message.message_id}
              conversationId={message.conversation_id}
              onReact={handleReact}
              isFromMe={isFromMe}
            />
            {canEdit && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setIsEditModalOpen(true)}
                className="h-8 w-8 rounded-full bg-background/95 backdrop-blur-sm border border-border shadow-sm hover:bg-accent"
                title="Editar mensagem"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {onReply && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onReply(message)}
                className="h-8 w-8 rounded-full bg-background/95 backdrop-blur-sm border border-border shadow-sm hover:bg-accent"
              >
                <Reply className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
        <Card
          className={cn(
            'p-3 space-y-1',
            message.message_type === 'sticker' && 'bg-transparent border-none shadow-none p-0',
            message.is_internal
              ? 'bg-amber-500/20 border-amber-500/50 text-foreground border-dashed'
              : message.is_supervisor_message
                ? 'bg-purple-600 text-white'
                : isFromMe
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-card-foreground'
          )}
        >
          {/* Group sender name */}
          {isGroupChat && !isFromMe && senderName && (
            <p className="text-xs font-semibold text-primary mb-1">
              {senderName}
            </p>
          )}
          {message.is_internal && (
            <div className="flex items-center gap-1.5 mb-2">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/50">
                <Eye className="h-3 w-3 mr-1" />
                Nota Interna
              </Badge>
            </div>
          )}
          {message.is_supervisor_message && !message.is_internal && (
            <div className="flex items-center gap-1.5 mb-2">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-white/20 text-white border-white/30">
                <UserCog className="h-3 w-3 mr-1" />
                Supervisor
              </Badge>
            </div>
          )}
          {(message as any).from_bot && !message.is_internal && (
            <div className="flex items-center gap-1.5 mb-2">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/50">
                <Bot className="h-3 w-3 mr-1" />
                🤖 Assistente Virtual
              </Badge>
            </div>
          )}
          {message.quoted_message_id && (
            <QuotedMessagePreview messageId={message.quoted_message_id} />
          )}
          
          {renderContent()}
          
          <div className="flex items-center justify-end gap-1.5 mt-1">
            <span
              className={cn(
                'text-xs',
                isFromMe ? 'text-white/90' : 'text-muted-foreground'
              )}
            >
              {time}
            </span>
            {message.edited_at && (
              <Popover>
                <PopoverTrigger asChild>
                  <button 
                    className={cn(
                      "text-xs italic hover:underline cursor-pointer",
                      isFromMe ? 'text-white/80' : 'text-muted-foreground'
                    )}
                  >
                    Editado
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="p-0 w-auto">
                  <EditHistoryPopover 
                    messageId={message.message_id}
                    currentContent={message.content}
                    originalContent={message.original_content}
                  />
                </PopoverContent>
              </Popover>
            )}
            {getStatusIcon()}
          </div>
          {((message as any).is_ai_generated || (message as any).from_bot) && isFromMe && (
            <AIFeedbackButton
              conversationId={message.conversation_id}
              messageId={message.message_id}
              aiResponse={message.content || ""}
            />
          )}
        </Card>
        
        {renderReactions()}
      </div>

      <ImageViewerModal
        imageUrl={viewerImage}
        isOpen={!!viewerImage}
        onClose={() => setViewerImage(null)}
      />

      <EditMessageModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        currentContent={message.content}
        onSave={handleEditSave}
        isLoading={editMessage.isPending}
      />
    </div>
  );
};
