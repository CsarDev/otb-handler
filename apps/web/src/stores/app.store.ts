import { create } from 'zustand';
import type {
  Socio,
  SocioInput,
  SocioConGeneracion,
  Aporte,
  AporteInput,
  AporteRegistro,
  GeneracionResult,
  CrearDefinicionResponse,
  Multa,
  Movimiento,
  Egreso,
  Actividad,
  Asistencia,
  TipoActividad,
  OTBConfig,
  BalanceReport,
  Paginated,
  BulkAporteRequest,
  BulkMultaRequest,
  BulkMultaResponse,
  CrearAporteRequest,
  LibroDiarioEntry,
  ResumenSocioReport,
  EstadoSocio,
  AccionSocio,
  Grupo,
  EstadoSocioInput,
  AccionSocioInput,
  GrupoInput,
} from '@otb/core';
import { DEFAULT_PAGE_SIZE_OPTIONS } from '@otb/core';

const BASE = '/api';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(body.error ?? res.statusText, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

type AporteFilters = {
  socioId?: string;
  mes?: string;
  gestion?: string;
  estado?: string;
  tipo?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  estadoId?: string;
  grupoId?: string;
};
type MultaFilters = {
  socioId?: string;
  estado?: string;
  actividadId?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  gestion?: string;
  estadoId?: string;
  grupoId?: string;
};
type EgresoFilters = { categoria?: string; fechaDesde?: string; fechaHasta?: string };
type LibroDiarioFilters = {
  fechaDesde?: string;
  fechaHasta?: string;
  gestion?: string;
  mes?: string;
  tipo?: string;
  estadoId?: string;
  grupoId?: string;
};

// D47: clamp a las opciones canónicas [10,25,50,100] (D51); fuera de set → default 25.
function clampPageSize(pageSize: number): number {
  return (DEFAULT_PAGE_SIZE_OPTIONS as readonly number[]).includes(pageSize) ? pageSize : 25;
}

type DashboardData = {
  totalSocios: number;
  recaudado: number;
  morosos: number;
  multasPendientes: number;
  egresosMes: number;
  neto: number;
};

type AppState = {
  initialized: boolean;
  setInitialized: (v: boolean) => void;

  dashboard: DashboardData | null;
  dashboardLoading: boolean;
  dashboardError: string | null;
  fetchDashboard: () => Promise<void>;

  socios: Socio[];
  sociosLoading: boolean;
  sociosError: string | null;
  fetchSocios: (search?: string, estadoId?: string, grupoId?: string) => Promise<void>;
  createSocio: (data: Partial<SocioInput>) => Promise<SocioConGeneracion>;
  updateSocio: (id: string, data: Partial<SocioInput>) => Promise<SocioConGeneracion>;
  deleteSocio: (id: string) => Promise<void>;
  bajaSocio: (id: string, motivo: string) => Promise<Socio>;

  aporteRegistros: AporteRegistro[];
  aporteRegistrosTotal: number;
  aporteRegistrosPage: number;
  aporteRegistrosPageSize: number;
  aporteRegistrosLoading: boolean;
  aporteRegistrosError: string | null;
  fetchAporteRegistros: (filters?: AporteFilters, page?: number) => Promise<void>;
  setAporteRegistrosPage: (page: number, filters?: AporteFilters) => Promise<void>;
  setAporteRegistrosPageSize: (pageSize: number, filters?: AporteFilters) => Promise<void>;
  createAporte: (data: CrearAporteRequest) => Promise<GeneracionResult>;
  pagarAporte: (id: string, data: { monto?: number; numeroRecibo?: string; fechaPago?: string }) => Promise<AporteRegistro>;

  multas: Multa[];
  multasTotal: number;
  multasPage: number;
  multasPageSize: number;
  multasLoading: boolean;
  multasError: string | null;
  fetchMultas: (filters?: MultaFilters, page?: number) => Promise<void>;
  setMultasPage: (page: number, filters?: MultaFilters) => Promise<void>;
  setMultasPageSize: (pageSize: number, filters?: MultaFilters) => Promise<void>;
  createMultasBulk: (payload: BulkMultaRequest) => Promise<BulkMultaResponse>;
  createMulta: (data: Partial<Multa>) => Promise<Multa>;
  pagarMulta: (id: string, data: { monto?: number; numeroRecibo?: string; fechaPago?: string }) => Promise<Multa>;
  anularMulta: (id: string, razon: string) => Promise<Multa>;
  anularAporte: (id: string, razon: string) => Promise<AporteRegistro>;

  egresos: Egreso[];
  egresosLoading: boolean;
  egresosError: string | null;
  fetchEgresos: (filters?: EgresoFilters) => Promise<void>;
  createEgreso: (data: Partial<Egreso>) => Promise<Egreso>;
  updateEgreso: (id: string, data: Partial<Egreso>) => Promise<Egreso>;
  deleteEgreso: (id: string) => Promise<void>;

  actividades: Actividad[];
  actividadesLoading: boolean;
  actividadesError: string | null;
  fetchActividades: () => Promise<void>;
  createActividad: (data: Partial<Actividad>) => Promise<Actividad>;
  updateActividad: (id: string, data: Partial<Actividad>) => Promise<Actividad>;
  deleteActividad: (id: string) => Promise<void>;

  asistenciaRecords: Asistencia[];
  asistenciaLoading: boolean;
  asistenciaError: string | null;
  fetchAsistencia: (actividadId: string, estadoId?: string, grupoId?: string) => Promise<void>;
  saveAsistencia: (actividadId: string, registros: { socioId: string; tipoAsistencia: string; minutosTardanza?: number }[]) => Promise<void>;

  config: OTBConfig | null;
  tiposActividad: TipoActividad[];
  estadosSocio: EstadoSocio[];
  accionesSocio: AccionSocio[];
  grupos: Grupo[];
  aportes: Aporte[];
  aportesLoading: boolean;
  aportesError: string | null;
  configLoading: boolean;
  configError: string | null;
  fetchConfig: () => Promise<void>;
  updateConfig: (data: Partial<OTBConfig>) => Promise<void>;
  addTipoActividad: (tipo: TipoActividad) => Promise<void>;
  updateTipoActividad: (id: string, data: Partial<TipoActividad>) => Promise<void>;
  removeTipoActividad: (id: string) => Promise<void>;
  addEstadoSocio: (data: EstadoSocioInput) => Promise<void>;
  updateEstadoSocio: (id: string, data: Partial<EstadoSocioInput>) => Promise<void>;
  removeEstadoSocio: (id: string) => Promise<void>;
  setEstadoAcciones: (id: string, accionIds: string[]) => Promise<void>;
  addAccionSocio: (data: AccionSocioInput) => Promise<void>;
  removeAccionSocio: (id: string) => Promise<void>;
  addGrupo: (data: GrupoInput) => Promise<void>;
  updateGrupo: (id: string, data: Partial<GrupoInput>) => Promise<void>;
  removeGrupo: (id: string) => Promise<void>;
  fetchAportesDef: () => Promise<void>;
  addAporte: (data: AporteInput) => Promise<GeneracionResult>;
  updateAporte: (id: string, data: Partial<AporteInput>) => Promise<GeneracionResult>;
  removeAporte: (id: string) => Promise<void>;
  createAportesBulk: (payload: BulkAporteRequest) => Promise<GeneracionResult>;
  createAportesBulkAll: (payload: BulkAporteRequest) => Promise<GeneracionResult>;
  fetchPagosAporte: (id: string) => Promise<Movimiento[]>;

  balanceReport: BalanceReport | null;
  libroDiario: LibroDiarioEntry[];
  libroDiarioTotal: number;
  libroDiarioPage: number;
  libroDiarioPageSize: number;
  resumenSocio: ResumenSocioReport | null;
  reportsLoading: boolean;
  fetchBalance: (gestion?: number, mes?: string, fechaDesde?: string, fechaHasta?: string) => Promise<void>;
  fetchLibroDiario: (filters?: LibroDiarioFilters, page?: number) => Promise<void>;
  setLibroDiarioPage: (page: number, filters?: LibroDiarioFilters) => Promise<void>;
  setLibroDiarioPageSize: (pageSize: number, filters?: LibroDiarioFilters) => Promise<void>;
  fetchResumenSocio: (socioId: string, gestion?: string, mes?: string, fechaDesde?: string, fechaHasta?: string, tipo?: string, estadoId?: string, grupoId?: string) => Promise<void>;
};

export const useAppStore = create<AppState>((set, get) => ({
  initialized: false,
  setInitialized: (v) => set({ initialized: v }),

  dashboard: null,
  dashboardLoading: false,
  dashboardError: null,
  fetchDashboard: async () => {
    set({ dashboardLoading: true, dashboardError: null });
    try {
      const data = await request<DashboardData>('/dashboard');
      set({ dashboard: data, dashboardLoading: false });
    } catch (e) {
      set({ dashboardError: (e as Error).message, dashboardLoading: false });
    }
  },

  socios: [],
  sociosLoading: false,
  sociosError: null,
  fetchSocios: async (search, estadoId, grupoId) => {
    set({ sociosLoading: true, sociosError: null });
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (estadoId) params.set('estadoId', estadoId);
      if (grupoId) params.set('grupoId', grupoId);
      const qs = params.toString() ? `?${params}` : '';
      const data = await request<Socio[]>(`/socios${qs}`);
      set({ socios: data, sociosLoading: false });
    } catch (e) {
      set({ sociosError: (e as Error).message, sociosLoading: false });
    }
  },
  createSocio: async (data) => {
    const socio = await request<SocioConGeneracion>('/socios', { method: 'POST', body: JSON.stringify(data) });
    set({ socios: [...get().socios, socio] });
    // T3.1/D16: el guardado genera cobros; refrescar los registros para que
    // aparezcan de inmediato en la lista (la lista de socios ya se actualizó).
    void get().fetchAporteRegistros();
    return socio;
  },
  updateSocio: async (id, data) => {
    const socio = await request<SocioConGeneracion>(`/socios/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    set({ socios: get().socios.map((s) => (s.id === id ? socio : s)) });
    // T3.1/D16: un PUT puede generar cobros (nuevas asignaciones/membresías).
    void get().fetchAporteRegistros();
    return socio;
  },
  deleteSocio: async (id) => {
    await request(`/socios/${id}`, { method: 'DELETE' });
    set({ socios: get().socios.filter((s) => s.id !== id) });
  },
  bajaSocio: async (id, motivo) => {
    const socio = await request<Socio>(`/socios/${id}/baja`, {
      method: 'POST',
      body: JSON.stringify({ motivo }),
    });
    set({ socios: get().socios.map((s) => (s.id === id ? socio : s)) });
    return socio;
  },

  aporteRegistros: [],
  aporteRegistrosTotal: 0,
  aporteRegistrosPage: 1,
  aporteRegistrosPageSize: 25,
  aporteRegistrosLoading: false,
  aporteRegistrosError: null,
  fetchAporteRegistros: async (filters, page) => {
    set({ aporteRegistrosLoading: true, aporteRegistrosError: null });
    try {
      const params = new URLSearchParams();
      if (filters?.socioId) params.set('socioId', filters.socioId);
      if (filters?.mes) params.set('mes', filters.mes);
      if (filters?.gestion) params.set('gestion', filters.gestion);
      if (filters?.estado) params.set('estado', filters.estado);
      if (filters?.tipo) params.set('tipo', filters.tipo);
      if (filters?.fechaDesde) params.set('fechaDesde', filters.fechaDesde);
      if (filters?.fechaHasta) params.set('fechaHasta', filters.fechaHasta);
      if (filters?.estadoId) params.set('estadoId', filters.estadoId);
      if (filters?.grupoId) params.set('grupoId', filters.grupoId);
      // D38: SIEMPRE enviar page/pageSize (defaults del store 1/25, cap del API 100).
      params.set('page', String(page ?? get().aporteRegistrosPage));
      params.set('pageSize', String(get().aporteRegistrosPageSize));
      const qs = params.toString() ? `?${params}` : '';
      const data = await request<Paginated<AporteRegistro>>(`/aportes${qs}`);
      // D33: unpack del envelope — items→aporteRegistros, total→aporteRegistrosTotal, echo de page/pageSize.
      set({
        aporteRegistros: data.items,
        aporteRegistrosTotal: data.total,
        aporteRegistrosPage: data.page,
        aporteRegistrosPageSize: data.pageSize,
        aporteRegistrosLoading: false,
      });
    } catch (e) {
      set({ aporteRegistrosError: (e as Error).message, aporteRegistrosLoading: false });
    }
  },
  setAporteRegistrosPage: async (page, filters) => {
    // D38: único punto de mutación de página — sirve TANTO al cambio de página
    // (onPageChange) como al reset a página 1 ante un cambio de filtros.
    set({ aporteRegistrosPage: page });
    return get().fetchAporteRegistros(filters, page);
  },
  setAporteRegistrosPageSize: async (pageSize, filters) => {
    // D47: clamp a las opciones canónicas, reset a página 1 y UN solo refetch.
    // Los efectos de ruta (deps [tab, filters, setter]) no incluyen pageSize →
    // sin doble fetch.
    set({ aporteRegistrosPageSize: clampPageSize(pageSize), aporteRegistrosPage: 1 });
    return get().fetchAporteRegistros(filters, 1);
  },
  createAporte: async (data) => {
    // Generación simple definition-driven: { socioId, aporteId, gestion, mes? }
    // Endpoint conservado (D17); dedup-safe al re-ejecutar.
    return request<GeneracionResult>('/aportes', { method: 'POST', body: JSON.stringify(data) });
  },
  pagarAporte: async (id, data) => {
    const aporte = await request<AporteRegistro>(`/aportes/${id}/pagar`, { method: 'POST', body: JSON.stringify(data) });
    set({ aporteRegistros: get().aporteRegistros.map((a) => (a.id === id ? aporte : a)) });
    return aporte;
  },

  multas: [],
  multasTotal: 0,
  multasPage: 1,
  multasPageSize: 25,
  multasLoading: false,
  multasError: null,
  fetchMultas: async (filters, page) => {
    set({ multasLoading: true, multasError: null });
    try {
      const params = new URLSearchParams();
      if (filters?.socioId) params.set('socioId', filters.socioId);
      if (filters?.estado) params.set('estado', filters.estado);
      if (filters?.actividadId) params.set('actividadId', filters.actividadId);
      if (filters?.fechaDesde) params.set('fechaDesde', filters.fechaDesde);
      if (filters?.fechaHasta) params.set('fechaHasta', filters.fechaHasta);
      if (filters?.gestion) params.set('gestion', filters.gestion);
      if (filters?.estadoId) params.set('estadoId', filters.estadoId);
      if (filters?.grupoId) params.set('grupoId', filters.grupoId);
      // D38: SIEMPRE enviar page/pageSize (defaults del store 1/25, cap del API 100).
      params.set('page', String(page ?? get().multasPage));
      params.set('pageSize', String(get().multasPageSize));
      const qs = params.toString() ? `?${params}` : '';
      const data = await request<Paginated<Multa>>(`/multas${qs}`);
      // D33: unpack del envelope — items→multas, total→multasTotal, echo de page/pageSize.
      set({
        multas: data.items,
        multasTotal: data.total,
        multasPage: data.page,
        multasPageSize: data.pageSize,
        multasLoading: false,
      });
    } catch (e) {
      set({ multasError: (e as Error).message, multasLoading: false });
    }
  },
  setMultasPage: async (page, filters) => {
    // D38: único punto de mutación de página — sirve TANTO al cambio de página
    // (onPageChange) como al reset a página 1 ante un cambio de filtros.
    set({ multasPage: page });
    return get().fetchMultas(filters, page);
  },
  setMultasPageSize: async (pageSize, filters) => {
    // D47: clamp a las opciones canónicas, reset a página 1 y UN solo refetch.
    // Los efectos de ruta (deps [tab, filters, setter]) no incluyen pageSize →
    // sin doble fetch.
    set({ multasPageSize: clampPageSize(pageSize), multasPage: 1 });
    return get().fetchMultas(filters, 1);
  },
  createMultasBulk: async (payload) => {
    // D41: reemplaza el fetch crudo de la ruta; refresca la lista en página 1,
    // sin filtros (paridad con el fetchMultas() post-creación de antes). El
    // helper `request` lanza ApiError con el mensaje amigable del API.
    const res = await request<BulkMultaResponse>('/multas/bulk', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await get().fetchMultas(undefined, 1);
    return res;
  },
  createMulta: async (data) => {
    const multa = await request<Multa>('/multas', { method: 'POST', body: JSON.stringify(data) });
    set({ multas: [...get().multas, multa] });
    return multa;
  },
  pagarMulta: async (id, data) => {
    const multa = await request<Multa>(`/multas/${id}/pagar`, { method: 'POST', body: JSON.stringify(data) });
    set({ multas: get().multas.map((m) => (m.id === id ? multa : m)) });
    return multa;
  },
  anularMulta: async (id: string, razon: string) => {
    const multa = await request<Multa>(`/multas/${id}/anular`, { method: 'POST', body: JSON.stringify({ razon }) });
    set({ multas: get().multas.map((m) => (m.id === id ? multa : m)) });
    return multa;
  },
  anularAporte: async (id: string, razon: string) => {
    const aporte = await request<AporteRegistro>(`/aportes/${id}/anular`, { method: 'POST', body: JSON.stringify({ razon }) });
    set({ aporteRegistros: get().aporteRegistros.map((a) => (a.id === id ? aporte : a)) });
    return aporte;
  },

  egresos: [],
  egresosLoading: false,
  egresosError: null,
  fetchEgresos: async (filters) => {
    set({ egresosLoading: true, egresosError: null });
    try {
      const params = new URLSearchParams();
      if (filters?.categoria) params.set('categoria', filters.categoria);
      if (filters?.fechaDesde) params.set('fechaDesde', filters.fechaDesde);
      if (filters?.fechaHasta) params.set('fechaHasta', filters.fechaHasta);
      const qs = params.toString() ? `?${params}` : '';
      const data = await request<Egreso[]>(`/egresos${qs}`);
      set({ egresos: data, egresosLoading: false });
    } catch (e) {
      set({ egresosError: (e as Error).message, egresosLoading: false });
    }
  },
  createEgreso: async (data) => {
    const egreso = await request<Egreso>('/egresos', { method: 'POST', body: JSON.stringify(data) });
    set({ egresos: [...get().egresos, egreso] });
    return egreso;
  },
  updateEgreso: async (id, data) => {
    const egreso = await request<Egreso>(`/egresos/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    set({ egresos: get().egresos.map((e) => (e.id === id ? egreso : e)) });
    return egreso;
  },
  deleteEgreso: async (id) => {
    await request(`/egresos/${id}`, { method: 'DELETE' });
    set({ egresos: get().egresos.filter((e) => e.id !== id) });
  },

  actividades: [],
  actividadesLoading: false,
  actividadesError: null,
  fetchActividades: async () => {
    set({ actividadesLoading: true, actividadesError: null });
    try {
      const data = await request<Actividad[]>('/actividades');
      set({ actividades: data, actividadesLoading: false });
    } catch (e) {
      set({ actividadesError: (e as Error).message, actividadesLoading: false });
    }
  },
  createActividad: async (data) => {
    const actividad = await request<Actividad>('/actividades', { method: 'POST', body: JSON.stringify(data) });
    set({ actividades: [...get().actividades, actividad] });
    return actividad;
  },
  updateActividad: async (id, data) => {
    const actividad = await request<Actividad>(`/actividades/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    set({ actividades: get().actividades.map((a) => (a.id === id ? actividad : a)) });
    return actividad;
  },
  deleteActividad: async (id) => {
    await request(`/actividades/${id}`, { method: 'DELETE' });
    set({ actividades: get().actividades.filter((a) => a.id !== id) });
  },

  asistenciaRecords: [],
  asistenciaLoading: false,
  asistenciaError: null,
  fetchAsistencia: async (actividadId, estadoId, grupoId) => {
    set({ asistenciaLoading: true, asistenciaError: null });
    try {
      const params = new URLSearchParams();
      if (estadoId) params.set('estadoId', estadoId);
      if (grupoId) params.set('grupoId', grupoId);
      const qs = params.toString() ? `?${params}` : '';
      const data = await request<Asistencia[]>(`/asistencia/actividad/${actividadId}${qs}`);
      set({ asistenciaRecords: data, asistenciaLoading: false });
    } catch (e) {
      set({ asistenciaError: (e as Error).message, asistenciaLoading: false });
    }
  },
  saveAsistencia: async (actividadId, registros) => {
    const records = await request<Asistencia[]>('/asistencia', {
      method: 'POST',
      body: JSON.stringify({ actividadId, registros }),
    });
    set({ asistenciaRecords: records });
  },

  config: null,
  tiposActividad: [],
  estadosSocio: [],
  accionesSocio: [],
  grupos: [],
  aportes: [],
  aportesLoading: false,
  aportesError: null,
  configLoading: false,
  configError: null,
  fetchConfig: async () => {
    set({ configLoading: true, configError: null });
    try {
      const [config, tiposActividad, estadosSocio, accionesSocio, grupos, aportes] = await Promise.all([
        request<OTBConfig>('/config').catch(() => null),
        request<TipoActividad[]>('/tipos-actividad').catch(() => []),
        request<EstadoSocio[]>('/estados-socio').catch(() => []),
        request<AccionSocio[]>('/acciones-socio').catch(() => []),
        request<Grupo[]>('/grupos').catch(() => []),
        request<Aporte[]>('/aportes-definicion').catch(() => []),
      ]);
      set({
        config,
        tiposActividad: Array.isArray(tiposActividad) ? tiposActividad : [],
        estadosSocio: Array.isArray(estadosSocio) ? estadosSocio : [],
        accionesSocio: Array.isArray(accionesSocio) ? accionesSocio : [],
        grupos: Array.isArray(grupos) ? grupos : [],
        aportes: Array.isArray(aportes) ? aportes : [],
        configLoading: false,
      });
    } catch (e) {
      set({ configError: (e as Error).message, configLoading: false });
    }
  },
  updateConfig: async (data) => {
    const config = await request<OTBConfig>('/config', { method: 'PUT', body: JSON.stringify(data) });
    set({ config });
  },
  addTipoActividad: async (tipo) => {
    const tipos = await request<TipoActividad[]>('/tipos-actividad', { method: 'POST', body: JSON.stringify(tipo) });
    set({ tiposActividad: tipos });
  },
  updateTipoActividad: async (id, data) => {
    const tipos = await request<TipoActividad[]>(`/tipos-actividad/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    set({ tiposActividad: tipos });
  },
  removeTipoActividad: async (id) => {
    const tipos = await request<TipoActividad[]>(`/tipos-actividad/${id}`, { method: 'DELETE' });
    set({ tiposActividad: tipos });
  },
  addEstadoSocio: async (data) => {
    const estados = await request<EstadoSocio[]>('/estados-socio', { method: 'POST', body: JSON.stringify(data) });
    set({ estadosSocio: estados });
  },
  updateEstadoSocio: async (id, data) => {
    const estados = await request<EstadoSocio[]>(`/estados-socio/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    set({ estadosSocio: estados });
  },
  removeEstadoSocio: async (id) => {
    const estados = await request<EstadoSocio[]>(`/estados-socio/${id}`, { method: 'DELETE' });
    set({ estadosSocio: estados });
  },
  setEstadoAcciones: async (id, accionIds) => {
    const estados = await request<EstadoSocio[]>(`/estados-socio/${id}/acciones`, {
      method: 'PUT',
      body: JSON.stringify({ accionIds }),
    });
    set({ estadosSocio: estados });
  },
  addAccionSocio: async (data) => {
    const acciones = await request<AccionSocio[]>('/acciones-socio', { method: 'POST', body: JSON.stringify(data) });
    set({ accionesSocio: acciones });
  },
  removeAccionSocio: async (id) => {
    const acciones = await request<AccionSocio[]>(`/acciones-socio/${id}`, { method: 'DELETE' });
    set({ accionesSocio: acciones });
  },
  addGrupo: async (data) => {
    const grupos = await request<Grupo[]>('/grupos', { method: 'POST', body: JSON.stringify(data) });
    set({ grupos });
  },
  updateGrupo: async (id, data) => {
    const grupos = await request<Grupo[]>(`/grupos/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    set({ grupos });
  },
  removeGrupo: async (id) => {
    const grupos = await request<Grupo[]>(`/grupos/${id}`, { method: 'DELETE' });
    set({ grupos });
  },
  fetchAportesDef: async () => {
    set({ aportesLoading: true, aportesError: null });
    try {
      const definiciones = await request<Aporte[]>('/aportes-definicion');
      set({ aportes: Array.isArray(definiciones) ? definiciones : [], aportesLoading: false });
    } catch (e) {
      set({ aportesError: (e as Error).message, aportesLoading: false });
    }
  },
  addAporte: async (data) => {
    // D15: POST devuelve { definiciones: catálogo COMPLETO, generados } — se
    // reemplaza la lista (patrón tiposActividad) y se devuelve `generados`
    // para que el caller pueda tostear el conteo (D22).
    const res = await request<CrearDefinicionResponse>('/aportes-definicion', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    set({ aportes: res.definiciones });
    return res.generados;
  },
  updateAporte: async (id, data) => {
    // D27: PUT devuelve { definiciones: catálogo COMPLETO hidratado, generados } —
    // se reemplaza la lista (patrón addAporte) y se devuelve `generados` para
    // que el caller tostee el conteo (D22) también tras editar (D32).
    const res = await request<CrearDefinicionResponse>(`/aportes-definicion/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    set({ aportes: res.definiciones });
    return res.generados;
  },
  removeAporte: async (id) => {
    // DELETE guarda 409 cuando hay socios (socio_aportes) o registros (aportes.aporte_id)
    // usando la definición; el mensaje amigable se propaga al UI.
    const definiciones = await request<Aporte[]>(`/aportes-definicion/${id}`, { method: 'DELETE' });
    set({ aportes: definiciones });
  },
  createAportesBulk: async (payload) => {
    return request<GeneracionResult>('/aportes/bulk', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  createAportesBulkAll: async (payload: BulkAporteRequest) => {
    // /bulk/all resuelve todos los socios permitidos; el payload NO lleva socioIds
    return request<GeneracionResult>('/aportes/bulk/all', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  fetchPagosAporte: async (id) => {
    return request<Movimiento[]>(`/aportes/${id}/pagos`);
  },

  balanceReport: null,
  libroDiario: [],
  libroDiarioTotal: 0,
  libroDiarioPage: 1,
  libroDiarioPageSize: 25,
  resumenSocio: null,
  reportsLoading: false,
  fetchBalance: async (gestion, mes, fechaDesde, fechaHasta) => {
    set({ reportsLoading: true });
    try {
      const params = new URLSearchParams();
      if (gestion) params.set('gestion', String(gestion));
      if (mes) params.set('mes', mes);
      if (fechaDesde) params.set('fechaDesde', fechaDesde);
      if (fechaHasta) params.set('fechaHasta', fechaHasta);
      const qs = params.toString() ? `?${params}` : '';
      const data = await request<BalanceReport>(`/reportes/balance${qs}`);
      set({ balanceReport: data, reportsLoading: false });
    } catch (e) {
      set({ reportsLoading: false });
    }
  },
  fetchLibroDiario: async (filters, page) => {
    set({ reportsLoading: true });
    try {
      const params = new URLSearchParams();
      if (filters?.fechaDesde) params.set('fechaDesde', filters.fechaDesde);
      if (filters?.fechaHasta) params.set('fechaHasta', filters.fechaHasta);
      if (filters?.gestion) params.set('gestion', filters.gestion);
      if (filters?.mes) params.set('mes', filters.mes);
      if (filters?.tipo && filters.tipo !== 'todos') params.set('tipo', filters.tipo);
      if (filters?.estadoId) params.set('estadoId', filters.estadoId);
      if (filters?.grupoId) params.set('grupoId', filters.grupoId);
      // D38/D47: SIEMPRE enviar page/pageSize (defaults del store 1/25, cap del API 100).
      params.set('page', String(page ?? get().libroDiarioPage));
      params.set('pageSize', String(get().libroDiarioPageSize));
      const qs = params.toString() ? `?${params}` : '';
      const data = await request<Paginated<LibroDiarioEntry>>(`/reportes/libro-diario${qs}`);
      // D33/D47: unpack del envelope — items→libroDiario, total→libroDiarioTotal,
      // echo de page/pageSize.
      set({
        libroDiario: data.items,
        libroDiarioTotal: data.total,
        libroDiarioPage: data.page,
        libroDiarioPageSize: data.pageSize,
        reportsLoading: false,
      });
    } catch (e) {
      set({ reportsLoading: false });
    }
  },
  setLibroDiarioPage: async (page, filters) => {
    // D38: único punto de mutación de página — sirve TANTO al cambio de página
    // (onPageChange) como al reset a página 1 ante un cambio de filtros.
    set({ libroDiarioPage: page });
    return get().fetchLibroDiario(filters, page);
  },
  setLibroDiarioPageSize: async (pageSize, filters) => {
    // D47: clamp a las opciones canónicas, reset a página 1 y UN solo refetch.
    // El efecto de ruta (deps [tab, filters, setter]) no incluye pageSize →
    // sin doble fetch.
    set({ libroDiarioPageSize: clampPageSize(pageSize), libroDiarioPage: 1 });
    return get().fetchLibroDiario(filters, 1);
  },
  fetchResumenSocio: async (socioId, gestion, mes, fechaDesde, fechaHasta, tipo, estadoId, grupoId) => {
    set({ reportsLoading: true });
    try {
      const params = new URLSearchParams();
      if (gestion) params.set('gestion', gestion);
      if (mes) params.set('mes', mes);
      if (fechaDesde) params.set('fechaDesde', fechaDesde);
      if (fechaHasta) params.set('fechaHasta', fechaHasta);
      if (tipo && tipo !== 'todos') params.set('tipo', tipo);
      if (estadoId) params.set('estadoId', estadoId);
      if (grupoId) params.set('grupoId', grupoId);
      const qs = params.toString() ? `?${params}` : '';
      const data = await request<ResumenSocioReport>(`/reportes/resumen-socio/${socioId}${qs}`);
      set({ resumenSocio: data, reportsLoading: false });
    } catch (e) {
      set({ reportsLoading: false });
    }
  },
}));

/**
 * Selector de definiciones de aporte activas (activo=1), para el multiselect de
 * socio y la UI de aportes.
 */
export function selectAportesActivos(aportes: Aporte[]): Aporte[] {
  return aportes.filter((a) => a.activo === 1);
}
