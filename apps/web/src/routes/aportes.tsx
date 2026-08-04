import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAppStore } from '../stores/app.store';
import { socioPermiteUI } from '../lib/permisos';
import { Badge } from '@otb/ui';
import type { Aporte, Movimiento, BulkAporteRequest } from '@otb/core';

/**
 * Schema del form de creación batch. Se eliminó `montoBase` suelto: para
 * `mensual`/`anual` el monto SIEMPRE lo deriva la API del tipo de aporte de
 * cada socio (D4/D6), así que solo existe `monto` como override opcional y se
 * muestra/valida SOLO para `unico`/`extraordinario`.
 */
const crearSchema = z.object({
  socioIds: z.array(z.string()).default([]),
  tipo: z.enum(['mensual', 'unico', 'anual', 'extraordinario']),
  // '' = sin override (el monto deriva del tipo); número = override para unico/extra
  monto: z.union([z.literal(''), z.coerce.number().min(0.01, 'Monto requerido')]).default(''),
  gestion: z.coerce.number().min(2000, 'Gestión requerida'),
  mes: z.coerce.number().int().min(1).max(12),
});

const pagarSchema = z.object({
  monto: z.coerce.number().min(0.01, 'Monto requerido'),
  numeroRecibo: z.string().nullish().default(''),
  fechaPago: z.string().min(1, 'Fecha requerida'),
});

type CrearForm = z.infer<typeof crearSchema>;
type PagarForm = z.infer<typeof pagarSchema>;

/** Badge de estado del socio con color del catálogo (hex inline). */
function SocioEstadoBadge({ aporte, socioById }: { aporte: Aporte; socioById: Map<string, { estadoColor: string | null; estadoNombre: string | null }> }) {
  const socio = socioById.get(aporte.socioId);
  if (!socio?.estadoNombre) return null;
  return (
    <Badge style={{ backgroundColor: socio.estadoColor ?? '#9ca3af', color: '#fff' }}>
      {socio.estadoNombre}
    </Badge>
  );
}

export default function AportesPage() {
  const {
    aportes, aportesLoading, aportesError, fetchAportes, pagarAporte, anularAporte,
    createAportesBulk, createAportesBulkAll, fetchPagosAporte,
  } = useAppStore();
  const { socios, fetchSocios } = useAppStore();
  const { estadosSocio, accionesSocio, grupos, tiposAporte, fetchConfig } = useAppStore();
  const [tab, setTab] = useState<'crear' | 'pagar'>('pagar');
  const [filters, setFilters] = useState({ socioId: '', mes: '', gestion: '', estado: '', tipo: '', fechaDesde: '', fechaHasta: '', estadoId: '', grupoId: '' });
  const [payingId, setPayingId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');

  /* ── Create batch form state ── */
  const [allSocios, setAllSocios] = useState(false);
  const [creating, setCreating] = useState(false);

  /* ── Payment history (modal) state ── */
  const [pagosAporteId, setPagosAporteId] = useState<string | null>(null);
  const [pagos, setPagos] = useState<Movimiento[]>([]);
  const [pagosLoading, setPagosLoading] = useState(false);
  const [pagosError, setPagosError] = useState<string | null>(null);

  const createForm = useForm<CrearForm>({
    resolver: zodResolver(crearSchema) as any,
    defaultValues: {
      socioIds: [],
      tipo: 'mensual',
      monto: '',
      gestion: new Date().getFullYear(),
      mes: new Date().getMonth() + 1,
    },
  });

  const payForm = useForm<PagarForm>({
    resolver: zodResolver(pagarSchema) as any,
    defaultValues: { monto: 0, numeroRecibo: '', fechaPago: new Date().toISOString().split('T')[0] },
  });

  const createTipo = createForm.watch('tipo');
  // D4: el override de monto solo aplica a unico/extraordinario.
  const permiteOverride = createTipo === 'unico' || createTipo === 'extraordinario';

  useEffect(() => {
    fetchSocios();
    fetchConfig();
  }, [fetchSocios, fetchConfig]);

  useEffect(() => {
    if (tab !== 'pagar') return;
    const hasFilters = filters.socioId || filters.mes || filters.gestion || filters.estado || filters.tipo || filters.fechaDesde || filters.fechaHasta || filters.estadoId || filters.grupoId;
    fetchAportes(hasFilters ? {
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
  }, [tab, filters, fetchAportes]);

  const permitidos = socios.filter((s) =>
    socioPermiteUI(estadosSocio, accionesSocio, s.estadoId, 'aportes'),
  );
  const selectedIds = allSocios ? permitidos.map((s) => s.id) : createForm.watch('socioIds');
  const socioById = new Map(socios.map((s) => [s.id, s]));

  /**
   * Firmada por el checkbox "Todos los socios habilitados": NO se arma el select
   * en el cliente. Si `allSocios` → `createAportesBulkAll` (POST /api/aportes/bulk/all,
   * sin socioIds, el server resuelve los permitidos por estado). Si no → `createAportesBulk`
   * (POST /api/aportes/bulk) con socioIds explícitos. El form ya no envía `montoBase`
   * (el monto deriva del tipo de cada socio) y NO envía `meses` para anual (el API fuerza 12).
   */
  async function handleCreate(data: CrearForm) {
    if (!allSocios && data.socioIds.length === 0) { alert('Seleccione al menos un socio'); return; }

    const overrideMonto = data.monto === '' ? undefined : Number(data.monto);
    const body: BulkAporteRequest = {
      tipo: data.tipo,
      gestion: data.gestion,
    };
    if (!allSocios) body.socioIds = data.socioIds;
    // anual NO manda `meses`: la API crea exactamente 12 registros (enero-diciembre).
    if (data.tipo !== 'anual') body.mes = data.mes;
    if (permiteOverride && overrideMonto !== undefined) body.monto = overrideMonto;

    setCreating(true);
    try {
      const res = allSocios
        ? await createAportesBulkAll(body)
        : await createAportesBulk(body);
      await fetchAportes();
      setAllSocios(false);
      createForm.reset();
      alert(`${res.count} aporte(s) creado(s)`);
    } catch (e) {
      // El 400 "Ningún socio puede participar..." de bulk/all llega como mensaje amigable.
      alert((e as Error).message ?? 'Error al crear aportes');
    } finally {
      setCreating(false);
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

  function toggleSocio(id: string) {
    const current = createForm.getValues('socioIds');
    if (current.includes(id)) {
      createForm.setValue('socioIds', current.filter((s) => s !== id), { shouldValidate: true });
    } else {
      createForm.setValue('socioIds', [...current, id], { shouldValidate: true });
    }
  }

  /** Montos derivados (por tipo) de los socios seleccionados, para mostrarlos en el form. */
  const montosDerivados = Array.from(
    (() => {
      const mapa = new Map<string, { nombre: string; monto: number }>();
      for (const id of selectedIds) {
        const socio = socios.find((s) => s.id === id);
        const tipo = tiposAporte.find((t) => t.id === socio?.tipoAporteId);
        if (tipo && !mapa.has(tipo.id)) mapa.set(tipo.id, { nombre: tipo.nombre, monto: tipo.montoBase });
      }
      return mapa;
    })().values(),
  );

  /** Abre el modal de historial de pagos y trae los movimientos del aporte (GET /api/aportes/:id/pagos). */
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

      {/* ── TAB CREAR ── */}
      {tab === 'crear' && (
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-bold text-gray-900">Crear Aportes Batch</h3>
          <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-medium text-gray-600">Socios (solo con permiso de "aportes")</label>
              <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
                <input type="checkbox" checked={allSocios} onChange={(e) => setAllSocios(e.target.checked)} className="rounded border-gray-300" />
                Todos los socios habilitados ({permitidos.length})
              </label>
              {!allSocios && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 p-2">
                  {permitidos.map((s) => {
                    const checked = createForm.watch('socioIds').includes(s.id);
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
              <p className="mt-1 text-xs text-gray-400">{selectedIds.length} socio(s) seleccionado(s)</p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Tipo</label>
                <select {...createForm.register('tipo')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                  <option value="mensual">Mensual</option>
                  <option value="unico">Único</option>
                  <option value="anual">Anual (12 meses)</option>
                  <option value="extraordinario">Extraordinario</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Gestión</label>
                <input type="number" {...createForm.register('gestion')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              {createTipo !== 'anual' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Mes</label>
                  <select {...createForm.register('mes')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                    {Array.from({ length: 12 }, (_, i) => (<option key={i + 1} value={i + 1}>{i + 1}</option>))}
                  </select>
                </div>
              )}
              {createTipo === 'anual' && (
                <div className="flex items-end">
                  <p className="text-xs text-gray-500">Se crean los 12 meses (enero–diciembre).</p>
                </div>
              )}
            </div>

            {/* D4: override de monto solo para unico/extraordinario; para mensual/anual deriva del tipo */}
            {permiteOverride ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Monto (Bs) — override <span className="font-normal text-gray-400">(vacío = monto del tipo)</span></label>
                <input type="number" step="0.01" {...createForm.register('monto')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                {createForm.formState.errors.monto && <p className="text-xs text-red-500">{createForm.formState.errors.monto.message}</p>}
              </div>
            ) : (
              montosDerivados.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Monto (derivado del tipo de cada socio)</label>
                  <p className="text-sm text-gray-600">
                    {montosDerivados.map((m) => `Bs ${m.monto.toFixed(2)} (${m.nombre})`).join(' · ')}
                  </p>
                </div>
              )
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button type="submit" disabled={creating || (selectedIds.length === 0 && !allSocios)} className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {creating ? 'Creando...' : `Crear ${selectedIds.length > 0 ? `${selectedIds.length} aporte(s)` : ''}`}
              </button>
            </div>
          </form>
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

          {aportesLoading && <p className="text-gray-500">Cargando...</p>}
          {aportesError && <p className="text-red-600">Error: {aportesError}</p>}

          {!aportesLoading && !aportesError && aportes.length === 0 && (
            <div className="rounded-xl border bg-white p-12 text-center"><p className="text-gray-500">No hay aportes registrados</p></div>
          )}

          {/* Tabla sm+ */}
          {aportes.length > 0 && (
            <div className="hidden overflow-x-auto rounded-xl border bg-white shadow-sm sm:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr><th className="px-4 py-3">Socio</th><th className="px-4 py-3">Mes</th><th className="px-4 py-3">Gestión</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Monto</th><th className="px-4 py-3">Pagado</th><th className="px-4 py-3">Saldo</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Acciones</th></tr>
                </thead>
                <tbody className="divide-y">
                  {aportes.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{a.socioNombre ? `${a.socioNombre} ${a.socioApellido ?? ''}` : a.socioId}</span>
                          <SocioEstadoBadge aporte={a} socioById={socioById} />
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
          {aportes.length > 0 && (
            <div className="space-y-3 sm:hidden">
              {aportes.map((a) => (
                <div key={a.id} className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-gray-900">{a.socioNombre ? `${a.socioNombre} ${a.socioApellido ?? ''}` : a.socioId}</span>
                    <SocioEstadoBadge aporte={a} socioById={socioById} />
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

      {/* PAY MODAL */}
      {payingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-gray-900">Registrar Pago</h3>
            {payingId && aportes.find((a) => a.id === payingId) && (
              <p className="mb-3 text-sm text-gray-600">Saldo pendiente: Bs {(aportes.find((a) => a.id === payingId)!.saldoPendiente ?? aportes.find((a) => a.id === payingId)!.montoBase).toFixed(2)}</p>
            )}
            <form onSubmit={payForm.handleSubmit(handlePay)} className="space-y-3">
              <div><label className="mb-1 block text-xs font-medium text-gray-600">Monto (Bs)</label><input type="number" step="0.01" {...payForm.register('monto')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-600">N° Recibo</label><input {...payForm.register('numeroRecibo')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" /></div>
              <div><label className="mb-1 block text-xs font-medium text-gray-600">Fecha de Pago</label><input type="date" {...payForm.register('fechaPago')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" /></div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setPayingId(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
                <button type="submit" className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">Pagar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PAGOS MODAL — historial de movimientos del aporte */}
      {pagosAporteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-gray-900">Historial de Pagos</h3>
            {pagosAporteId && aportes.find((a) => a.id === pagosAporteId) && (
              <p className="mb-3 text-sm text-gray-600">
                {aportes.find((a) => a.id === pagosAporteId)!.socioNombre ?? pagosAporteId} · Bs{' '}
                {(aportes.find((a) => a.id === pagosAporteId)!.montoBase ?? 0).toFixed(2)}
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
            <textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" rows={3} placeholder="Motivo de anulación..." />
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