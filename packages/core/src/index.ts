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
  tipo: 'mensual' | 'extraordinario';
  montoBase: number;
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
  totalIngresos: number;
  totalEgresos: number;
  neto: number;
  desglose: Array<{ categoria: string; monto: number }>;
};

export type LibroDiarioEntry = Movimiento & {
  socioNombre: string | null;
  socioApellido: string | null;
};

export type ResumenSocioReport = {
  totalAportado: number;
  multasPagadas: number;
  saldoPendiente: number;
  socio: { id: string; nombre: string; apellidoPaterno: string };
};

export type PagoParcialRequest = {
  monto: number;
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
