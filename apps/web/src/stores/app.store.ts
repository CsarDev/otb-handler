import { create } from 'zustand';
import type {
  Socio,
  Aporte,
  Multa,
  Egreso,
  Actividad,
  Asistencia,
  TipoActividad,
  OTBConfig,
  BalanceReport,
  LibroDiarioEntry,
  ResumenSocioReport,
} from '@otb/core';

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

type AporteFilters = { socioId?: string; mes?: string; gestion?: string; estado?: string; tipo?: string; fechaDesde?: string; fechaHasta?: string };
type MultaFilters = { socioId?: string; estado?: string; actividadId?: string; fechaDesde?: string; fechaHasta?: string; gestion?: string };
type EgresoFilters = { categoria?: string; fechaDesde?: string; fechaHasta?: string };

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
  fetchSocios: (search?: string) => Promise<void>;
  createSocio: (data: Partial<Socio>) => Promise<Socio>;
  updateSocio: (id: string, data: Partial<Socio>) => Promise<Socio>;
  deleteSocio: (id: string) => Promise<void>;

  aportes: Aporte[];
  aportesLoading: boolean;
  aportesError: string | null;
  fetchAportes: (filters?: AporteFilters) => Promise<void>;
  createAporte: (data: Partial<Aporte>) => Promise<Aporte>;
  pagarAporte: (id: string, data: { monto?: number; numeroRecibo?: string; fechaPago?: string }) => Promise<Aporte>;

  multas: Multa[];
  multasLoading: boolean;
  multasError: string | null;
  fetchMultas: (filters?: MultaFilters) => Promise<void>;
  createMulta: (data: Partial<Multa>) => Promise<Multa>;
  pagarMulta: (id: string, data: { monto?: number; numeroRecibo?: string; fechaPago?: string }) => Promise<Multa>;
  anularMulta: (id: string, razon: string) => Promise<Multa>;
  anularAporte: (id: string, razon: string) => Promise<Aporte>;

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
  fetchAsistencia: (actividadId: string) => Promise<void>;
  saveAsistencia: (actividadId: string, registros: { socioId: string; tipoAsistencia: string; minutosTardanza?: number }[]) => Promise<void>;

  config: OTBConfig | null;
  tiposActividad: TipoActividad[];
  configLoading: boolean;
  configError: string | null;
  fetchConfig: () => Promise<void>;
  updateConfig: (data: Partial<OTBConfig>) => Promise<void>;
  addTipoActividad: (tipo: TipoActividad) => Promise<void>;
  updateTipoActividad: (id: string, data: Partial<TipoActividad>) => Promise<void>;
  removeTipoActividad: (id: string) => Promise<void>;

  balanceReport: BalanceReport | null;
  libroDiario: LibroDiarioEntry[];
  resumenSocio: ResumenSocioReport | null;
  reportsLoading: boolean;
  fetchBalance: (gestion?: number, mes?: string, fechaDesde?: string, fechaHasta?: string) => Promise<void>;
  fetchLibroDiario: (fechaDesde?: string, fechaHasta?: string, gestion?: string, mes?: string, tipo?: string) => Promise<void>;
  fetchResumenSocio: (socioId: string, gestion?: string, mes?: string, fechaDesde?: string, fechaHasta?: string, tipo?: string) => Promise<void>;
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
  fetchSocios: async (search) => {
    set({ sociosLoading: true, sociosError: null });
    try {
      const qs = search ? `?search=${encodeURIComponent(search)}` : '';
      const data = await request<Socio[]>(`/socios${qs}`);
      set({ socios: data, sociosLoading: false });
    } catch (e) {
      set({ sociosError: (e as Error).message, sociosLoading: false });
    }
  },
  createSocio: async (data) => {
    const socio = await request<Socio>('/socios', { method: 'POST', body: JSON.stringify(data) });
    set({ socios: [...get().socios, socio] });
    return socio;
  },
  updateSocio: async (id, data) => {
    const socio = await request<Socio>(`/socios/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    set({ socios: get().socios.map((s) => (s.id === id ? socio : s)) });
    return socio;
  },
  deleteSocio: async (id) => {
    await request(`/socios/${id}`, { method: 'DELETE' });
    set({ socios: get().socios.filter((s) => s.id !== id) });
  },

  aportes: [],
  aportesLoading: false,
  aportesError: null,
  fetchAportes: async (filters) => {
    set({ aportesLoading: true, aportesError: null });
    try {
      const params = new URLSearchParams();
      if (filters?.socioId) params.set('socioId', filters.socioId);
      if (filters?.mes) params.set('mes', filters.mes);
      if (filters?.gestion) params.set('gestion', filters.gestion);
      if (filters?.estado) params.set('estado', filters.estado);
      if (filters?.tipo) params.set('tipo', filters.tipo);
      if (filters?.fechaDesde) params.set('fechaDesde', filters.fechaDesde);
      if (filters?.fechaHasta) params.set('fechaHasta', filters.fechaHasta);
      const qs = params.toString() ? `?${params}` : '';
      const data = await request<Aporte[]>(`/aportes${qs}`);
      set({ aportes: data, aportesLoading: false });
    } catch (e) {
      set({ aportesError: (e as Error).message, aportesLoading: false });
    }
  },
  createAporte: async (data) => {
    const aporte = await request<Aporte>('/aportes', { method: 'POST', body: JSON.stringify(data) });
    set({ aportes: [...get().aportes, aporte] });
    return aporte;
  },
  pagarAporte: async (id, data) => {
    const aporte = await request<Aporte>(`/aportes/${id}/pagar`, { method: 'POST', body: JSON.stringify(data) });
    set({ aportes: get().aportes.map((a) => (a.id === id ? aporte : a)) });
    return aporte;
  },

  multas: [],
  multasLoading: false,
  multasError: null,
  fetchMultas: async (filters) => {
    set({ multasLoading: true, multasError: null });
    try {
      const params = new URLSearchParams();
      if (filters?.socioId) params.set('socioId', filters.socioId);
      if (filters?.estado) params.set('estado', filters.estado);
      if (filters?.actividadId) params.set('actividadId', filters.actividadId);
      if (filters?.fechaDesde) params.set('fechaDesde', filters.fechaDesde);
      if (filters?.fechaHasta) params.set('fechaHasta', filters.fechaHasta);
      if (filters?.gestion) params.set('gestion', filters.gestion);
      const qs = params.toString() ? `?${params}` : '';
      const data = await request<Multa[]>(`/multas${qs}`);
      set({ multas: data, multasLoading: false });
    } catch (e) {
      set({ multasError: (e as Error).message, multasLoading: false });
    }
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
    const aporte = await request<Aporte>(`/aportes/${id}/anular`, { method: 'POST', body: JSON.stringify({ razon }) });
    set({ aportes: get().aportes.map((a) => (a.id === id ? aporte : a)) });
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
  fetchAsistencia: async (actividadId) => {
    set({ asistenciaLoading: true, asistenciaError: null });
    try {
      const data = await request<Asistencia[]>(`/asistencia/actividad/${actividadId}`);
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
  configLoading: false,
  configError: null,
  fetchConfig: async () => {
    set({ configLoading: true, configError: null });
    try {
      const [config, tiposActividad] = await Promise.all([
        request<OTBConfig>('/config').catch(() => null),
        request<TipoActividad[]>('/tipos-actividad').catch(() => []),
      ]);
      set({ config, tiposActividad: Array.isArray(tiposActividad) ? tiposActividad : [], configLoading: false });
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

  balanceReport: null,
  libroDiario: [],
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
  fetchLibroDiario: async (fechaDesde, fechaHasta, gestion, mes, tipo) => {
    set({ reportsLoading: true });
    try {
      const params = new URLSearchParams();
      if (fechaDesde) params.set('fechaDesde', fechaDesde);
      if (fechaHasta) params.set('fechaHasta', fechaHasta);
      if (gestion) params.set('gestion', gestion);
      if (mes) params.set('mes', mes);
      if (tipo && tipo !== 'todos') params.set('tipo', tipo);
      const qs = params.toString() ? `?${params}` : '';
      const data = await request<LibroDiarioEntry[]>(`/reportes/libro-diario${qs}`);
      set({ libroDiario: data, reportsLoading: false });
    } catch (e) {
      set({ reportsLoading: false });
    }
  },
  fetchResumenSocio: async (socioId, gestion, mes, fechaDesde, fechaHasta, tipo) => {
    set({ reportsLoading: true });
    try {
      const params = new URLSearchParams();
      if (gestion) params.set('gestion', gestion);
      if (mes) params.set('mes', mes);
      if (fechaDesde) params.set('fechaDesde', fechaDesde);
      if (fechaHasta) params.set('fechaHasta', fechaHasta);
      if (tipo && tipo !== 'todos') params.set('tipo', tipo);
      const qs = params.toString() ? `?${params}` : '';
      const data = await request<ResumenSocioReport>(`/reportes/resumen-socio/${socioId}${qs}`);
      set({ resumenSocio: data, reportsLoading: false });
    } catch (e) {
      set({ reportsLoading: false });
    }
  },
}));
