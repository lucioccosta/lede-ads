import { UserRole } from '@prisma/client';

/**
 * `clientAssignable: false` = endpoint não filtra por cliente; liberar para
 * perfis de cliente exporia dados de toda a rede.
 */
export type PermissionDef = {
  key: string;
  label: string;
  group: string;
  clientAssignable: boolean;
  defaults: UserRole[];
};

const ALL: UserRole[] = [
  UserRole.lede_admin,
  UserRole.lede_operator,
  UserRole.client_approver,
  UserRole.client_viewer,
];
const LEDE: UserRole[] = [UserRole.lede_admin, UserRole.lede_operator];
const ADMIN: UserRole[] = [UserRole.lede_admin];
const EDITORS: UserRole[] = [
  UserRole.lede_admin,
  UserRole.lede_operator,
  UserRole.client_approver,
];

export const PERMISSIONS: PermissionDef[] = [
  {
    key: 'clients.view',
    label: 'Ver clientes',
    group: 'Clientes',
    clientAssignable: false,
    defaults: LEDE,
  },
  {
    key: 'clients.manage',
    label: 'Criar e editar clientes',
    group: 'Clientes',
    clientAssignable: false,
    defaults: LEDE,
  },
  {
    key: 'clients.delete',
    label: 'Excluir clientes',
    group: 'Clientes',
    clientAssignable: false,
    defaults: ADMIN,
  },
  {
    key: 'client_users.manage',
    label: 'Gerenciar usuários do portal',
    group: 'Clientes',
    clientAssignable: false,
    defaults: LEDE,
  },

  {
    key: 'plans.view',
    label: 'Ver planos',
    group: 'Planos',
    clientAssignable: true,
    defaults: ALL,
  },
  {
    key: 'plans.manage',
    label: 'Criar e editar planos',
    group: 'Planos',
    clientAssignable: false,
    defaults: LEDE,
  },
  {
    key: 'plans.delete',
    label: 'Excluir planos',
    group: 'Planos',
    clientAssignable: false,
    defaults: ADMIN,
  },

  {
    key: 'devices.mine',
    label: 'Ver telas do próprio cliente',
    group: 'Telas',
    clientAssignable: true,
    defaults: ALL,
  },
  {
    key: 'devices.view',
    label: 'Ver telas e monitoramento',
    group: 'Telas',
    clientAssignable: false,
    defaults: LEDE,
  },
  {
    key: 'devices.manage',
    label: 'Parear, editar e enviar comandos',
    group: 'Telas',
    clientAssignable: false,
    defaults: LEDE,
  },
  {
    key: 'devices.delete',
    label: 'Excluir telas',
    group: 'Telas',
    clientAssignable: false,
    defaults: LEDE,
  },

  {
    key: 'device_groups.view',
    label: 'Ver grupos de telas',
    group: 'Grupos de telas',
    clientAssignable: false,
    defaults: LEDE,
  },
  {
    key: 'device_groups.manage',
    label: 'Criar e editar grupos',
    group: 'Grupos de telas',
    clientAssignable: false,
    defaults: LEDE,
  },
  {
    key: 'device_groups.delete',
    label: 'Excluir grupos',
    group: 'Grupos de telas',
    clientAssignable: false,
    defaults: ADMIN,
  },

  {
    key: 'capacity.view',
    label: 'Ver capacidade',
    group: 'Capacidade',
    clientAssignable: false,
    defaults: LEDE,
  },

  {
    key: 'screen_types.view',
    label: 'Ver tipos de tela',
    group: 'Tipos de tela',
    clientAssignable: true,
    defaults: ALL,
  },
  {
    key: 'screen_types.manage',
    label: 'Criar, editar e liberar tipos',
    group: 'Tipos de tela',
    clientAssignable: false,
    defaults: LEDE,
  },
  {
    key: 'screen_types.delete',
    label: 'Excluir tipos de tela',
    group: 'Tipos de tela',
    clientAssignable: false,
    defaults: ADMIN,
  },

  {
    key: 'layouts.view',
    label: 'Ver layouts',
    group: 'Layouts',
    clientAssignable: true,
    defaults: ALL,
  },
  {
    key: 'layouts.manage',
    label: 'Criar e editar layouts',
    group: 'Layouts',
    clientAssignable: false,
    defaults: LEDE,
  },
  {
    key: 'layouts.delete',
    label: 'Excluir layouts',
    group: 'Layouts',
    clientAssignable: false,
    defaults: ADMIN,
  },

  {
    key: 'media.view',
    label: 'Ver mídias',
    group: 'Mídias',
    clientAssignable: true,
    defaults: ALL,
  },
  {
    key: 'media.upload',
    label: 'Enviar, editar e submeter mídias',
    group: 'Mídias',
    clientAssignable: true,
    defaults: EDITORS,
  },
  {
    key: 'media.review',
    label: 'Aprovar ou rejeitar mídias',
    group: 'Mídias',
    clientAssignable: true,
    defaults: EDITORS,
  },
  {
    key: 'media.delete',
    label: 'Excluir mídias',
    group: 'Mídias',
    clientAssignable: true,
    defaults: EDITORS,
  },

  {
    key: 'scenes.view',
    label: 'Ver cenas',
    group: 'Cenas',
    clientAssignable: true,
    defaults: ALL,
  },
  {
    key: 'scenes.create',
    label: 'Criar cenas',
    group: 'Cenas',
    clientAssignable: false,
    defaults: LEDE,
  },
  {
    key: 'scenes.edit',
    label: 'Editar cenas',
    group: 'Cenas',
    clientAssignable: true,
    defaults: EDITORS,
  },
  {
    key: 'scenes.delete',
    label: 'Excluir cenas',
    group: 'Cenas',
    clientAssignable: false,
    defaults: ADMIN,
  },

  {
    key: 'schedules.view',
    label: 'Ver agendamentos',
    group: 'Agendamentos',
    clientAssignable: true,
    defaults: ALL,
  },
  {
    key: 'schedules.manage',
    label: 'Criar e editar agendamentos',
    group: 'Agendamentos',
    clientAssignable: false,
    defaults: LEDE,
  },
  {
    key: 'schedules.delete',
    label: 'Excluir agendamentos',
    group: 'Agendamentos',
    clientAssignable: false,
    defaults: ADMIN,
  },

  {
    key: 'ticker.manage',
    label: 'Configurar tarja de índices',
    group: 'Tarja de índices',
    clientAssignable: false,
    defaults: LEDE,
  },

  {
    key: 'reports.view',
    label: 'Ver amostragem',
    group: 'Relatórios',
    clientAssignable: true,
    defaults: ALL,
  },
  {
    key: 'history.view',
    label: 'Ver histórico',
    group: 'Relatórios',
    clientAssignable: true,
    defaults: ALL,
  },
];

export const PERMISSION_KEYS = new Set(PERMISSIONS.map((p) => p.key));

export const CLIENT_ROLES: UserRole[] = [
  UserRole.client_approver,
  UserRole.client_viewer,
];

export function defaultPermissions(role: UserRole): string[] {
  return PERMISSIONS.filter((p) => p.defaults.includes(role)).map((p) => p.key);
}
