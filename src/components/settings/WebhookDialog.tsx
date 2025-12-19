import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useWebhooks, WEBHOOK_EVENTS, Webhook } from '@/hooks/webhooks/useWebhooks';

interface WebhookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webhook?: Webhook | null;
}

export function WebhookDialog({ open, onOpenChange, webhook }: WebhookDialogProps) {
  const { createWebhook, updateWebhook, isCreating, isUpdating } = useWebhooks();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  useEffect(() => {
    if (webhook) {
      setName(webhook.name);
      setUrl(webhook.url);
      setSecretKey(webhook.secret_key || '');
      setSelectedEvents(webhook.events);
    } else {
      setName('');
      setUrl('');
      setSecretKey('');
      setSelectedEvents([]);
    }
  }, [webhook, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const data = {
      name,
      url,
      secret_key: secretKey || undefined,
      events: selectedEvents,
    };

    if (webhook) {
      updateWebhook({ id: webhook.id, ...data });
    } else {
      createWebhook(data);
    }
    
    onOpenChange(false);
  };

  const handleEventToggle = (event: string) => {
    setSelectedEvents(prev =>
      prev.includes(event)
        ? prev.filter(e => e !== event)
        : [...prev, event]
    );
  };

  const isSubmitting = isCreating || isUpdating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{webhook ? 'Editar Webhook' : 'Novo Webhook'}</DialogTitle>
          <DialogDescription>
            Configure um endpoint para receber notificações de eventos
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Meu webhook"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.exemplo.com/webhook"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="secret">Chave Secreta (opcional)</Label>
            <Input
              id="secret"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder="Usado para assinar as requisições"
            />
            <p className="text-xs text-muted-foreground">
              A chave será enviada no header X-Webhook-Secret
            </p>
          </div>

          <div className="space-y-2">
            <Label>Eventos</Label>
            <div className="grid grid-cols-2 gap-2">
              {WEBHOOK_EVENTS.map((event) => (
                <div key={event.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={event.value}
                    checked={selectedEvents.includes(event.value)}
                    onCheckedChange={() => handleEventToggle(event.value)}
                  />
                  <Label htmlFor={event.value} className="text-sm font-normal cursor-pointer">
                    {event.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || selectedEvents.length === 0}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {webhook ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
