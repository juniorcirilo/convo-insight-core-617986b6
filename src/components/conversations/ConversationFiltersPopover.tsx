import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Settings2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { InstanceFilter } from './InstanceFilter';

interface ConversationFiltersPopoverProps {
  statusFilter: string;
  onStatusChange: (value: string) => void;
  sortBy: string;
  onSortChange: (value: string) => void;
  instanceFilter: string | null;
  onInstanceChange: (value: string | null) => void;
}

const sortOptions = [
  { value: 'recent', label: '🕐 Mais Recentes' },
  { value: 'unread', label: '🔔 Não Lidas Primeiro' },
  { value: 'waiting', label: '⏳ Aguardando Resposta' },
  { value: 'oldest', label: '📅 Mais Antigas' },
];

const statusOptions = [
  { value: 'all', label: 'Todas' },
  { value: 'active', label: 'Em Aberto' },
  { value: 'closed', label: 'Encerradas' },
  { value: 'archived', label: 'Arquivadas' },
];

export function ConversationFiltersPopover({
  statusFilter,
  onStatusChange,
  sortBy,
  onSortChange,
  instanceFilter,
  onInstanceChange,
}: ConversationFiltersPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localSortBy, setLocalSortBy] = useState<string[]>(sortBy ? [sortBy] : []);
  const [localStatusFilter, setLocalStatusFilter] = useState<string[]>(statusFilter && statusFilter !== 'all' ? [statusFilter] : []);
  const [localInstanceFilter, setLocalInstanceFilter] = useState<string | null>(instanceFilter);

  // Conta quantos filtros estão ativos
  const activeFiltersCount = [
    statusFilter !== 'all',
    sortBy !== 'recent',
    instanceFilter !== null,
  ].filter(Boolean).length;

  const handleApply = () => {
    // Aplica os filtros
    onSortChange(localSortBy[0] || 'recent');
    onStatusChange(localStatusFilter.length > 0 ? localStatusFilter[0] : 'all');
    onInstanceChange(localInstanceFilter);
    setIsOpen(false);
  };

  const handleClear = () => {
    setLocalSortBy(['recent']);
    setLocalStatusFilter([]);
    setLocalInstanceFilter(null);
    onStatusChange('all');
    onSortChange('recent');
    onInstanceChange(null);
  };

  const toggleSort = (value: string) => {
    setLocalSortBy([value]);
  };

  const toggleStatus = (value: string) => {
    if (value === 'all') {
      setLocalStatusFilter([]);
    } else {
      setLocalStatusFilter([value]);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative h-8 w-8" title="Filtros">
          <Settings2 className="h-4 w-4" />
          {activeFiltersCount > 0 && (
            <Badge
              variant="default"
              className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center rounded-full text-[10px]"
            >
              {activeFiltersCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div>
            <h4 className="font-medium mb-1">Filtros Avançados</h4>
            <p className="text-xs text-muted-foreground">
              Refine sua busca com filtros adicionais
            </p>
          </div>

          {/* Ordenação */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Ordenação</label>
            <div className="space-y-2">
              {sortOptions.map((option) => (
                <div key={option.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`sort-${option.value}`}
                    checked={localSortBy.includes(option.value)}
                    onCheckedChange={() => toggleSort(option.value)}
                  />
                  <Label htmlFor={`sort-${option.value}`} className="text-sm font-normal cursor-pointer">
                    {option.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <div className="space-y-2">
              {statusOptions.map((option) => (
                <div key={option.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`status-${option.value}`}
                    checked={option.value === 'all' ? localStatusFilter.length === 0 : localStatusFilter.includes(option.value)}
                    onCheckedChange={() => toggleStatus(option.value)}
                  />
                  <Label htmlFor={`status-${option.value}`} className="text-sm font-normal cursor-pointer">
                    {option.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Instância */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Instância</label>
            <InstanceFilter
              selectedInstance={localInstanceFilter}
              onInstanceChange={setLocalInstanceFilter}
            />
          </div>

          {/* Botões */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleClear}
            >
              Limpar
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={handleApply}
            >
              Aplicar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
