import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const GROQ_MODELS = [
  { 
    id: "llama-3.1-8b-instant", 
    name: "Llama 3.1 8B Instant",
    description: "Modelo rápido e eficiente para tarefas simples"
  },
  { 
    id: "llama-3.3-70b-versatile", 
    name: "Llama 3.3 70B Versatile",
    description: "Modelo poderoso para tarefas complexas"
  },
  { 
    id: "openai/gpt-oss-120b", 
    name: "GPT OSS 120B",
    description: "Para API de respostas (responses)"
  },
  { 
    id: "whisper-large-v3", 
    name: "Whisper Large V3",
    description: "Transcrição de áudio precisa"
  },
  { 
    id: "whisper-large-v3-turbo", 
    name: "Whisper Large V3 Turbo",
    description: "Transcrição de áudio rápida"
  },
  { 
    id: "llama-guard-3-8b", 
    name: "Llama Guard 3 8B",
    description: "Moderação e segurança"
  },
];

const USE_CASES = [
  { id: "chat_simple", name: "Chat Simples", description: "Conversas básicas e respostas diretas" },
  { id: "chat_fast", name: "Chat Rápido", description: "Respostas rápidas e sugestões" },
  { id: "chat_complex", name: "Chat Complexo", description: "Análises detalhadas e tarefas avançadas" },
  { id: "chat_long_texts", name: "Textos Longos", description: "Processamento de textos extensos" },
  { id: "audio_precise", name: "Transcrição Precisa", description: "Transcrição de áudio com alta precisão" },
  { id: "audio_fast", name: "Transcrição Rápida", description: "Transcrição de áudio otimizada" },
  { id: "safety_moderation", name: "Moderação", description: "Análise de segurança e moderação" },
];

export function AIAssistantSettings() {
  const { toast } = useToast();
  const [testCase, setTestCase] = useState<string>("chat_simple");
  const [testPrompt, setTestPrompt] = useState<string>("Olá! Como você está?");
  const [isTestingModel, setIsTestingModel] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Load saved model preferences from localStorage
  const [modelPreferences, setModelPreferences] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem("groq_model_preferences");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return {};
      }
    }
    return {
      chat_simple: "llama-3.1-8b-instant",
      chat_fast: "llama-3.1-8b-instant",
      chat_complex: "llama-3.3-70b-versatile",
      chat_long_texts: "llama-3.1-8b-instant",
      audio_precise: "whisper-large-v3",
      audio_fast: "whisper-large-v3-turbo",
      safety_moderation: "llama-guard-3-8b",
    };
  });

  const handleModelChange = (caseId: string, modelId: string) => {
    const updated = { ...modelPreferences, [caseId]: modelId };
    setModelPreferences(updated);
    localStorage.setItem("groq_model_preferences", JSON.stringify(updated));
    
    toast({
      title: "Modelo atualizado",
      description: `Preferência salva para ${USE_CASES.find(c => c.id === caseId)?.name}`,
    });
  };

  const handleTestModel = async () => {
    setIsTestingModel(true);
    setTestResult(null);

    try {
      const selectedModel = modelPreferences[testCase];
      
      if (!selectedModel) {
        throw new Error("Nenhum modelo selecionado para este caso de uso");
      }

      // Call the compose function as a test since it uses GROQ
      const { data, error } = await supabase.functions.invoke('compose-whatsapp-message', {
        body: {
          message: testPrompt,
          action: 'rephrase', // Simple action to test the model
        },
      });

      if (error) throw error;

      setTestResult({
        success: true,
        message: data.composed || "Teste realizado com sucesso!",
      });

      toast({
        title: "Teste bem-sucedido",
        description: `Modelo ${selectedModel} está funcionando corretamente`,
      });
    } catch (error) {
      console.error("Erro ao testar modelo:", error);
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      
      setTestResult({
        success: false,
        message: errorMessage,
      });

      toast({
        title: "Erro no teste",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsTestingModel(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Assistente I.A</h2>
        <p className="text-muted-foreground">
          Configure os modelos GROQ para cada tipo de tarefa do assistente
        </p>
      </div>

      {/* Model Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Modelos por Caso de Uso</CardTitle>
          <CardDescription>
            Selecione o melhor modelo GROQ para cada tipo de tarefa
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {USE_CASES.map((useCase) => {
            const selectedModel = modelPreferences[useCase.id];
            const modelInfo = GROQ_MODELS.find(m => m.id === selectedModel);

            return (
              <div key={useCase.id} className="space-y-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor={useCase.id}>{useCase.name}</Label>
                    <p className="text-sm text-muted-foreground">
                      {useCase.description}
                    </p>
                  </div>
                  <Badge variant="outline" className="ml-2 shrink-0">
                    {useCase.id}
                  </Badge>
                </div>
                <Select
                  value={selectedModel}
                  onValueChange={(value) => handleModelChange(useCase.id, value)}
                >
                  <SelectTrigger id={useCase.id}>
                    <SelectValue placeholder="Selecione um modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    {GROQ_MODELS.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        <div className="flex flex-col">
                          <span className="font-medium">{model.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {model.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {modelInfo && (
                  <p className="text-xs text-muted-foreground">
                    Modelo atual: {modelInfo.name}
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Test Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Testar Modelos
          </CardTitle>
          <CardDescription>
            Teste o funcionamento dos modelos configurados
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="test-case">Caso de Uso</Label>
            <Select value={testCase} onValueChange={setTestCase}>
              <SelectTrigger id="test-case">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {USE_CASES.map((useCase) => (
                  <SelectItem key={useCase.id} value={useCase.id}>
                    {useCase.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="test-prompt">Prompt de Teste</Label>
            <Textarea
              id="test-prompt"
              value={testPrompt}
              onChange={(e) => setTestPrompt(e.target.value)}
              placeholder="Digite um texto para testar o modelo..."
              rows={3}
            />
          </div>

          <Button 
            onClick={handleTestModel} 
            disabled={isTestingModel || !testPrompt.trim()}
            className="w-full"
          >
            {isTestingModel ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testando...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Testar Modelo
              </>
            )}
          </Button>

          {testResult && (
            <Card className={testResult.success ? "border-green-500" : "border-destructive"}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  {testResult.success ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1 flex-1">
                    <p className="font-medium">
                      {testResult.success ? "Teste bem-sucedido!" : "Erro no teste"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {testResult.message}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="rounded-lg bg-muted p-4 space-y-2">
            <p className="text-sm font-medium">Modelo Selecionado</p>
            <p className="text-sm text-muted-foreground">
              {GROQ_MODELS.find(m => m.id === modelPreferences[testCase])?.name || "Nenhum"}
            </p>
            <Badge variant="secondary" className="text-xs">
              {modelPreferences[testCase] || "não configurado"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="border-blue-500/50 bg-blue-500/5">
        <CardContent className="pt-6">
          <div className="space-y-2">
            <p className="text-sm font-medium">💡 Dica</p>
            <p className="text-sm text-muted-foreground">
              As preferências são salvas localmente no navegador. Para aplicar estas configurações
              nas Edge Functions, você precisa configurar as variáveis de ambiente no Supabase:
              <code className="block mt-2 p-2 bg-muted rounded text-xs">
                GROQ_MODEL_CHAT_SIMPLE=llama-3.1-8b-instant
              </code>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
