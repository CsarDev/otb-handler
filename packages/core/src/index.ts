export type Socio = {
  id: number;
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  ci: string;
  telefono: string;
  email: string;
  ocupacion: string;
  direccion: string;
  fechaNac: string;
  fechaIng: string;
  fechaAlta: string;
  aporteBase: number;
  estado: 'activo' | 'inactivo';
};

export type TipoActividad = {
  nombre: string;
  opciones: string[];
  multas: number[];
  tolerancia: number;
};

export type Actividad = {
  id: number;
  tipo: string;
  fecha: string;
  hora: string;
  descripcion: string;
};

export type Asistencia = {
  id: number;
  actividadId: number;
  socioId: number;
  tipoAsistencia: string;
  minutosTardanza: number;
  fechaReg: string;
};

export type Aporte = {
  id: number;
  socioId: number;
  mes: number;
  gestion: number;
  tipo: 'mensual' | 'individual' | 'anual';
  montoBase: number;
  numeroRecibo: string;
  fechaPago: string;
  estado: 'pagado' | 'pendiente';
};

export type Multa = {
  id: number;
  socioId: number;
  actividadId: number;
  concepto: string;
  monto: number;
  fechaGen: string;
  fechaPago: string;
  estado: 'pagado' | 'pendiente';
};

export type Movimiento = {
  id: number;
  tipo: 'aporte' | 'multa' | 'egreso';
  referenciaId: number;
  socioId: number;
  monto: number;
  numeroRecibo: string;
  nota: string;
  fecha: string;
};

export type Egreso = {
  id: number;
  categoria: string;
  beneficiario: string;
  monto: number;
  descripcion: string;
  fecha: string;
  numRecibo: string;
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
