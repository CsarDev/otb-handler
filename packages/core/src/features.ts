/**
 * Catálogo declarativo de features del sistema (fuente única de verdad del RBAC).
 *
 * Regla: al agregar una feature nueva, DEBÉS declararla acá con sus acciones
 * (CRUD por defecto vía `crud: true`). Luego `db:seed` la crea en la tabla
 * `permissions`, o bien se usa POST /api/permissions/sync para reconciliar
 * contra una base existente sin reseedear.
 */

export type FeatureAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'manage'
  | 'export';

export type Feature = {
  /** slug del recurso, p.ej. 'socios' → permiso 'socios:read' */
  resource: string;
  /** etiqueta legible para la UI, p.ej. 'Socios' */
  label: string;
  /** acciones disponibles: si es `true` usa el CRUD completo */
  crud?: boolean;
  /** acciones custom (sin CRUD). Se ignoran si `crud` es true. */
  actions?: FeatureAction[];
};

export const CRUD_ACTIONS: FeatureAction[] = ['create', 'read', 'update', 'delete'];

const actionDescription: Record<FeatureAction, (label: string) => string> = {
  create: (label) => `Crear ${label.toLowerCase()}`,
  read: (label) => `Ver ${label.toLowerCase()}`,
  update: (label) => `Editar ${label.toLowerCase()}`,
  delete: (label) => `Eliminar ${label.toLowerCase()}`,
  manage: (label) => `Gestionar ${label.toLowerCase()}`,
  export: (label) => `Exportar ${label.toLowerCase()}`,
};

export function featureActions(feature: Feature): FeatureAction[] {
  if (feature.crud) return CRUD_ACTIONS;
  return feature.actions ?? [];
}

export function permissionKey(feature: Feature, action: FeatureAction): string {
  return `${feature.resource}:${action}`;
}

export function permissionDescription(
  feature: Feature,
  action: FeatureAction,
): string {
  return actionDescription[action](feature.label);
}

/**
 * Catálogo completo. Mantener orden estable: cada entrada ES una feature del
 * sistema. La adición de features nuevas debe pasar por acá ANTES de usarse
 * en las rutas protegidas.
 */
export const FEATURES: Feature[] = [
  { resource: 'socios', label: 'Socios', crud: true },
  { resource: 'aportes', label: 'Aportes', crud: true },
  { resource: 'multas', label: 'Multas', crud: true },
  { resource: 'egresos', label: 'Egresos', crud: true },
  { resource: 'reportes', label: 'Reportes', actions: ['read', 'export'] },
  { resource: 'config', label: 'Configuración', actions: ['read', 'update'] },
  { resource: 'usuarios', label: 'Usuarios', crud: true },
  { resource: 'roles', label: 'Roles', actions: ['read', 'manage'] },
  { resource: 'permisos', label: 'Permisos', actions: ['read', 'manage'] },
];

/** Aplana el catálogo a la forma de la tabla `permissions`. */
export function permissionsFromFeatures(features: Feature[] = FEATURES) {
  return features.flatMap((feature) =>
    featureActions(feature).map((action) => ({
      resource: feature.resource,
      action,
      description: permissionDescription(feature, action),
    })),
  );
}

export function findFeature(resource: string): Feature | undefined {
  return FEATURES.find((f) => f.resource === resource);
}
