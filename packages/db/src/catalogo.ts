// Catálogo compartido de acciones y estados de socio.
// Lo usan seed.ts y la migración SQL (0003) con los MISMOS ids fijos estables,
// para que el backfill por nombre mapee a las filas sembradas.

export type AccionCatalogo = {
  id: string;
  clave: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
};

// 7 acciones estables que tocan un socio en toda la app
export const ACCIONES_CATALOGO: AccionCatalogo[] = [
  { id: 'acc-asistencia', clave: 'asistencia', nombre: 'Asistencia', descripcion: null, orden: 1 },
  { id: 'acc-aportes', clave: 'aportes', nombre: 'Aportes', descripcion: null, orden: 2 },
  { id: 'acc-pagos', clave: 'pagos', nombre: 'Pagos', descripcion: null, orden: 3 },
  { id: 'acc-multas', clave: 'multas', nombre: 'Multas', descripcion: null, orden: 4 },
  {
    id: 'acc-anulaciones',
    clave: 'anulaciones',
    nombre: 'Anulaciones',
    descripcion: null,
    orden: 5,
  },
  { id: 'acc-reportes', clave: 'reportes', nombre: 'Reportes', descripcion: null, orden: 6 },
  { id: 'acc-dashboard', clave: 'dashboard', nombre: 'Dashboard', descripcion: null, orden: 7 },
];

export type EstadoCatalogo = {
  id: string;
  nombre: string;
  color: string;
  esActivo: number; // 0|1
  esBaja: number; // 0|1
  esDefecto: number; // 0|1
  orden: number;
};

// 4 estados: activo (todas las acciones, esActivo+esDefecto), suspendido (solo reportes),
// inactivo (ninguna, esBaja=0 — fila propia para el backfill legacy) y dado_de_baja (ninguna, esBaja=1)
export const ESTADOS_CATALOGO: EstadoCatalogo[] = [
  {
    id: 'est-activo',
    nombre: 'activo',
    color: '#22c55e',
    esActivo: 1,
    esBaja: 0,
    esDefecto: 1,
    orden: 1,
  },
  {
    id: 'est-suspendido',
    nombre: 'suspendido',
    color: '#f59e0b',
    esActivo: 0,
    esBaja: 0,
    esDefecto: 0,
    orden: 2,
  },
  {
    id: 'est-inactivo',
    nombre: 'inactivo',
    color: '#9ca3af',
    esActivo: 0,
    esBaja: 0,
    esDefecto: 0,
    orden: 3,
  },
  {
    id: 'est-baja',
    nombre: 'dado_de_baja',
    color: '#ef4444',
    esActivo: 0,
    esBaja: 1,
    esDefecto: 0,
    orden: 4,
  },
];

// M:N estado→acciones: activo permite todas; suspendido solo reportes; inactivo/baja ninguna
export const ESTADO_ACCIONES_CATALOGO: { estadoId: string; accionId: string }[] = [
  ...ACCIONES_CATALOGO.map((a) => ({ estadoId: 'est-activo', accionId: a.id })),
  { estadoId: 'est-suspendido', accionId: 'acc-reportes' },
];

export type AporteDefinicionCatalogo = {
  id: string;
  nombre: string;
  monto: number; // Bs, por registro
  recurrencia: string; // 'mensual' | 'anual' | 'unico' | 'extraordinario'
  inicio: string | null; // YYYY-MM-DD
  fin: string | null; // YYYY-MM-DD
  modalidadPago: string; // 'cuotas' | 'parciales' | 'pago_unico'
  aplicaGrupoId: string | null; // null = global
  activo: number; // 0|1
};

// 4 definiciones de aporte por defecto. Ids estables compartidos por seed.ts y
// la migración SQL (0005), para que el backfill de socio_aportes mapee a las
// mismas filas. `ap-mensual` es la definición activa por defecto.
export const APORTES_DEFINICION_SEED: AporteDefinicionCatalogo[] = [
  {
    id: 'ap-mensual',
    nombre: 'Cuota Social Mensual',
    monto: 50,
    recurrencia: 'mensual',
    inicio: null,
    fin: null,
    modalidadPago: 'cuotas',
    aplicaGrupoId: null,
    activo: 1,
  },
  {
    id: 'ap-familiar',
    nombre: 'Aporte Familiar',
    monto: 30,
    recurrencia: 'mensual',
    inicio: null,
    fin: null,
    modalidadPago: 'cuotas',
    aplicaGrupoId: null,
    activo: 1,
  },
  {
    id: 'ap-jubilado',
    nombre: 'Aporte Jubilado',
    monto: 25,
    recurrencia: 'mensual',
    inicio: null,
    fin: null,
    modalidadPago: 'cuotas',
    aplicaGrupoId: null,
    activo: 1,
  },
  {
    id: 'ap-honorario',
    nombre: 'Aporte Honorario',
    monto: 0,
    recurrencia: 'mensual',
    inicio: null,
    fin: null,
    modalidadPago: 'cuotas',
    aplicaGrupoId: null,
    activo: 1,
  },
];

// Mapeo de los ids legacy (`ta-*`) a las definiciones (`ap-*`) para el backfill
// de la migración 0005 y el seed.
export const APORTE_ID_POR_TIPO: Record<string, string> = {
  'ta-pleno': 'ap-mensual',
  'ta-familiar': 'ap-familiar',
  'ta-jubilado': 'ap-jubilado',
  'ta-honorario': 'ap-honorario',
};

// Id de la definición por monto (misma semántica que el viejo
// `idTipoAportePorMonto`): monto que coincide con una definición → esa; si no
// → la definición activa por defecto (`ap-mensual`).
export function idAportePorMonto(monto: number): string {
  const def = APORTES_DEFINICION_SEED.find((d) => d.monto === monto);
  return def?.id ?? APORTES_DEFINICION_SEED[0].id;
}

export function idEstadoPorNombre(nombre: string): string {
  const estado = ESTADOS_CATALOGO.find((e) => e.nombre === nombre);
  if (!estado) throw new Error(`Estado no encontrado en el catálogo: ${nombre}`);
  return estado.id;
}
