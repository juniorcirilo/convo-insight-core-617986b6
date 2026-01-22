import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWhatsAppInstances } from "@/hooks/whatsapp";
import { useSectors, type SectorWithInstance } from "@/hooks/useSectors";
import { Ticket, Bot, MessageSquare, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sector?: SectorWithInstance;
}

interface FormData {
  name: string;
  description: string;
  instance_id: string;
  is_default: boolean;
  tipo_atendimento: 'humano' | 'chatbot';
  gera_ticket: boolean;
  mensagem_boas_vindas: string;
  mensagem_encerramento: string;
  mensagem_reabertura: string;
}

export function SectorDialog({
  open,
  onOpenChange,
  sector,
}: SectorDialogProps) {
  const { instances = [] } = useWhatsAppInstances();
  const { createSector, updateSector } = useSectors();
  const { toast } = useToast();
  const [generatingField, setGeneratingField] = useState<string | null>(null);

  const { register, handleSubmit, watch, setValue, reset } = useForm<FormData>({
    defaultValues: {
      name: "",
      description: "",
      instance_id: "",
      is_default: false,
      tipo_atendimento: "humano",
      gera_ticket: false,
      mensagem_boas_vindas: "",
      mensagem_encerramento: "",
      mensagem_reabertura: "",
    },
  });

  const geraTicket = watch("gera_ticket");
  const tipoAtendimento = watch("tipo_atendimento");

  useEffect(() => {
    if (sector) {
      reset({
        name: sector.name,
        description: sector.description || "",
        instance_id: sector.instance_id,
        is_default: sector.is_default,
        tipo_atendimento: sector.tipo_atendimento || "humano",
        gera_ticket: sector.gera_ticket || false,
        mensagem_boas_vindas: sector.mensagem_boas_vindas || "",
        mensagem_encerramento: sector.mensagem_encerramento || "",
        mensagem_reabertura: (sector as any).mensagem_reabertura || "",
      });
    } else {
      reset({
        name: "",
        description: "",
        instance_id: instances[0]?.id || "",
        is_default: false,
        tipo_atendimento: "humano",
        gera_ticket: false,
        mensagem_boas_vindas: "",
        mensagem_encerramento: "",
        mensagem_reabertura: "",
      });
    }
  }, [sector, instances, reset]);

  const generateWithAI = async (field: keyof FormData, context: string) => {
    setGeneratingField(field);
    try {
      const prompts: Record<string, string> = {
        mensagem_boas_vindas: `Crie uma mensagem de boas-vindas curta e profissional para um sistema de tickets de suporte. 
A mensagem deve:
- Informar que o ticket foi aberto
- Ser acolhedora e profissional
- Ter no máximo 2-3 frases
- Pode usar emojis moderadamente

Contexto do setor: ${context || 'Atendimento ao cliente'}`,
        
        mensagem_encerramento: `Crie uma mensagem de encerramento curta e profissional para um sistema de tickets de suporte.
A mensagem deve:
- Informar que o atendimento foi encerrado
- Solicitar avaliação do atendimento de 1 a 5
- Ser cordial
- Ter no máximo 2-3 frases
- Pode usar emojis moderadamente

Contexto do setor: ${context || 'Atendimento ao cliente'}`,

        mensagem_reabertura: `Crie uma mensagem curta e profissional para informar que um ticket foi reaberto.
A mensagem deve:
- Informar que o ticket foi reaberto
- Indicar que o atendimento será retomado em breve
- Ser acolhedora
- Ter no máximo 2-3 frases
- Pode usar emojis moderadamente

Contexto do setor: ${context || 'Atendimento ao cliente'}`,
      };

      const prompt = prompts[field];
      if (!prompt) return;

      const { data, error } = await supabase.functions.invoke('compose-whatsapp-message', {
        body: {
          message: prompt,
          action: 'expand'
        }
      });

      if (error) throw error;

      if (data?.composed) {
        setValue(field, data.composed);
        toast({
          title: "Mensagem gerada",
          description: "A mensagem foi gerada com sucesso pela IA.",
        });
      }
    } catch (error) {
      console.error('Error generating with AI:', error);
      toast({
        title: "Erro ao gerar mensagem",
        description: "Não foi possível gerar a mensagem com IA. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setGeneratingField(null);
    }
  };

  const onSubmit = async (data: FormData) => {
    const payload = {
      name: data.name,
      description: data.description || null,
      instance_id: data.instance_id,
      is_default: data.is_default,
      is_active: true,
      tipo_atendimento: data.tipo_atendimento,
      gera_ticket: data.gera_ticket,
      mensagem_boas_vindas: data.gera_ticket ? (data.mensagem_boas_vindas || null) : null,
      mensagem_encerramento: data.gera_ticket ? (data.mensagem_encerramento || null) : null,
      mensagem_reabertura: data.gera_ticket ? (data.mensagem_reabertura || null) : null,
    };

    if (sector) {
      await updateSector.mutateAsync({ id: sector.id, ...payload });
    } else {
      await createSector.mutateAsync(payload);
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {sector ? "Editar Setor" : "Novo Setor"}
          </DialogTitle>
          <DialogDescription>
            Configure os detalhes do setor para organizar sua equipe.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Setor</Label>
            <Input
              id="name"
              placeholder="Ex: Suporte, Vendas, Financeiro"
              {...register("name", { required: true })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição (opcional)</Label>
            <Textarea
              id="description"
              placeholder="Descreva o propósito deste setor..."
              {...register("description")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="instance">Instância</Label>
            <Select
              value={watch("instance_id")}
              onValueChange={(value) => setValue("instance_id", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar instância..." />
              </SelectTrigger>
              <SelectContent>
                {instances.map((instance) => (
                  <SelectItem key={instance.id} value={instance.id}>
                    {instance.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tipo de Atendimento</Label>
            <Select
              value={watch("tipo_atendimento")}
              onValueChange={(value: 'humano' | 'chatbot') => setValue("tipo_atendimento", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="humano">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    <span>Atendimento Humano</span>
                  </div>
                </SelectItem>
                <SelectItem value="chatbot">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    <span>Chatbot (IA)</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {tipoAtendimento === 'chatbot' 
                ? 'Respostas automáticas serão geradas por IA'
                : 'Mensagens serão respondidas por agentes humanos'}
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="is_default">Setor Padrão</Label>
              <p className="text-xs text-muted-foreground">
                Novas conversas serão atribuídas a este setor automaticamente
              </p>
            </div>
            <Switch
              id="is_default"
              checked={watch("is_default")}
              onCheckedChange={(checked) => setValue("is_default", checked)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <Ticket className="h-5 w-5 text-primary mt-0.5" />
              <div className="space-y-0.5">
                <Label htmlFor="gera_ticket">Gera Tickets de Suporte</Label>
                <p className="text-xs text-muted-foreground">
                  Ativar sistema de tickets com abertura, encerramento e feedback
                </p>
              </div>
            </div>
            <Switch
              id="gera_ticket"
              checked={watch("gera_ticket")}
              onCheckedChange={(checked) => setValue("gera_ticket", checked)}
            />
          </div>

          {geraTicket && (
            <div className="space-y-4 rounded-lg border border-border p-4 bg-muted/30">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Ticket className="h-4 w-4" />
                Configurações do Ticket
              </h4>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="mensagem_boas_vindas">Mensagem de Boas-vindas</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => generateWithAI('mensagem_boas_vindas', watch('name'))}
                    disabled={generatingField !== null}
                    className="h-7 text-xs gap-1"
                  >
                    {generatingField === 'mensagem_boas_vindas' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    Gerar com IA
                  </Button>
                </div>
                <Textarea
                  id="mensagem_boas_vindas"
                  placeholder="Olá! Seu ticket de suporte foi aberto. Em breve um atendente irá ajudá-lo."
                  {...register("mensagem_boas_vindas")}
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Enviada automaticamente quando um novo ticket é criado
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="mensagem_reabertura">Mensagem de Reabertura</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => generateWithAI('mensagem_reabertura', watch('name'))}
                    disabled={generatingField !== null}
                    className="h-7 text-xs gap-1"
                  >
                    {generatingField === 'mensagem_reabertura' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    Gerar com IA
                  </Button>
                </div>
                <Textarea
                  id="mensagem_reabertura"
                  placeholder="Seu ticket foi reaberto. Um atendente irá retomar seu atendimento em breve."
                  {...register("mensagem_reabertura")}
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Enviada quando um ticket é reaberto manualmente por um agente
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="mensagem_encerramento">Mensagem de Encerramento</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => generateWithAI('mensagem_encerramento', watch('name'))}
                    disabled={generatingField !== null}
                    className="h-7 text-xs gap-1"
                  >
                    {generatingField === 'mensagem_encerramento' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    Gerar com IA
                  </Button>
                </div>
                <Textarea
                  id="mensagem_encerramento"
                  placeholder="Seu atendimento foi encerrado. Por favor, avalie nosso atendimento de 1 a 5."
                  {...register("mensagem_encerramento")}
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Enviada quando o ticket é finalizado, seguida de solicitação de feedback
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={createSector.isPending || updateSector.isPending}
            >
              {sector ? "Salvar Alterações" : "Criar Setor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
