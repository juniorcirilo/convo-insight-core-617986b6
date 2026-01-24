import { AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SLAIndicatorProps {
  ticket: {
    created_at: string;
    first_response_at: string | null;
    sla_violated_at: string | null;
    prioridade: string;
  } | null;
  slaConfig: {
    tempo_primeira_resposta_minutos: number;
    tempo_resolucao_minutos: number;
  } | null;
}

type SLAStatus = 'ok' | 'warning' | 'violated' | 'none';

export function SLAIndicator({ ticket, slaConfig }: SLAIndicatorProps) {
  if (!ticket || !slaConfig) {
    return null;
  }

  const getSLAStatus = (): { status: SLAStatus; remaining: number; label: string } => {
    if (ticket.sla_violated_at) {
      const violatedAt = new Date(ticket.sla_violated_at).getTime();
      const elapsed = Date.now() - violatedAt;
      return { 
        status: 'violated', 
        remaining: -Math.floor(elapsed / 60000),
        label: 'SLA Violado'
      };
    }

    const createdAt = new Date(ticket.created_at).getTime();
    const elapsed = Date.now() - createdAt;
    
    // Check first response SLA if not responded yet
    if (!ticket.first_response_at) {
      const limit = slaConfig.tempo_primeira_resposta_minutos * 60 * 1000;
      const remaining = limit - elapsed;
      const remainingMinutes = Math.floor(remaining / 60000);
      
      if (remaining <= 0) {
        return { status: 'violated', remaining: remainingMinutes, label: 'SLA Violado' };
      }
      if (remaining < limit * 0.3) {
        return { status: 'warning', remaining: remainingMinutes, label: 'SLA Crítico' };
      }
      return { status: 'ok', remaining: remainingMinutes, label: 'SLA OK' };
    }

    // Check resolution SLA
    const resolutionLimit = slaConfig.tempo_resolucao_minutos * 60 * 1000;
    const resolutionRemaining = resolutionLimit - elapsed;
    const remainingMinutes = Math.floor(resolutionRemaining / 60000);

    if (resolutionRemaining <= 0) {
      return { status: 'violated', remaining: remainingMinutes, label: 'SLA Violado' };
    }
    if (resolutionRemaining < resolutionLimit * 0.3) {
      return { status: 'warning', remaining: remainingMinutes, label: 'SLA Crítico' };
    }
    return { status: 'ok', remaining: remainingMinutes, label: 'SLA OK' };
  };

  const { status, remaining, label } = getSLAStatus();

  const formatTime = (minutes: number) => {
    const absMinutes = Math.abs(minutes);
    if (absMinutes < 60) {
      return `${absMinutes}min`;
    }
    const hours = Math.floor(absMinutes / 60);
    const mins = absMinutes % 60;
    return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  };

  const getStatusStyles = () => {
    switch (status) {
      case 'ok':
        return 'bg-green-500/10 text-green-600 border-green-500/30';
      case 'warning':
        return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30';
      case 'violated':
        return 'bg-red-500/10 text-red-600 border-red-500/30';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getIcon = () => {
    switch (status) {
      case 'ok':
        return <CheckCircle className="h-3 w-3" />;
      case 'warning':
        return <Clock className="h-3 w-3" />;
      case 'violated':
        return <AlertTriangle className="h-3 w-3" />;
      default:
        return null;
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`text-[10px] gap-1 ${getStatusStyles()}`}>
            {getIcon()}
            {status === 'violated' 
              ? `+${formatTime(remaining)}` 
              : formatTime(remaining)
            }
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">
            {status === 'violated' 
              ? `Tempo excedido: ${formatTime(remaining)}`
              : `Tempo restante: ${formatTime(remaining)}`
            }
          </p>
          <p className="text-xs text-muted-foreground">
            Prioridade: {ticket.prioridade}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
