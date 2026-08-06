export type EstadoSocio = {
  id: string;
  nombre: string;
  color: string; // hex usado en badges/filtros
  esActivo: number; // 0|1
  esBaja: number; // 0|1
  esDefecto: number; // 0|1
  orden: number;
  accionIds: string[]; // M:N aplanada en la respuesta
};

export type AccionSocio = {
  id: string;
  clave: string; // slug estable: 'asistencia', 'pagos'...
  nombre: string;
  descripcion: string | null;
  orden: number;
};

export type Grupo = {
  id: string;
  nombre: string;
  descripcion: string | null;
};

export type Recurrencia = 'mensual' | 'anual' | 'unico' | 'extraordinario';

export type ModalidadPago = 'cuotas' | 'parciales' | 'pago_unico';

/** Aporte = DEFINICIÓN de aporte (era `TipoAporte`). El aporte ES la definición dinámica. */
export type Aporte = {
  id: string; // slug del cliente, p.ej. 'ap-mensual'; inmutable
  nombre: string;
  monto: number; // Bs, >= 0
  recurrencia: Recurrencia;
  inicio: string | null; // YYYY-MM-DD
  fin: string | null; // YYYY-MM-DD; fin >= inicio cuando ambos están seteados
  modalidadPago: ModalidadPago;
  grupoIds: string[]; // M:N vía `aportes_definicion_grupos`; [] = global (antes aplicaGrupoId: string | null)
  activo: number; // 0|1
};

export type AporteInput = {
  nombre: string;
  monto: number;
  recurrencia?: Recurrencia; // default 'mensual' (D6)
  inicio?: string | null;
  fin?: string | null;
  modalidadPago?: ModalidadPago; // default 'cuotas' (D4)
  grupoIds?: string[]; // ausente/[] = global; cada id DEBE existir (400 si no) — antes aplicaGrupoId?
  activo?: number; // default 1
  socioIds?: string[]; // asignación directa (multiselect); cada id debe existir (D18)
};

/**
 * Item de generación (ya devuelto por los endpoints manuales de generación;
 * movido a core para compartirlo con la creación unificada, D15).
 */
export type AporteGenerado = {
  id: string;
  socioId: string;
  aporteId: string | null;
  mes: number;
  gestion: number;
  tipo: string;
  montoBase: number;
};

export type GeneracionResult = { count: number; items: AporteGenerado[] };

/** Respuesta 201 de POST /api/aportes-definicion (D15): catálogo completo + solo filas NUEVAS (D13). */
export type CrearDefinicionResponse = {
  definiciones: Aporte[];
  generados: GeneracionResult;
};

/**
 * APORTE_REGISTRO / cobro (renombre del viejo tipo record `Aporte`).
 * `aporteId` es la linaje a la definición (nullable para registros legacy).
 */
export type AporteRegistro = {
  id: string;
  socioId: string;
  aporteId: string | null; // FK → aportes_definicion
  socioNombre?: string | null;
  socioApellido?: string | null; // join
  mes: number | null;
  gestion: number | null;
  tipo: string; // denormalizado de recurrencia (D2)
  montoBase: number; // snapshot de definition.monto (D2)
  montoPagado: number;
  saldoPendiente: number;
  razonAnulacion: string | null;
  numeroRecibo: string | null;
  fechaPago: string | null;
  estado: 'pendiente' | 'pagado' | 'anulado';
};

export type Cobro = AporteRegistro;

export type SocioAporte = { socioId: string; aporteId: string };

export type AporteInherited = { id: string; nombre: string; grupoId: string; grupoNombre: string };

export type SocioGrupo = {
  socioId: string;
  grupoId: string;
};

export type Socio = {
  id: string;
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  ci: string | null;
  telefono: string | null;
  email: string | null;
  ocupacion: string | null;
  direccion: string | null;
  fechaNac: string | null;
  fechaIng: string | null;
  fechaAlta: string | null;
  aporteIds: string[]; // asignaciones directas (editables) → socio_aportes
  aportesInherited: AporteInherited[]; // read-only, resueltas dinámicamente por grupo (D5)
  estadoId: string | null;
  estadoNombre: string | null; // vía join, solo en respuestas
  estadoColor: string | null; // vía join, solo en respuestas
  esActivo: number; // vía join, solo en respuestas
  grupoPrimarioId: string | null;
  grupos: { id: string; nombre: string }[]; // adicionales, en respuestas
  motivoBaja: string | null;
  fechaBaja: string | null;
  generados?: { count: number }; // response-only en POST/PUT save (D16): solo filas NUEVAS
};

/** Shape de POST/PUT de socio con la cuenta de cobros generados en la transacción (D16). */
export type SocioConGeneracion = Socio & { generados: { count: number } };

// Input de POST/PUT de socio: `aporteIds` es opcional en el input (omitiéndolo
// el PUT PRESERVA la asignación; ausente/[] en POST = sin asignación directa).
export type SocioInput = Omit<
  Socio,
  | 'estadoNombre'
  | 'estadoColor'
  | 'esActivo'
  | 'grupos'
  | 'aporteIds'
  | 'aportesInherited'
> & {
  aporteIds?: string[]; // ONE OR MORE; omitido en PUT preserva
  grupoAdicionalIds?: string[]; // payload de POST/PUT
};

export type EstadoSocioInput = {
  nombre: string;
  color?: string;
  esActivo?: number;
  esBaja?: number;
  esDefecto?: number;
  orden?: number;
  accionIds?: string[]; // default = todas las acciones si se omite
};

export type EstadoAccionesRequest = {
  accionIds: string[];
};

export type AccionSocioInput = {
  clave: string;
  nombre: string;
  descripcion?: string | null;
  orden?: number;
};

export type GrupoInput = {
  nombre: string;
  descripcion?: string | null;
};

export type BajaSocioRequest = {
  motivo: string;
};

export type TipoActividad = {
  id: string;
  nombre: string;
  opciones: string;
  multas: string | null;
  tolerancia: number;
};

export type Actividad = {
  id: string;
  tipoId: string;
  tipoNombre: string | null;
  fecha: string;
  hora: string | null;
  descripcion: string | null;
};

export type Asistencia = {
  id: string;
  actividadId: string;
  socioId: string;
  tipoAsistencia: 'asistio' | 'falta' | 'tardanza' | 'justificado';
  minutosTardanza: number;
  fechaReg: string;
};

/** Envelope paginado compartido (D33) — GET /api/multas y GET /api/aportes. */
export type Paginated<T> = {
  items: T[];
  total: number; // COUNT de TODAS las filas que matchean los filtros (antes de paginar)
  page: number; // echo del page efectivo
  pageSize: number; // echo del pageSize efectivo (clamped)
};

export type Multa = {
  id: string;
  socioId: string;
  socioNombre: string | null;
  socioApellido: string | null;
  actividadId: string | null;
  concepto: string;
  monto: number;
  montoPagado: number;
  saldoPendiente: number;
  razonAnulacion: string | null;
  fechaGen: string;
  fechaPago: string | null;
  estado: 'pendiente' | 'pagado' | 'anulado';
};

export type Movimiento = {
  id: string;
  tipo: 'ingreso' | 'egreso';
  referenciaId: string | null;
  socioId: string | null;
  monto: number;
  numeroRecibo: string | null;
  nota: string | null;
  fecha: string;
  anulado: number;
  razonAnulacion: string | null;
};

export type Egreso = {
  id: string;
  categoria: string;
  beneficiario: string;
  monto: number;
  descripcion: string | null;
  fecha: string;
  numRecibo: string | null;
};

export type BalanceReport = {
  gestion: number;
  mes: number;
  ingresos: number;
  egresos: number;
  neto: number;
  ingresosPorCategoria: Array<{ categoria: string; total: number }>;
  egresosPorCategoria: Array<{ categoria: string; total: number }>;
};

export type LibroDiarioEntry = Movimiento & {
  socioNombre: string | null;
  socioApellido: string | null;
};

export type ResumenSocioReport = {
  socio: { id: string; nombre: string; apellido: string };
  totalAportado: number;
  multasPagadas: number;
  saldoPendienteMultas: number;
  aportesPendientes: (AporteRegistro & { socioNombre: string | null; socioApellido: string | null })[];
  multasPendientes: (Multa & { socioNombre: string | null; socioApellido: string | null })[];
};

export type PagoParcialRequest = {
  monto: number;
};

export type BulkMultaRequest = {
  socioIds?: string[]; // opcional — requerido SOLO si grupoIds ausente/vacío (D36)
  grupoIds?: string[]; // NUEVO — opcional; [] = sin aporte de grupos (D36)
  concepto: string;
  monto: number;
  actividadId?: string;
  fecha?: string;
};

/** Respuesta 201 de POST /api/multas/bulk (D36) — shape SIN cambios. */
export type BulkMultaResponse = { count: number; items: Multa[] };

/** Definition-driven (D8): NO monto / NO tipo override (D9). */
export type BulkAporteRequest = {
  socioIds?: string[]; // omitido en /bulk/all (se resuelven todos los permitidos)
  aporteIds: string[]; // ONE OR MORE definiciones activas
  gestion: number;
  mes?: number; // cota inferior opcional para mensual
};

export type CrearAporteRequest = {
  socioId: string;
  aporteId: string;
  gestion: number;
  mes?: number;
};

export type AnularRequest = {
  razon: string;
};

export type OTBConfig = {
  nombreOTB: string;
  gestionActual: number;
  aporteMensualBase: number;
  diasGraciaAporte: number;
  toleranciaMinutos: number;
};

export type DBData = {
  config: OTBConfig;
  socios: Socio[];
  tiposActividad: TipoActividad[];
  actividades: Actividad[];
  asistencia: Asistencia[];
  aportes: AporteRegistro[];
  multas: Multa[];
  movimientos: Movimiento[];
  egresos: Egreso[];
};

export type ModuleConfig = {
  moduleName: string;
  enabled: boolean;
  config: Record<string, unknown>;
};

export function calcularEdad(fechaNac: string): number {
  const hoy = new Date();
  const nac = new Date(fechaNac);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const mes = hoy.getMonth() - nac.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nac.getDate())) {
    edad--;
  }
  return edad;
}

export function formatearFecha(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function formatearMoneda(monto: number): string {
  return `Bs ${monto.toFixed(2)}`;
}

/**
 * Predicado puro (sin DB): resuelve si el estado del socio permite una acción.
 * `clavesPermitidas` es el Set<clave> de acciones del estado del socio,
 * cargado una sola vez por request (ver packages/api/src/lib/permisos.ts).
 */
export function socioPermite(
  clavesPermitidas: ReadonlySet<string>, // Set<clave> del estado del socio
  accionClave: string,
): boolean {
  return clavesPermitidas.has(accionClave);
}
