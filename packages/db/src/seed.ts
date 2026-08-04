import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { randomUUID } from 'crypto';
import * as schema from './schema';
import {
  ACCIONES_CATALOGO,
  ESTADOS_CATALOGO,
  ESTADO_ACCIONES_CATALOGO,
  TIPOS_APORTE_CATALOGO,
  idEstadoPorNombre,
  idTipoAportePorMonto,
} from './catalogo';

const {
  tiposActividad,
  tiposAporte,
  socios,
  actividades,
  asistencia,
  aportes,
  multas,
  movimientos,
  egresos,
  modulesConfig,
  customFieldDefinitions,
  customFieldValues,
  estadosSocio,
  accionesSocio,
  estadoAcciones,
  grupos,
  socioGrupos,
} = schema;

const dbUrl = process.env.DB_URL ?? './otb.db';
const sqlite = new Database(dbUrl);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
const db = drizzle(sqlite, { schema });

function id() {
  return randomUUID();
}

function fecha(date: Date): string {
  return date.toISOString().split('T')[0];
}

function diasAtras(dias: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d;
}

function mesAnio(mes: number, gestion: number): Date {
  return new Date(gestion, mes - 1, 15);
}

// Backfill por nombre: socios del seed mapean su estado legacy al estadoId del catálogo
const esActivoPorEstado = new Map(ESTADOS_CATALOGO.map((e) => [e.id, e.esActivo === 1]));

const TIPO_IDS = {
  reunionOrdinaria: id(),
  reunionExtraordinaria: id(),
  trabajoComunitario: id(),
  eventoDeportivo: id(),
};

const tiposActividadData = [
  {
    id: TIPO_IDS.reunionOrdinaria,
    nombre: 'Reunión Ordinaria',
    opciones: JSON.stringify(['asistio', 'falta', 'tardanza', 'justificado']),
    multas: JSON.stringify([0, 10, 5, 0]),
    tolerancia: 15,
  },
  {
    id: TIPO_IDS.reunionExtraordinaria,
    nombre: 'Reunión Extraordinaria',
    opciones: JSON.stringify(['asistio', 'falta', 'tardanza', 'justificado']),
    multas: JSON.stringify([0, 20, 10, 0]),
    tolerancia: 10,
  },
  {
    id: TIPO_IDS.trabajoComunitario,
    nombre: 'Trabajo Comunitario',
    opciones: JSON.stringify(['asistio', 'falta', 'justificado']),
    multas: JSON.stringify([0, 30, 0]),
    tolerancia: 30,
  },
  {
    id: TIPO_IDS.eventoDeportivo,
    nombre: 'Evento Deportivo',
    opciones: JSON.stringify(['asistio', 'falta', 'tardanza', 'justificado']),
    multas: JSON.stringify([0, 15, 7, 0]),
    tolerancia: 20,
  },
];

const SOCIO_IDS = Array.from({ length: 15 }, () => id());

const GRUPO_IDS = {
  manzanoA: id(),
  manzanoB: id(),
  comiteDeportivo: id(),
};

const gruposData = [
  { id: GRUPO_IDS.manzanoA, nombre: 'Manzano A', descripcion: 'Bloque 1' },
  { id: GRUPO_IDS.manzanoB, nombre: 'Manzano B', descripcion: 'Bloque 2' },
  { id: GRUPO_IDS.comiteDeportivo, nombre: 'Comité Deportivo', descripcion: null },
];

const socioGruposData = [
  { socioId: SOCIO_IDS[0], grupoId: GRUPO_IDS.manzanoB },
  { socioId: SOCIO_IDS[1], grupoId: GRUPO_IDS.comiteDeportivo },
  { socioId: SOCIO_IDS[2], grupoId: GRUPO_IDS.manzanoB },
  { socioId: SOCIO_IDS[3], grupoId: GRUPO_IDS.manzanoA },
  { socioId: SOCIO_IDS[4], grupoId: GRUPO_IDS.comiteDeportivo },
];

const sociosData = [
  {
    nombre: 'Juan',
    apellidoPaterno: 'Mamani',
    apellidoMaterno: 'Quispe',
    ci: '1234567',
    telefono: '71234567',
    email: 'juan.mamani@email.com',
    ocupacion: 'Profesor',
    direccion: 'Av. Principal #123',
    fechaNac: '1985-03-15',
    fechaIng: '2020-01-10',
    fechaAlta: '2020-01-10',
    aporteBase: 30,
    grupoPrimarioId: GRUPO_IDS.manzanoA,
    estadoId: idEstadoPorNombre('activo'),
  },
  {
    nombre: 'María',
    apellidoPaterno: 'Flores',
    apellidoMaterno: 'Condori',
    ci: '2345678',
    telefono: '72234567',
    email: 'maria.flores@email.com',
    ocupacion: 'Comerciante',
    direccion: 'Calle Bolívar #456',
    fechaNac: '1990-07-22',
    fechaIng: '2021-03-15',
    fechaAlta: '2021-03-15',
    aporteBase: 30,
    grupoPrimarioId: GRUPO_IDS.manzanoB,
    estadoId: idEstadoPorNombre('activo'),
  },
  {
    nombre: 'Carlos',
    apellidoPaterno: 'García',
    apellidoMaterno: 'López',
    ci: '3456789',
    telefono: '73234567',
    email: 'carlos.garcia@email.com',
    ocupacion: 'Chofer',
    direccion: 'Zona Central #789',
    fechaNac: '1982-11-08',
    fechaIng: '2019-06-01',
    fechaAlta: '2019-06-01',
    aporteBase: 25,
    grupoPrimarioId: GRUPO_IDS.manzanoA,
    estadoId: idEstadoPorNombre('activo'),
  },
  {
    nombre: 'Ana',
    apellidoPaterno: 'Rodríguez',
    apellidoMaterno: 'Morales',
    ci: '4567890',
    telefono: '74234567',
    email: 'ana.rodriguez@email.com',
    ocupacion: 'Enfermera',
    direccion: 'Barrio Norte #321',
    fechaNac: '1993-05-30',
    fechaIng: '2022-01-20',
    fechaAlta: '2022-01-20',
    aporteBase: 30,
    grupoPrimarioId: GRUPO_IDS.comiteDeportivo,
    estadoId: idEstadoPorNombre('activo'),
  },
  {
    nombre: 'Pedro',
    apellidoPaterno: 'Quispe',
    apellidoMaterno: null,
    ci: '5678901',
    telefono: '75234567',
    email: null,
    ocupacion: 'Albañil',
    direccion: 'Villa Dolores #654',
    fechaNac: '1978-09-12',
    fechaIng: '2018-04-05',
    fechaAlta: '2018-04-05',
    aporteBase: 20,
    estadoId: idEstadoPorNombre('activo'),
  },
  {
    nombre: 'Rosa',
    apellidoPaterno: 'Mendoza',
    apellidoMaterno: 'Pari',
    ci: '6789012',
    telefono: '76234567',
    email: 'rosa.mendoza@email.com',
    ocupacion: 'Ama de casa',
    direccion: 'Calle Sucre #987',
    fechaNac: '1987-12-25',
    fechaIng: '2020-08-15',
    fechaAlta: '2020-08-15',
    aporteBase: 30,
    estadoId: idEstadoPorNombre('activo'),
  },
  {
    nombre: 'Luis',
    apellidoPaterno: 'Vargas',
    apellidoMaterno: 'Cruz',
    ci: '7890123',
    telefono: '77234567',
    email: 'luis.vargas@email.com',
    ocupacion: 'Mecánico',
    direccion: 'Av. 6 de Agosto #147',
    fechaNac: '1980-04-18',
    fechaIng: '2019-11-01',
    fechaAlta: '2019-11-01',
    aporteBase: 25,
    estadoId: idEstadoPorNombre('inactivo'),
  },
  {
    nombre: 'Carmen',
    apellidoPaterno: 'Torres',
    apellidoMaterno: 'Mamani',
    ci: '8901234',
    telefono: '78234567',
    email: null,
    ocupacion: 'Tejedora',
    direccion: 'Zona Sur #258',
    fechaNac: '1995-08-03',
    fechaIng: '2023-02-10',
    fechaAlta: '2023-02-10',
    aporteBase: 30,
    estadoId: idEstadoPorNombre('activo'),
  },
  {
    nombre: 'Jorge',
    apellidoPaterno: 'Paredes',
    apellidoMaterno: 'Rojas',
    ci: '9012345',
    telefono: '79234567',
    email: 'jorge.paredes@email.com',
    ocupacion: 'Carpintero',
    direccion: 'Calle Potosí #369',
    fechaNac: '1975-06-20',
    fechaIng: '2017-07-15',
    fechaAlta: '2017-07-15',
    aporteBase: 20,
    estadoId: idEstadoPorNombre('suspendido'),
  },
  {
    nombre: 'Elena',
    apellidoPaterno: 'Castro',
    apellidoMaterno: 'Apaza',
    ci: '0123456',
    telefono: '70234567',
    email: 'elena.castro@email.com',
    ocupacion: 'Abogada',
    direccion: 'Edificio Central #501',
    fechaNac: '1988-01-14',
    fechaIng: '2021-05-20',
    fechaAlta: '2021-05-20',
    aporteBase: 35,
    estadoId: idEstadoPorNombre('activo'),
  },
  {
    nombre: 'David',
    apellidoPaterno: 'Choque',
    apellidoMaterno: 'Huanca',
    ci: '1122334',
    telefono: '71223344',
    email: null,
    ocupacion: 'Agricultor',
    direccion: 'Comunidad Alto #111',
    fechaNac: '1972-10-05',
    fechaIng: '2018-02-28',
    fechaAlta: '2018-02-28',
    aporteBase: 20,
    estadoId: idEstadoPorNombre('inactivo'),
  },
  {
    nombre: 'Sofia',
    apellidoPaterno: 'Ramos',
    apellidoMaterno: 'Paco',
    ci: '2233445',
    telefono: '72233445',
    email: 'sofia.ramos@email.com',
    ocupacion: 'Estudiante',
    direccion: 'Calle Junín #222',
    fechaNac: '2000-09-15',
    fechaIng: '2024-01-08',
    fechaAlta: '2024-01-08',
    aporteBase: 25,
    estadoId: idEstadoPorNombre('activo'),
  },
  {
    nombre: 'Roberto',
    apellidoPaterno: 'Callisaya',
    apellidoMaterno: 'Mamani',
    ci: '3344556',
    telefono: '73234456',
    email: 'roberto.c@email.com',
    ocupacion: 'Policía',
    direccion: 'Av. 16 de Julio #333',
    fechaNac: '1983-03-28',
    fechaIng: '2020-09-12',
    fechaAlta: '2020-09-12',
    aporteBase: 30,
    estadoId: idEstadoPorNombre('activo'),
  },
  {
    nombre: 'Lucia',
    apellidoPaterno: 'Yujra',
    apellidoMaterno: 'Quispe',
    ci: '4455667',
    telefono: '74234556',
    email: 'lucia.yujra@email.com',
    ocupacion: 'Profesora',
    direccion: 'Zona Este #444',
    fechaNac: '1991-07-07',
    fechaIng: '2022-06-01',
    fechaAlta: '2022-06-01',
    aporteBase: 30,
    estadoId: idEstadoPorNombre('activo'),
  },
  {
    nombre: 'Miguel',
    apellidoPaterno: 'Arias',
    apellidoMaterno: 'Condori',
    ci: '5566778',
    telefono: '75234456',
    email: null,
    ocupacion: 'Electricista',
    direccion: 'Calle Linares #555',
    fechaNac: '1986-11-30',
    fechaIng: '2019-04-22',
    fechaAlta: '2019-04-22',
    aporteBase: 25,
    estadoId: idEstadoPorNombre('activo'),
  },
];

const ACTIVIDAD_IDS = Array.from({ length: 10 }, () => id());

const actividadesData = [
  {
    id: ACTIVIDAD_IDS[0],
    tipoId: TIPO_IDS.reunionOrdinaria,
    fecha: '2025-01-15',
    hora: '19:00',
    descripcion: 'Primera reunión del año - Planificación',
  },
  {
    id: ACTIVIDAD_IDS[1],
    tipoId: TIPO_IDS.reunionOrdinaria,
    fecha: '2025-02-12',
    hora: '19:00',
    descripcion: 'Reunión mensual - Informe de tesorería',
  },
  {
    id: ACTIVIDAD_IDS[2],
    tipoId: TIPO_IDS.trabajoComunitario,
    fecha: '2025-02-22',
    hora: '08:00',
    descripcion: 'Limpieza y mantenimiento de áreas verdes',
  },
  {
    id: ACTIVIDAD_IDS[3],
    tipoId: TIPO_IDS.reunionExtraordinaria,
    fecha: '2025-03-05',
    hora: '18:30',
    descripcion: 'Reunión extraordinaria - Proyecto de agua potable',
  },
  {
    id: ACTIVIDAD_IDS[4],
    tipoId: TIPO_IDS.reunionOrdinaria,
    fecha: '2025-03-19',
    hora: '19:00',
    descripcion: 'Reunión mensual',
  },
  {
    id: ACTIVIDAD_IDS[5],
    tipoId: TIPO_IDS.eventoDeportivo,
    fecha: '2025-04-06',
    hora: '09:00',
    descripcion: 'Campeonato de fútbol inter-barrial',
  },
  {
    id: ACTIVIDAD_IDS[6],
    tipoId: TIPO_IDS.reunionOrdinaria,
    fecha: '2025-04-16',
    hora: '19:00',
    descripcion: 'Reunión mensual - Rendición de cuentas',
  },
  {
    id: ACTIVIDAD_IDS[7],
    tipoId: TIPO_IDS.trabajoComunitario,
    fecha: '2025-05-03',
    hora: '08:00',
    descripcion: 'Reforestación de la plaza principal',
  },
  {
    id: ACTIVIDAD_IDS[8],
    tipoId: TIPO_IDS.reunionOrdinaria,
    fecha: '2025-05-21',
    hora: '19:00',
    descripcion: 'Reunión mensual - Elección de directiva',
  },
  {
    id: ACTIVIDAD_IDS[9],
    tipoId: TIPO_IDS.eventoDeportivo,
    fecha: '2025-06-15',
    hora: '10:00',
    descripcion: 'Maratón familiar Villa Esperanza',
  },
];

function genAsistencia(socioIdx: number, actIdx: number): { tipo: string; minTardanza: number } {
  const r = Math.random();
  if (r < 0.1) return { tipo: 'justificado', minTardanza: 0 };
  if (r < 0.25) return { tipo: 'falta', minTardanza: 0 };
  if (r < 0.35) return { tipo: 'tardanza', minTardanza: Math.floor(Math.random() * 20) + 5 };
  return { tipo: 'asistio', minTardanza: 0 };
}

function genAportes() {
  const data: (typeof schema.aportes.$inferInsert)[] = [];
  const gestionActual = 2025;
  for (let g = gestionActual - 1; g <= gestionActual; g++) {
    const hastaMes = g === gestionActual ? 6 : 12;
    for (let m = 1; m <= hastaMes; m++) {
      for (const s of sociosData) {
        if (!esActivoPorEstado.get(s.estadoId)) continue;
        const pago = Math.random() > 0.35;
        const fechaPago = pago
          ? fecha(new Date(g, m - 1, Math.floor(Math.random() * 20) + 5))
          : null;
        const montoBase = s.aporteBase;
        data.push({
          id: id(),
          socioId: SOCIO_IDS[sociosData.indexOf(s)],
          mes: m,
          gestion: g,
          tipo: 'mensual',
          montoBase,
          montoPagado: pago ? montoBase : 0,
          saldoPendiente: pago ? 0 : montoBase,
          numeroRecibo: pago
            ? `REC-${g}-${String(m).padStart(2, '0')}-${String(sociosData.indexOf(s) + 1).padStart(3, '0')}`
            : null,
          fechaPago,
          estado: pago ? 'pagado' : 'pendiente',
        });
      }
    }
  }
  return data;
}

function genMovimientos(aportesData: (typeof schema.aportes.$inferInsert)[]) {
  return aportesData
    .filter((a) => a.estado === 'pagado')
    .map((a) => ({
      id: id(),
      tipo: 'ingreso' as const,
      referenciaId: a.id,
      socioId: a.socioId,
      monto: a.montoBase,
      numeroRecibo: a.numeroRecibo,
      nota: `Aporte mensual ${a.mes}/${a.gestion}`,
      fecha: a.fechaPago!,
    }));
}

function genMultas() {
  const data: (typeof schema.multas.$inferInsert)[] = [];
  data.push({
    id: id(),
    socioId: SOCIO_IDS[2],
    actividadId: ACTIVIDAD_IDS[1],
    concepto: 'Falta a reunión ordinaria sin justificación',
    monto: 10,
    montoPagado: 10,
    saldoPendiente: 0,
    fechaGen: '2025-02-12',
    fechaPago: '2025-02-20',
    estado: 'pagado',
  });
  data.push({
    id: id(),
    socioId: SOCIO_IDS[7],
    actividadId: ACTIVIDAD_IDS[3],
    concepto: 'Tardanza a reunión extraordinaria',
    monto: 5,
    montoPagado: 5,
    saldoPendiente: 0,
    fechaGen: '2025-03-05',
    fechaPago: '2025-03-10',
    estado: 'pagado',
  });
  data.push({
    id: id(),
    socioId: SOCIO_IDS[4],
    actividadId: null,
    concepto: 'No asistió a trabajo comunitario programado',
    monto: 30,
    montoPagado: 0,
    saldoPendiente: 30,
    fechaGen: '2025-02-22',
    fechaPago: null,
    estado: 'pendiente',
  });
  data.push({
    id: id(),
    socioId: SOCIO_IDS[10],
    actividadId: ACTIVIDAD_IDS[7],
    concepto: 'Falta a jornada de reforestación',
    monto: 30,
    montoPagado: 0,
    saldoPendiente: 30,
    fechaGen: '2025-05-03',
    fechaPago: null,
    estado: 'pendiente',
  });
  data.push({
    id: id(),
    socioId: SOCIO_IDS[0],
    actividadId: ACTIVIDAD_IDS[5],
    concepto: 'No participó en campeonato deportivo',
    monto: 15,
    montoPagado: 15,
    saldoPendiente: 0,
    fechaGen: '2025-04-06',
    fechaPago: '2025-04-15',
    estado: 'pagado',
  });
  return data;
}

function genMovimientosMultas(multasData: (typeof schema.multas.$inferInsert)[]) {
  return multasData
    .filter((m) => m.estado === 'pagado')
    .map((m) => ({
      id: id(),
      tipo: 'ingreso' as const,
      referenciaId: m.id,
      socioId: m.socioId,
      monto: m.monto,
      numeroRecibo: null,
      nota: `Multa: ${m.concepto}`,
      fecha: m.fechaPago!,
    }));
}

const egresosData = [
  {
    id: id(),
    categoria: 'Servicios',
    beneficiario: 'Cooperativa de Agua',
    monto: 150,
    descripcion: 'Pago agua meses enero-febrero',
    fecha: '2025-02-28',
    numRecibo: 'EG-2025-001',
  },
  {
    id: id(),
    categoria: 'Servicios',
    beneficiario: 'ELFE',
    monto: 85,
    descripcion: 'Pago luz marzo',
    fecha: '2025-03-15',
    numRecibo: 'EG-2025-002',
  },
  {
    id: id(),
    categoria: 'Mantenimiento',
    beneficiario: 'Ferretería La Paz',
    monto: 230,
    descripcion: 'Materiales para reparación sede',
    fecha: '2025-03-20',
    numRecibo: 'EG-2025-003',
  },
  {
    id: id(),
    categoria: 'Eventos',
    beneficiario: 'Comité Deportivo',
    monto: 300,
    descripcion: 'Refrigerios y premios campeonato',
    fecha: '2025-04-06',
    numRecibo: 'EG-2025-004',
  },
  {
    id: id(),
    categoria: 'Mantenimiento',
    beneficiario: 'Vivero Municipal',
    monto: 120,
    descripcion: 'Plantas para reforestación',
    fecha: '2025-05-03',
    numRecibo: 'EG-2025-005',
  },
  {
    id: id(),
    categoria: 'Administrativo',
    beneficiario: 'Papelería CopiCenter',
    monto: 45,
    descripcion: 'Útiles de oficina y fotocopias',
    fecha: '2025-05-10',
    numRecibo: 'EG-2025-006',
  },
];

function genMovimientosEgresos() {
  return egresosData.map((e) => ({
    id: id(),
    tipo: 'egreso' as const,
    referenciaId: e.id,
    socioId: null,
    monto: e.monto,
    numeroRecibo: e.numRecibo,
    nota: `${e.categoria}: ${e.descripcion}`,
    fecha: e.fecha,
  }));
}

const modulesConfigData = [
  {
    id: id(),
    moduleName: 'otb-core',
    enabled: true,
    config: JSON.stringify({
      nombreOTB: 'OTB Villa Esperanza',
      gestionActual: 2025,
      aporteMensualBase: 30,
      diasGraciaAporte: 10,
      toleranciaMinutos: 15,
    }),
  },
  { id: id(), moduleName: 'socios', enabled: true, config: JSON.stringify({ version: '1.0.0' }) },
  {
    id: id(),
    moduleName: 'asistencia',
    enabled: true,
    config: JSON.stringify({ version: '1.0.0' }),
  },
  { id: id(), moduleName: 'aportes', enabled: true, config: JSON.stringify({ version: '1.0.0' }) },
  { id: id(), moduleName: 'multas', enabled: true, config: JSON.stringify({ version: '1.0.0' }) },
  { id: id(), moduleName: 'egresos', enabled: true, config: JSON.stringify({ version: '1.0.0' }) },
  { id: id(), moduleName: 'reportes', enabled: true, config: JSON.stringify({ version: '1.0.0' }) },
];

async function main() {
  console.log('Seeding database...');
  const start = Date.now();

  const tables = [
    'custom_field_values',
    'custom_field_definitions',
    'modules_config',
    'estado_acciones',
    'socio_grupos',
    'movimientos',
    'multas',
    'egresos',
    'asistencia',
    'aportes',
    'actividades',
    'socios',
    'grupos',
    'estados_socio',
    'acciones_socio',
    'tipos_actividad',
    'tipos_aporte',
  ];

  for (const t of tables) {
    sqlite.exec(`DELETE FROM ${t}`);
  }

  db.insert(tiposActividad).values(tiposActividadData).run();
  console.log(`  ${tiposActividadData.length} tipos de actividad`);

  db.insert(tiposAporte).values(TIPOS_APORTE_CATALOGO).run();
  console.log(`  ${TIPOS_APORTE_CATALOGO.length} tipos de aporte`);

  db.insert(accionesSocio).values(ACCIONES_CATALOGO).run();
  console.log(`  ${ACCIONES_CATALOGO.length} acciones de socio`);

  db.insert(estadosSocio).values(ESTADOS_CATALOGO).run();
  console.log(`  ${ESTADOS_CATALOGO.length} estados de socio`);

  db.insert(estadoAcciones).values(ESTADO_ACCIONES_CATALOGO).run();
  console.log(`  ${ESTADO_ACCIONES_CATALOGO.length} mappings estado-accion`);

  db.insert(grupos).values(gruposData).run();
  console.log(`  ${gruposData.length} grupos`);

  // Asignación de tipo de aporte por monto (mismo mapeo que el backfill de la
  // migración 0004): aporte_base que coincide con un montoBase → ese tipo,
  // si no → tipo activo por defecto (ta-pleno).
  const sociosValues = sociosData.map((s, i) => ({
    ...s,
    id: SOCIO_IDS[i],
    tipoAporteId: idTipoAportePorMonto(s.aporteBase),
  }));
  db.insert(socios).values(sociosValues).run();
  console.log(`  ${sociosValues.length} socios`);

  db.insert(actividades).values(actividadesData).run();
  console.log(`  ${actividadesData.length} actividades`);

  for (let ai = 0; ai < actividadesData.length; ai++) {
    const asistencias = sociosData
      .map((s, si) => {
        if (!esActivoPorEstado.get(s.estadoId)) {
          return null;
        }
        const at = genAsistencia(si, ai);
        return {
          id: id(),
          actividadId: ACTIVIDAD_IDS[ai],
          socioId: SOCIO_IDS[si],
          tipoAsistencia: at.tipo as 'asistio' | 'falta' | 'tardanza' | 'justificado',
          minutosTardanza: at.minTardanza,
          fechaReg: actividadesData[ai].fecha,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    db.insert(asistencia).values(asistencias).run();
  }
  console.log(`  Asistencia registrada para ${actividadesData.length} actividades`);

  const aportesData = genAportes();
  db.insert(aportes).values(aportesData).run();
  console.log(`  ${aportesData.length} aportes`);

  const multasData = genMultas();
  db.insert(multas).values(multasData).run();
  console.log(`  ${multasData.length} multas`);

  const movsAportes = genMovimientos(aportesData);
  const movsMultas = genMovimientosMultas(multasData);
  const movsEgresos = genMovimientosEgresos();
  const movimientosData = [...movsAportes, ...movsMultas, ...movsEgresos];
  db.insert(movimientos).values(movimientosData).run();
  console.log(`  ${movimientosData.length} movimientos`);

  db.insert(egresos).values(egresosData).run();
  console.log(`  ${egresosData.length} egresos`);

  db.insert(modulesConfig).values(modulesConfigData).run();
  console.log(`  ${modulesConfigData.length} módulos configurados`);

  db.insert(socioGrupos).values(socioGruposData).run();
  console.log(`  ${socioGruposData.length} membresías de grupo adicionales`);

  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`\nSeed complete in ${elapsed}s`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
