import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Eye, MessageSquare, LayoutGrid, Users, Settings, ArrowRightLeft, MessageCircle } from 'lucide-react';
import { usePermissionTypes } from '@/hooks/permissions';

const permissionIcons: Record<string, React.ElementType> = {
  can_access_conversations: MessageSquare,
  can_respond_conversations: MessageCircle,
  can_access_kanban: LayoutGrid,
  can_view_global_data: Eye,
  can_access_admin_panel: Settings,
  can_send_internal_messages: MessageSquare,
  can_transfer_conversations: ArrowRightLeft,
};

const RolesCapabilitiesCard = () => {
  const { data: permissionTypes, isLoading } = usePermissionTypes();

  const roles = [
    { key: 'admin', label: 'Admin', description: 'Acesso total ao sistema', variant: 'destructive' as const },
    { key: 'supervisor', label: 'Supervisor', description: 'Gerencia equipe e monitora conversas', variant: 'default' as const },
    { key: 'agent', label: 'Agente', description: 'Atende conversas atribuídas', variant: 'secondary' as const },
  ];

  const categories = [
    { key: 'conversations', label: 'Conversas' },
    { key: 'sales', label: 'Vendas' },
    { key: 'admin', label: 'Administração' },
  ];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-muted rounded w-1/3" />
            <div className="h-32 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Documentação de Roles
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Capacidades padrão de cada role no sistema
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Role descriptions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {roles.map(role => (
              <div key={role.key} className="p-4 border rounded-lg">
                <Badge variant={role.variant} className="mb-2">
                  {role.label}
                </Badge>
                <p className="text-sm text-muted-foreground">{role.description}</p>
              </div>
            ))}
          </div>

          {/* Permissions matrix */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium">Permissão</th>
                  {roles.map(role => (
                    <th key={role.key} className="text-center py-3 px-4 font-medium">
                      <Badge variant={role.variant}>{role.label}</Badge>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map(category => (
                  <React.Fragment key={category.key}>
                    <tr className="bg-muted/50">
                      <td colSpan={4} className="py-2 px-2 font-semibold text-muted-foreground">
                        {category.label}
                      </td>
                    </tr>
                    {permissionTypes
                      ?.filter(pt => pt.category === category.key)
                      .map(pt => {
                        const Icon = permissionIcons[pt.key] || Users;
                        return (
                          <tr key={pt.key} className="border-b">
                            <td className="py-3 px-2">
                              <div className="flex items-center gap-2">
                                <Icon className="h-4 w-4 text-muted-foreground" />
                                <div>
                                  <span className="font-medium">{pt.name}</span>
                                  {pt.description && (
                                    <p className="text-xs text-muted-foreground">{pt.description}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="text-center py-3 px-4">
                              {pt.default_for_admin ? (
                                <span className="text-green-600">✓</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="text-center py-3 px-4">
                              {pt.default_for_supervisor ? (
                                <span className="text-green-600">✓</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="text-center py-3 px-4">
                              {pt.default_for_agent ? (
                                <span className="text-green-600">✓</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Hierarchy explanation */}
          <div className="p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2">Hierarquia de Permissões</h4>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li><strong>Role</strong> define as permissões base (Admin tem tudo por padrão)</li>
              <li><strong>Setor</strong> pode personalizar permissões para todos os membros</li>
              <li><strong>Override Individual</strong> sobrescreve permissões do setor para um usuário específico</li>
            </ol>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default RolesCapabilitiesCard;
