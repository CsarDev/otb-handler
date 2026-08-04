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

export type TipoAporte = {
  id: string;
  nombre: string;
  montoBase: number;
  descripcion: string | null;
  activo: number; // 0|1
};

export type TipoAporteInput = {
  nombre: string;
  montoBase: number;
  descripcion?: string | null;
  activo?: number; // 0|1
};

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
  // Derivado del tipo asignado (tipoAporteId) — NO es una fuente de verdad
  // propia; se expone en el response para compat con lecturas legacy/UI.
  aporteBase: number;
  // Vía FK a tipos_aporte.id; nullable durante la transición. La API lo
  // garantiza en POST/PUT (default al tipo activo).
  tipoAporteId?: string | null;
  tipoAporteNombre?: string | null; // vía join, solo en respuestas
  estadoId: string | null;
  estadoNombre: string | null; // vía join, solo en respuestas
  estadoColor: string | null; // vía join, solo en respuestas
  esActivo: number; // vía join, solo en respuestas
  grupoPrimarioId: string | null;
  grupos: { id: string; nombre: string }[]; // adicionales, en respuestas
  motivoBaja: string | null;
  fechaBaja: string | null;
};

// Input de POST/PUT de socio: `aporteBase` NO es escribible (derivado del tipo);
// `tipoAporteId` es opcional y default al tipo activo si se omite.
export type SocioInput = Omit<
  Socio,
  'estadoNombre' | 'estadoColor' | 'esActivo' | 'grupos' | 'tipoAporteNombre' | 'aporteBase'
> & {
  tipoAporteId?: string;
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

export type Aporte = {
  id: string;
  socioId: string;
  socioNombre: string | null;
  socioApellido: string | null;
  mes: number | null;
  gestion: number | null;
  tipo: string;
  montoBase: number;
  montoPagado: number;
  saldoPendiente: number;
  razonAnulacion: string | null;
  numeroRecibo: string | null;
  fechaPago: string | null;
  estado: 'pendiente' | 'pagado' | 'anulado';
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
  aportesPendientes: (Aporte & { socioNombre: string | null; socioApellido: string | null })[];
  multasPendientes: (Multa & { socioNombre: string | null; socioApellido: string | null })[];
};

export type PagoParcialRequest = {
  monto: number;
};

export type BulkMultaRequest = {
  socioIds: string[];
  concepto: string;
  monto: number;
  actividadId?: string;
  fecha?: string;
};

export type BulkAporteRequest = {
  socioIds?: string[]; // omitido en /bulk/all (se resuelven todos los permitidos)
  tipo: 'mensual' | 'unico' | 'anual' | 'extraordinario';
  monto?: number; // override, SOLO unico/extraordinario
  montoBase?: number; // legacy del cliente; se deriva del tipo del socio por defecto
  gestion: number;
  mes?: number;
  meses?: number;
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
  aportes: Aporte[];
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
