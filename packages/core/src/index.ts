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
  aporteBase: number;
  estado: 'activo' | 'inactivo' | 'suspendido';
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
  aportesPendientes: number;
  multasPendientesCount: number;
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
  socioIds: string[];
  tipo: 'mensual' | 'unico' | 'anual';
  montoBase: number;
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
