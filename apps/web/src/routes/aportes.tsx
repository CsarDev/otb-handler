import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAppStore, selectAportesActivos } from '../stores/app.store';
import { socioPermiteUI } from '../lib/permisos';
import { Badge } from '@otb/ui';
import type { Aporte, AporteRegistro, Movimiento, BulkAporteRequest } from '@otb/core';

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none';
const labelCls = 'mb-1 block text-xs font-medium text-gray-600';

const RECURRENCIA_LABEL: Record<string, string> = {
  mensual: 'Mensual',
  anual: 'Anual (12 meses)',
  unico: 'Único',
  extraordinario: 'Extraordinario',
};

const MODALIDAD_LABEL: Record<string, string> = {
  cuotas: 'Cuotas',
  parciales: 'Parciales',
  pago_unico: 'Pago único',
};

/**
 * Schema del form de DEFINICIÓN de aporte (crear/editar). El `id` (slug) se
 * acepta SOLO en POST; en edición es inmutable y se muestra read-only.
 */
const definicionSchema = z.object({
  nombre: z.string().min(1, 'Requerido'),
  monto: z.coerce.number().min(0, 'Monto no puede ser negativo'),
  recurrencia: z.enum(['mensual', 'anual', 'unico', 'extraordinario']),
  inicio: z.string().nullish().default(''),
  fin: z.string().nullish().default(''),
  modalidadPago: z.enum(['cuotas', 'parciales', 'pago_unico']),
  aplicaGrupoId: z.string().nullish().default(''),
  activo: z.boolean().default(true),
});

type DefinicionForm = z.infer<typeof definicionSchema>;

const defaultDefinicion: DefinicionForm = {
  nombre: '',
  monto: 0,
  recurrencia: 'mensual',
  inicio: '',
  fin: '',
  modalidadPago: 'cuotas',
  aplicaGrupoId: '',
  activo: true,
};

/**
 * Schema del form de GENERACIÓN de cobros (definition-driven). Se seleccionan
 * definiciones (`aporteIds`), socios (o "Todos"), gestión y mes opcional —
 * NO hay `tipo`/`monto`/`meses` en el payload (D8).
 */
const generarSchema = z.object({
  aporteIds: z.array(z.string()).default([]),
  socioIds: z.array(z.string()).default([]),
  gestion: z.coerce.number().min(2000, 'Gestión requerida'),
  mes: z.string().default(''), // '' = sin mes (opcional; mensual usa la ventana de vigencia)
});

type GenerarForm = z.infer<typeof generarSchema>;

const pagarSchema = z.object({
  monto: z.coerce.number().min(0.01, 'Monto requerido'),
  numeroRecibo: z.string().nullish().default(''),
  fechaPago: z.string().min(1, 'Fecha requerida'),
});

type PagarForm = z.infer<typeof pagarSchema>;

/** Badge de estado del socio con color del catálogo (hex inline). */
function SocioEstadoBadge({ registro, socioById }: { registro: AporteRegistro; socioById: Map<string, { estadoColor: string | null; estadoNombre: string | null }> }) {
  const socio = socioById.get(registro.socioId);
  if (!socio?.estadoNombre) return null;
  return (
    <Badge style={{ backgroundColor: socio.estadoColor ?? '#9ca3af', color: '#fff' }}>
      {socio.estadoNombre}
    </Badge>
  );
}

/** Ventana de vigencia legible de una definición: "2025-03-01 → 2025-05-31". */
function ventanaVigencia(a: Aporte): string {
  if (a.inicio && a.fin) return `${a.inicio} → ${a.fin}`;
  if (a.inicio) return `desde ${a.inicio}`;
  if (a.fin) return `hasta ${a.fin}`;
  return 'abierta';
}

export default function AportesPage() {
  const {
    aportes, aportesLoading, aportesError,
    addAporte, updateAporte, removeAporte,
    aporteRegistros, aporteRegistrosLoading, aporteRegistrosError, fetchAporteRegistros,
    pagarAporte, anularAporte, createAportesBulk, createAportesBulkAll, fetchPagosAporte,
    socios, fetchSocios, estadosSocio, accionesSocio, grupos, fetchConfig,
  } = useAppStore();

  const [tab, setTab] = useState<'crear' | 'pagar'>('pagar');
  const [filters, setFilters] = useState({ socioId: '', mes: '', gestion: '', estado: '', tipo: '', fechaDesde: '', fechaHasta: '', estadoId: '', grupoId: '' });
  const [payingId, setPayingId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');

  /* ── Definición CRUD state ── */
  const [showDefinicionForm, setShowDefinicionForm] = useState(false);
  const [editingDefinicion, setEditingDefinicion] = useState<Aporte | null>(null);
  const [definicionError, setDefinicionError] = useState<string | null>(null);
  const [savingDefinicion, setSavingDefinicion] = useState(false);

  /* ── Generación batch state ── */
  const [allSocios, setAllSocios] = useState(false);
  const [generando, setGenerando] = useState(false);

  /* ── Payment history (modal) state ── */
  const [pagosAporteId, setPagosAporteId] = useState<string | null>(null);
  const [pagos, setPagos] = useState<Movimiento[]>([]);
  const [pagosLoading, setPagosLoading] = useState(false);
  const [pagosError, setPagosError] = useState<string | null>(null);

  const definicionForm = useForm<DefinicionForm>({
    resolver: zodResolver(definicionSchema) as any,
    defaultValues: defaultDefinicion,
  });

  const generarForm = useForm<GenerarForm>({
    resolver: zodResolver(generarSchema) as any,
    defaultValues: {
      aporteIds: [],
      socioIds: [],
      gestion: new Date().getFullYear(),
      mes: '',
    },
  });

  const payForm = useForm<PagarForm>({
    resolver: zodResolver(pagarSchema) as any,
    defaultValues: { monto: 0, numeroRecibo: '', fechaPago: new Date().toISOString().split('T')[0] },
  });

  useEffect(() => {
    fetchSocios();
    fetchConfig();
  }, [fetchSocios, fetchConfig]);

  useEffect(() => {
    if (tab !== 'pagar') return;
    const hasFilters = filters.socioId || filters.mes || filters.gestion || filters.estado || filters.tipo || filters.fechaDesde || filters.fechaHasta || filters.estadoId || filters.grupoId;
    fetchAporteRegistros(hasFilters ? {
      socioId: filters.socioId || undefined,
      mes: filters.mes || undefined,
      gestion: filters.gestion || undefined,
      estado: filters.estado || undefined,
      tipo: filters.tipo || undefined,
      fechaDesde: filters.fechaDesde || undefined,
      fechaHasta: filters.fechaHasta || undefined,
      estadoId: filters.estadoId || undefined,
      grupoId: filters.grupoId || undefined,
    } : undefined);
  }, [tab, filters, fetchAporteRegistros]);

  const permitidos = socios.filter((s) =>
    socioPermiteUI(estadosSocio, accionesSocio, s.estadoId, 'aportes'),
  );
  const selectedSocioIds = allSocios ? permitidos.map((s) => s.id) : generarForm.watch('socioIds');
  const socioById = new Map(socios.map((s) => [s.id, s]));
  const aportesActivos = selectAportesActivos(aportes);
  const selectedDefiniciones = generarForm.watch('aporteIds')
    .map((id) => aportes.find((a) => a.id === id))
    .filter((a): a is Aporte => Boolean(a));

  /* ── Definición CRUD handlers ── */

  function openDefinicionCreate() {
    setEditingDefinicion(null);
    setDefinicionError(null);
    definicionForm.reset(defaultDefinicion);
    setShowDefinicionForm(true);
  }

  function openDefinicionEdit(a: Aporte) {
    setEditingDefinicion(a);
    setDefinicionError(null);
    definicionForm.reset({
      nombre: a.nombre,
      monto: a.monto,
      recurrencia: a.recurrencia,
      inicio: a.inicio ?? '',
      fin: a.fin ?? '',
      modalidadPago: a.modalidadPago,
      aplicaGrupoId: a.aplicaGrupoId ?? '',
      activo: a.activo === 1,
    });
    setShowDefinicionForm(true);
  }

  async function handleDefinicionSubmit(data: DefinicionForm) {
    // Ventana invertida: validación local (el API la rechaza con 400 igualmente).
    if (data.inicio && data.fin && data.fin < data.inicio) {
      setDefinicionError('La fecha de fin debe ser mayor o igual a la de inicio');
      return;
    }
    setDefinicionError(null);
    const payload = {
      nombre: data.nombre.trim(),
      monto: data.monto,
      recurrencia: data.recurrencia,
      inicio: data.inicio || null,
      fin: data.fin || null,
      modalidadPago: data.modalidadPago,
      aplicaGrupoId: data.aplicaGrupoId || null,
      activo: data.activo ? 1 : 0,
    };
    setSavingDefinicion(true);
    try {
      if (editingDefinicion) {
        await updateAporte(editingDefinicion.id, payload);
      } else {
        await addAporte(payload);
      }
      setShowDefinicionForm(false);
      setEditingDefinicion(null);
    } catch (e) {
      setDefinicionError((e as Error).message);
    } finally {
      setSavingDefinicion(false);
    }
  }

  async function handleRemoveDefinicion(a: Aporte) {
    if (!confirm(`¿Eliminar la definición "${a.nombre}"?`)) return;
    try {
      await removeAporte(a.id);
    } catch (e) {
      // 409 del API: definición en uso por socios (socio_aportes) o registros (aporte_id).
      // El mensaje amigable llega desde el API y se muestra tal cual.
      if ((e as { status?: number }).status === 409) {
        alert((e as Error).message || 'No se puede eliminar: hay socios o registros usando este aporte');
      } else {
        alert((e as Error).message);
      }
    }
  }

  /* ── Generación de cobros ── */

  function toggleDefinicion(id: string) {
    const current = generarForm.getValues('aporteIds');
    const next = current.includes(id) ? current.filter((a) => a !== id) : [...current, id];
    generarForm.setValue('aporteIds', next);
  }

  function toggleSocio(id: string) {
    const current = generarForm.getValues('socioIds');
    const next = current.includes(id) ? current.filter((s) => s !== id) : [...current, id];
    generarForm.setValue('socioIds', next, { shouldValidate: true });
  }

  /**
   * Generación definition-driven: `createAportesBulk` (POST /bulk con socioIds)
   * o `createAportesBulkAll` (POST /bulk/all sin socioIds, el server resuelve
   * los permitidos por estado). El payload NO lleva `tipo`/`monto`/`meses` —
   * monto y conteo salen de la definición (D8).
   */
  async function handleGenerar(data: GenerarForm) {
    if (data.aporteIds.length === 0) { alert('Seleccione al menos una definición'); return; }
    if (!allSocios && data.socioIds.length === 0) { alert('Seleccione al menos un socio'); return; }

    const body: BulkAporteRequest = {
      aporteIds: data.aporteIds,
      gestion: data.gestion,
    };
    if (data.mes !== '') body.mes = Number(data.mes);
    if (!allSocios) body.socioIds = data.socioIds;

    setGenerando(true);
    try {
      const res = allSocios
        ? await createAportesBulkAll(body)
        : await createAportesBulk(body);
      await fetchAporteRegistros();
      setAllSocios(false);
      generarForm.reset({ aporteIds: [], socioIds: [], gestion: new Date().getFullYear(), mes: '' });
      alert(`${res.count} cobro(s) generado(s)`);
    } catch (e) {
      // El 400 "Ningún socio puede participar..." de bulk/all llega como mensaje amigable.
      alert((e as Error).message ?? 'Error al generar cobros');
    } finally {
      setGenerando(false);
    }
  }

  async function handlePay(data: PagarForm) {
    if (payingId === null) return;
    await pagarAporte(payingId, { ...data, numeroRecibo: data.numeroRecibo ?? undefined });
    setPayingId(null);
    payForm.reset();
  }

  async function handleAnular() {
    if (voidingId === null || !voidReason.trim()) return;
    await anularAporte(voidingId, voidReason);
    setVoidingId(null);
    setVoidReason('');
  }

  /** Abre el modal de historial de pagos y trae los movimientos del cobro (GET /api/aportes/:id/pagos). */
  async function openPagos(id: string) {
    setPagosAporteId(id);
    setPagos([]);
    setPagosError(null);
    setPagosLoading(true);
    try {
      const items = await fetchPagosAporte(id);
      setPagos(items);
    } catch (e) {
      setPagosError((e as Error).message);
    } finally {
      setPagosLoading(false);
    }
  }

  const tabs = [
    { key: 'pagar' as const, label: 'Pagar Aportes' },
    { key: 'crear' as const, label: 'Crear Aportes' },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Aportes</h2>
      </div>

      <div className="mb-6 flex gap-1 rounded-lg border bg-gray-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB CREAR: definiciones (CRUD) + generación de cobros ── */}
      {tab === 'crear' && (
        <div className="space-y-6">
          {/* Definiciones */}
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Definiciones de Aporte</h3>
                <p className="text-xs text-gray-500">Las definiciones se asignan a socios y generan los cobros.</p>
              </div>
              <button
                onClick={openDefinicionCreate}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                + Nueva Definición
              </button>
            </div>

            {aportesLoading && <p className="text-gray-500">Cargando...</p>}
            {aportesError && <p className="text-red-600">Error: {aportesError}</p>}

            {!aportesLoading && !aportesError && aportes.length === 0 && (
              <p className="text-sm text-gray-500">No hay definiciones configuradas</p>
            )}

            <div className="space-y-2">
              {aportes.map((a) => {
                const grupo = a.aplicaGrupoId ? grupos.find((g) => g.id === a.aplicaGrupoId) : null;
                return (
                  <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-gray-50 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{a.nombre}</span>
                        {a.activo === 1
                          ? <Badge variant="green">activo</Badge>
                          : <Badge variant="default">inactivo</Badge>}
                        {a.aplicaGrupoId && (
                          <Badge variant="blue">Grupo: {grupo?.nombre ?? a.aplicaGrupoId}</Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                        <span>Bs {a.monto.toFixed(2)}</span>
                        <span>{RECURRENCIA_LABEL[a.recurrencia] ?? a.recurrencia}</span>
                        <span>{MODALIDAD_LABEL[a.modalidadPago] ?? a.modalidadPago}</span>
                        <span>Vigencia: {ventanaVigencia(a)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openDefinicionEdit(a)}
                        className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleRemoveDefinicion(a)}
                        className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Generación de cobros */}
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold text-gray-900">Generar Cobros</h3>
            <form onSubmit={generarForm.handleSubmit(handleGenerar)} className="space-y-4">
              <div>
                <label className={labelCls}>Definiciones (una o más)</label>
                <div className="flex min-h-10 flex-wrap gap-2 rounded-lg border border-gray-300 p-2">
                  {aportesActivos.length === 0 && (
                    <span className="text-xs text-gray-400">No hay definiciones activas. Cree una definición arriba.</span>
                  )}
                  {aportesActivos.map((a) => {
                    const selected = generarForm.watch('aporteIds').includes(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => toggleDefinicion(a.id)}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors ${
                          selected
                            ? 'bg-blue-600 text-white'
                            : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {a.nombre}
                        {selected && <span aria-hidden>×</span>}
                      </button>
                    );
                  })}
                </div>
                {selectedDefiniciones.length > 0 && (
                  <p className="mt-1 text-xs text-gray-400">
                    {selectedDefiniciones.map((d) => `${d.nombre} (Bs ${d.monto.toFixed(2)})`).join(' · ')}
                  </p>
                )}
              </div>

              <div>
                <label className={labelCls}>Socios (solo con permiso de "aportes")</label>
                <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
                  <input type="checkbox" checked={allSocios} onChange={(e) => setAllSocios(e.target.checked)} className="rounded border-gray-300" />
                  Todos los socios habilitados ({permitidos.length})
                </label>
                {!allSocios && (
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 p-2">
                    {permitidos.map((s) => {
                      const checked = generarForm.watch('socioIds').includes(s.id);
                      return (
                        <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50">
                          <input type="checkbox" checked={checked} onChange={() => toggleSocio(s.id)} className="rounded border-gray-300" />
                          {s.nombre} {s.apellidoPaterno}
                        </label>
                      );
                    })}
                    {permitidos.length === 0 && <p className="px-2 py-1 text-sm text-gray-400">Ningún socio tiene permiso de "aportes".</p>}
                  </div>
                )}
                <p className="mt-1 text-xs text-gray-400">{selectedSocioIds.length} socio(s) seleccionado(s)</p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelCls}>Gestión</label>
                  <input type="number" {...generarForm.register('gestion')} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Mes <span className="font-normal text-gray-400">(opcional)</span></label>
                  <select {...generarForm.register('mes')} className={inputCls}>
                    <option value="">—</option>
                    {Array.from({ length: 12 }, (_, i) => (<option key={i + 1} value={i + 1}>{i + 1}</option>))}
                  </select>
                </div>
                <div className="flex items-end">
                  <p className="text-xs text-gray-500">
                    Mes inicial para mensual; para anual se generan los 12 meses; único/extraordinario generan 1 cobro.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="submit"
                  disabled={generando || (selectedSocioIds.length === 0 && !allSocios) || generarForm.watch('aporteIds').length === 0}
                  className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {generando ? 'Generando...' : 'Generar Cobros'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── TAB PAGAR / LISTAR ── */}
      {tab === 'pagar' && (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <select value={filters.socioId} onChange={(e) => setFilters((f) => ({ ...f, socioId: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
              <option value="">Todos los socios</option>
              {socios.map((s) => (<option key={s.id} value={s.id}>{s.nombre} {s.apellidoPaterno}</option>))}
            </select>
            <select value={filters.estadoId} onChange={(e) => setFilters((f) => ({ ...f, estadoId: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
              <option value="">Todos los estados de socio</option>
              {estadosSocio.map((e) => (<option key={e.id} value={e.id}>● {e.nombre}</option>))}
            </select>
            <select value={filters.grupoId} onChange={(e) => setFilters((f) => ({ ...f, grupoId: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
              <option value="">Todos los grupos</option>
              {grupos.map((g) => (<option key={g.id} value={g.id}>{g.nombre}</option>))}
            </select>
            <select value={filters.mes} onChange={(e) => setFilters((f) => ({ ...f, mes: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
              <option value="">Todos los meses</option>
              {Array.from({ length: 12 }, (_, i) => (<option key={i + 1} value={i + 1}>{i + 1}</option>))}
            </select>
            <input type="number" placeholder="Gestión" value={filters.gestion} onChange={(e) => setFilters((f) => ({ ...f, gestion: e.target.value }))} className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            <select value={filters.tipo} onChange={(e) => setFilters((f) => ({ ...f, tipo: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
              <option value="">Todos los tipos</option>
              <option value="mensual">Mensual</option>
              <option value="extraordinario">Extraordinario</option>
              <option value="anual">Anual</option>
              <option value="unico">Único</option>
            </select>
            <select value={filters.estado} onChange={(e) => setFilters((f) => ({ ...f, estado: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
              <option value="">Todos los estados de pago</option>
              <option value="pagado">Pagado</option>
              <option value="pendiente">Pendiente</option>
              <option value="anulado">Anulado</option>
            </select>
            <input type="date" value={filters.fechaDesde} onChange={(e) => setFilters((f) => ({ ...f, fechaDesde: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" placeholder="Pago desde" />
            <input type="date" value={filters.fechaHasta} onChange={(e) => setFilters((f) => ({ ...f, fechaHasta: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" placeholder="Pago hasta" />
          </div>

          {aporteRegistrosLoading && <p className="text-gray-500">Cargando...</p>}
          {aporteRegistrosError && <p className="text-red-600">Error: {aporteRegistrosError}</p>}

          {!aporteRegistrosLoading && !aporteRegistrosError && aporteRegistros.length === 0 && (
            <div className="rounded-xl border bg-white p-12 text-center"><p className="text-gray-500">No hay cobros registrados</p></div>
          )}

          {/* Tabla sm+ */}
          {aporteRegistros.length > 0 && (
            <div className="hidden overflow-x-auto rounded-xl border bg-white shadow-sm sm:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr><th className="px-4 py-3">Socio</th><th className="px-4 py-3">Mes</th><th className="px-4 py-3">Gestión</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Monto</th><th className="px-4 py-3">Pagado</th><th className="px-4 py-3">Saldo</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Acciones</th></tr>
                </thead>
                <tbody className="divide-y">
                  {aporteRegistros.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{a.socioNombre ? `${a.socioNombre} ${a.socioApellido ?? ''}` : a.socioId}</span>
                          <SocioEstadoBadge registro={a} socioById={socioById} />
                        </div>
                      </td>
                      <td className="px-4 py-3">{a.mes}</td>
                      <td className="px-4 py-3">{a.gestion}</td>
                      <td className="px-4 py-3">{a.tipo}</td>
                      <td className="px-4 py-3">Bs {a.montoBase.toFixed(2)}</td>
                      <td className="px-4 py-3">Bs {(a.montoPagado ?? 0).toFixed(2)}</td>
                      <td className="px-4 py-3">Bs {(a.saldoPendiente ?? a.montoBase).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          a.estado === 'pagado' ? 'bg-green-100 text-green-700'
                          : a.estado === 'anulado' ? 'bg-gray-100 text-gray-500'
                          : 'bg-yellow-100 text-yellow-700'
                        }`}>{a.estado}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => openPagos(a.id)} className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50">Pagos</button>
                          {a.estado === 'pendiente' && (
                            <>
                              <button onClick={() => { setPayingId(a.id); payForm.setValue('monto', a.saldoPendiente ?? a.montoBase); }} className="rounded px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50">Pagar</button>
                              <button onClick={() => { setVoidingId(a.id); setVoidReason(''); }} className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Anular</button>
                            </>
                          )}
                          {a.estado === 'pagado' && a.fechaPago && <span className="text-xs text-gray-400">Pagado: {a.fechaPago}</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Cards móvil ~360px */}
          {aporteRegistros.length > 0 && (
            <div className="space-y-3 sm:hidden">
              {aporteRegistros.map((a) => (
                <div key={a.id} className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-gray-900">{a.socioNombre ? `${a.socioNombre} ${a.socioApellido ?? ''}` : a.socioId}</span>
                    <SocioEstadoBadge registro={a} socioById={socioById} />
                  </div>
                  <dl className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between gap-2"><dt className="text-gray-500">Mes / Gestión</dt><dd>{a.mes} / {a.gestion}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-gray-500">Tipo</dt><dd>{a.tipo}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-gray-500">Monto</dt><dd>Bs {a.montoBase.toFixed(2)}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-gray-500">Saldo</dt><dd>Bs {(a.saldoPendiente ?? a.montoBase).toFixed(2)}</dd></div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-gray-500">Estado</dt>
                      <dd><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${a.estado === 'pagado' ? 'bg-green-100 text-green-700' : a.estado === 'anulado' ? 'bg-gray-100 text-gray-500' : 'bg-yellow-100 text-yellow-700'}`}>{a.estado}</span></dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => openPagos(a.id)} className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50">Pagos</button>
                    {a.estado === 'pendiente' && (
                      <>
                        <button onClick={() => { setPayingId(a.id); payForm.setValue('monto', a.saldoPendiente ?? a.montoBase); }} className="rounded px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50">Pagar</button>
                        <button onClick={() => { setVoidingId(a.id); setVoidReason(''); }} className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Anular</button>
                      </>
                    )}
                    {a.estado === 'pagado' && a.fechaPago && <span className="text-xs text-gray-400">Pagado: {a.fechaPago}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* DEFINICIÓN MODAL — crear/editar */}
      {showDefinicionForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-gray-900">
              {editingDefinicion ? `Editar definición: ${editingDefinicion.nombre}` : 'Nueva Definición'}
            </h3>

            {definicionError && (
              <p className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-600">{definicionError}</p>
            )}

            <form onSubmit={definicionForm.handleSubmit(handleDefinicionSubmit)} className="space-y-3">
              {editingDefinicion && (
                <div>
                  <label className={labelCls}>ID (inmutable)</label>
                  <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-600">{editingDefinicion.id}</p>
                </div>
              )}
              <div>
                <label className={labelCls}>Nombre *</label>
                <input {...definicionForm.register('nombre')} className={inputCls} />
                {definicionForm.formState.errors.nombre && <p className="text-xs text-red-500">{definicionForm.formState.errors.nombre.message}</p>}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Monto (Bs) *</label>
                  <input type="number" step="0.01" min="0" {...definicionForm.register('monto')} className={inputCls} />
                  {definicionForm.formState.errors.monto && <p className="text-xs text-red-500">{definicionForm.formState.errors.monto.message}</p>}
                </div>
                <div>
                  <label className={labelCls}>Recurrencia</label>
                  <select {...definicionForm.register('recurrencia')} className={inputCls}>
                    <option value="mensual">Mensual</option>
                    <option value="anual">Anual (12 meses)</option>
                    <option value="unico">Único</option>
                    <option value="extraordinario">Extraordinario</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Inicio (vigencia)</label>
                  <input type="date" {...definicionForm.register('inicio')} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Fin (vigencia)</label>
                  <input type="date" {...definicionForm.register('fin')} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Modalidad de pago</label>
                  <select {...definicionForm.register('modalidadPago')} className={inputCls}>
                    <option value="cuotas">Cuotas</option>
                    <option value="parciales">Parciales</option>
                    <option value="pago_unico">Pago único</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Aplica a grupo <span className="font-normal text-gray-400">(opcional)</span></label>
                  <select {...definicionForm.register('aplicaGrupoId')} className={inputCls}>
                    <option value="">Global (todos)</option>
                    {grupos.map((g) => (<option key={g.id} value={g.id}>{g.nombre}</option>))}
                  </select>
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" {...definicionForm.register('activo')} className="rounded border-gray-300" />
                Activo (se puede asignar a socios y generar cobros)
              </label>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowDefinicionForm(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Cancelar
                </button>
                <button type="submit" disabled={savingDefinicion} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {savingDefinicion ? 'Guardando...' : editingDefinicion ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PAY MODAL */}
      {payingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-gray-900">Registrar Pago</h3>
            {payingId && aporteRegistros.find((a) => a.id === payingId) && (
              <p className="mb-3 text-sm text-gray-600">Saldo pendiente: Bs {(aporteRegistros.find((a) => a.id === payingId)!.saldoPendiente ?? aporteRegistros.find((a) => a.id === payingId)!.montoBase).toFixed(2)}</p>
            )}
            <form onSubmit={payForm.handleSubmit(handlePay)} className="space-y-3">
              <div><label className={labelCls}>Monto (Bs)</label><input type="number" step="0.01" {...payForm.register('monto')} className={inputCls} /></div>
              <div><label className={labelCls}>N° Recibo</label><input {...payForm.register('numeroRecibo')} className={inputCls} /></div>
              <div><label className={labelCls}>Fecha de Pago</label><input type="date" {...payForm.register('fechaPago')} className={inputCls} /></div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setPayingId(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
                <button type="submit" className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">Pagar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PAGOS MODAL — historial de movimientos del cobro */}
      {pagosAporteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-gray-900">Historial de Pagos</h3>
            {pagosAporteId && aporteRegistros.find((a) => a.id === pagosAporteId) && (
              <p className="mb-3 text-sm text-gray-600">
                {aporteRegistros.find((a) => a.id === pagosAporteId)!.socioNombre ?? pagosAporteId} · Bs{' '}
                {(aporteRegistros.find((a) => a.id === pagosAporteId)!.montoBase ?? 0).toFixed(2)}
              </p>
            )}
            {pagosLoading && <p className="text-sm text-gray-500">Cargando...</p>}
            {pagosError && <p className="text-sm text-red-600">Error: {pagosError}</p>}
            {!pagosLoading && !pagosError && (
              pagos.length === 0 ? (
                <p className="text-sm text-gray-500">Sin movimientos registrados.</p>
              ) : (
                <ul className="max-h-72 divide-y overflow-y-auto">
                  {pagos.map((p) => (
                    <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                      <div className="pr-3">
                        <p className="font-medium text-gray-900">Bs {p.monto.toFixed(2)}</p>
                        <p className="text-xs text-gray-500">
                          {p.fecha}
                          {p.numeroRecibo ? ` · Recibo ${p.numeroRecibo}` : ''}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.anulado === 1 ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'
                      }`}>
                        {p.anulado === 1 ? 'Anulado' : 'Pagado'}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            )}
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setPagosAporteId(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* VOID MODAL */}
      {voidingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-gray-900">Anular Aporte</h3>
            <p className="mb-3 text-sm text-gray-600">Ingrese el motivo de la anulación:</p>
            <textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} className={inputCls} rows={3} placeholder="Motivo de anulación..." />
            <div className="flex justify-end gap-3 pt-3">
              <button type="button" onClick={() => setVoidingId(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
              <button type="button" onClick={handleAnular} disabled={!voidReason.trim()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">Anular</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
