import { useState, useRef, KeyboardEvent, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, Mic, ChevronDown, ChevronUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EmojiPickerButton } from "./EmojiPickerButton";
import { MediaUploadButton } from "./MediaUploadButton";
import { AIComposerButton } from "./AIComposerButton";
import { AudioRecorder } from "./AudioRecorder";
import { MacroSuggestions } from "./MacroSuggestions";
import { MacrosButton } from "./MacrosButton";
import { SmartReplySuggestions } from "./SmartReplySuggestions";
import { ReplyPreview } from "./ReplyPreview";
import { QuoteButton } from "@/components/chat/QuoteButton";
import { useWhatsAppMacros } from "@/hooks/whatsapp/useWhatsAppMacros";
import { useSmartReply } from "@/hooks/whatsapp/useSmartReply";
import { Tables } from "@/integrations/supabase/types";

type Message = Tables<'whatsapp_messages'>;

export interface MediaSendParams {
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document';
  content?: string;
  mediaUrl?: string;
  mediaBase64?: string;
  mediaMimetype?: string;
  fileName?: string;
}

interface MessageInputContainerProps {
  conversationId: string;
  disabled?: boolean;
  replyingTo?: Message | null;
  leadId?: string;
  sectorId?: string;
  onSendText: (content: string, quotedMessageId?: string) => void;
  onSendMedia: (params: MediaSendParams) => void;
  onCancelReply?: () => void;
}

export const MessageInputContainer = ({ 
  conversationId, 
  disabled,
  replyingTo,
  leadId,
  sectorId,
  onSendText, 
  onSendMedia,
  onCancelReply
}: MessageInputContainerProps) => {
  const [message, setMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [showMacroSuggestions, setShowMacroSuggestions] = useState(false);
  const [filteredMacros, setFilteredMacros] = useState<any[]>([]);
  const [showSmartReplies, setShowSmartReplies] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const { macros, incrementUsage } = useWhatsAppMacros();
  const { suggestions, isLoading: isLoadingSmartReplies, isRefreshing, refresh } = useSmartReply(conversationId);

  // Detect /macro: command and filter macros
  useEffect(() => {
    const match = message.match(/\/macro:\s*(\S*)$/i);
    if (match) {
      const searchTerm = match[1].toLowerCase();
      const filtered = macros.filter(m => 
        m.shortcut.toLowerCase().includes(searchTerm) ||
        m.name.toLowerCase().includes(searchTerm)
      );
      setFilteredMacros(filtered);
      setShowMacroSuggestions(filtered.length > 0);
    } else {
      setShowMacroSuggestions(false);
      setFilteredMacros([]);
    }
  }, [message, macros]);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSendText(message.trim(), replyingTo?.message_id);
      setMessage("");
      onCancelReply?.();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    if (!textareaRef.current) return;
    
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const text = message;
    const newText = text.substring(0, start) + emoji + text.substring(end);
    
    setMessage(newText);
    
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = start + emoji.length;
        textareaRef.current.selectionStart = newPos;
        textareaRef.current.selectionEnd = newPos;
        textareaRef.current.focus();
      }
    }, 0);
  };

  const handleMacroSelect = (macro: any) => {
    setMessage(macro.content);
    incrementUsage(macro.id);
    setShowMacroSuggestions(false);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  const handleMacroButtonSelect = (content: string, macroId: string) => {
    setMessage(content);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  const handleSmartReplySelect = (text: string) => {
    setMessage(text);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  if (isRecording) {
    return (
      <div className="p-4 border-t border-border bg-card">
        <AudioRecorder
          onSend={(params) => {
            onSendMedia(params);
            setIsRecording(false);
          }}
          onCancel={() => setIsRecording(false)}
        />
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-card">
      {replyingTo && onCancelReply && (
        <ReplyPreview message={replyingTo} onCancel={onCancelReply} />
      )}
      
      {showSmartReplies && (
        <SmartReplySuggestions
          suggestions={suggestions}
          isLoading={isLoadingSmartReplies}
          isRefreshing={isRefreshing}
          onSelectSuggestion={handleSmartReplySelect}
          onRefresh={refresh}
          onToggle={() => setShowSmartReplies(false)}
        />
      )}
      
      <div className="p-4">
        {showMacroSuggestions && (
          <MacroSuggestions
            macros={filteredMacros}
            onSelect={handleMacroSelect}
          />
        )}
        
        <div className="flex gap-2 items-end">
          <div className="relative flex-1 rounded-md border border-input bg-background">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite uma mensagem..."
              className="min-h-[44px] max-h-96 resize-y border-0 pr-56 focus-visible:ring-0 focus-visible:ring-offset-0"
              disabled={disabled}
            />
            
            <div className="absolute right-2 bottom-2 flex gap-1 items-center bg-background">
              <EmojiPickerButton onEmojiSelect={handleEmojiSelect} disabled={disabled} />
              
              <MacrosButton
                onSelectMacro={handleMacroButtonSelect}
                disabled={disabled}
              />
              
              <MediaUploadButton 
                conversationId={conversationId}
                onSendMedia={onSendMedia}
                disabled={disabled}
              />
              
              <AIComposerButton
                message={message}
                onComposed={(newMessage) => setMessage(newMessage)}
                disabled={disabled}
              />
              
              <QuoteButton
                conversationId={conversationId}
                leadId={leadId}
                sectorId={sectorId}
                disabled={disabled}
              />
              
              <Button
                type="button"
                onClick={() => setIsRecording(true)}
                size="icon"
                variant="ghost"
                disabled={disabled}
                className="h-9 w-9 shrink-0"
              >
                <Mic className="w-4 h-4" />
              </Button>
              
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      onClick={() => setShowSmartReplies(!showSmartReplies)}
                      size="icon"
                      variant="ghost"
                      disabled={disabled}
                      className="h-9 w-9 shrink-0 transition-all duration-200"
                    >
                      {showSmartReplies ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronUp className="w-4 h-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {showSmartReplies ? 'Ocultar sugestões IA' : 'Mostrar sugestões IA'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              <Button
                type="button"
                onClick={handleSend}
                size="icon"
                disabled={disabled || !message.trim()}
                className="h-9 w-9 shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
        
        <p className="text-xs text-muted-foreground mt-1">
          Enter para enviar, Shift+Enter para nova linha
        </p>
      </div>
    </div>
  );
};
