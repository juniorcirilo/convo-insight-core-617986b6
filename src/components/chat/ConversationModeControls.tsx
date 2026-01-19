import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, User, RefreshCcw, UserPlus } from "lucide-react";
import { useAIAgentSession, ConversationMode } from "@/hooks/ai-agent";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ConversationModeControlsProps {
  conversationId: string | null;
  conversationMode?: string;
}

const modeConfig: Record<ConversationMode, { icon: typeof Bot; label: string; color: string }> = {
  ai: { icon: Bot, label: 'AI', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  human: { icon: User, label: 'Humano', color: 'bg-green-500/10 text-green-500 border-green-500/20' },
  hybrid: { icon: RefreshCcw, label: 'Híbrido', color: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
};

export const ConversationModeControls = ({ conversationId, conversationMode }: ConversationModeControlsProps) => {
  const { user } = useAuth();
  const { session, assumeConversation, returnToAI, setHybridMode } = useAIAgentSession(conversationId);

  const currentMode = (conversationMode as ConversationMode) || session?.mode || 'human';
  const config = modeConfig[currentMode];
  const Icon = config.icon;

  const handleAssumeConversation = () => {
    if (user?.id) {
      assumeConversation.mutate(user.id);
    }
  };

  const handleReturnToAI = () => {
    returnToAI.mutate();
  };

  const handleSetHybrid = () => {
    if (user?.id) {
      setHybridMode.mutate(user.id);
    }
  };

  if (!conversationId) return null;

  return (
    <div className="flex items-center gap-2">
      {/* Badge do modo atual */}
      <Badge variant="outline" className={cn("flex items-center gap-1", config.color)}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>

      {/* Menu de controle */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 px-2">
            <RefreshCcw className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {currentMode !== 'human' && (
            <DropdownMenuItem onClick={handleAssumeConversation}>
              <UserPlus className="h-4 w-4 mr-2" />
              Assumir Conversa
            </DropdownMenuItem>
          )}
          {currentMode !== 'ai' && (
            <DropdownMenuItem onClick={handleReturnToAI}>
              <Bot className="h-4 w-4 mr-2" />
              Devolver para IA
            </DropdownMenuItem>
          )}
          {currentMode !== 'hybrid' && (
            <DropdownMenuItem onClick={handleSetHybrid}>
              <RefreshCcw className="h-4 w-4 mr-2" />
              Modo Híbrido
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
