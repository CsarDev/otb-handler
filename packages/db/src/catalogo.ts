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

export function idEstadoPorNombre(nombre: string): string {
  const estado = ESTADOS_CATALOGO.find((e) => e.nombre === nombre);
  if (!estado) throw new Error(`Estado no encontrado en el catálogo: ${nombre}`);
  return estado.id;
}
