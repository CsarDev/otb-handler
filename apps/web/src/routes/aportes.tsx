import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAppStore } from '../stores/app.store';
import { socioPermiteUI } from '../lib/permisos';
import { Badge } from '@otb/ui';
import type { Aporte } from '@otb/core';

const pagarSchema = z.object({
  monto: z.coerce.number().min(0.01, 'Monto requerido'),
  numeroRecibo: z.string().nullish().default(''),
  fechaPago: z.string().min(1, 'Fecha requerida'),
});

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
  const { aportes, aportesLoading, aportesError, fetchAportes, pagarAporte, anularAporte } = useAppStore();
  const { socios, fetchSocios } = useAppStore();
  const { estadosSocio, accionesSocio, grupos, fetchConfig } = useAppStore();
  const [tab, setTab] = useState<'crear' | 'pagar'>('pagar');
  const [filters, setFilters] = useState({ socioId: '', mes: '', gestion: '', estado: '', tipo: '', fechaDesde: '', fechaHasta: '', estadoId: '', grupoId: '' });
  const [payingId, setPayingId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');

  /* ── Create batch form state ── */
  const [createTipo, setCreateTipo] = useState<'mensual' | 'unico' | 'anual'>('mensual');
  const [createMonto, setCreateMonto] = useState(0);
  const [createGestion, setCreateGestion] = useState(new Date().getFullYear());
  const [createMes, setCreateMes] = useState(new Date().getMonth() + 1);
  const [createMeses, setCreateMeses] = useState(1);
  const [createSocios, setCreateSocios] = useState<string[]>([]);
  const [allSocios, setAllSocios] = useState(false);
  const [creating, setCreating] = useState(false);

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

  async function handleCreate() {
    // Solo socios cuyo estado permite "aportes"
    const seleccionables = socios.filter((s) =>
      socioPermiteUI(estadosSocio, accionesSocio, s.estadoId, 'aportes'),
    );
    const selectedIds = allSocios ? seleccionables.map((s) => s.id) : createSocios;
    if (selectedIds.length === 0) { alert('Seleccione al menos un socio'); return; }
    if (!createMonto || createMonto <= 0) { alert('Ingrese un monto válido'); return; }

    try {
      const body: any = {
        socioIds: selectedIds,
        montoBase: createMonto,
        tipo: createTipo,
        gestion: createGestion,
      };
      if (createTipo !== 'anual') body.mes = createMes;
      if (createTipo === 'anual') body.meses = createMeses;

      const res = await fetch('/api/aportes/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? 'Error al crear aportes');
        return;
      }
      await fetchAportes();
      setCreateSocios([]);
      setAllSocios(false);
      alert(`${selectedIds.length} aporte(s) creado(s)`);
    } catch {
      alert('Error al crear aportes');
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
    setCreateSocios((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  }

  const permitidos = socios.filter((s) =>
    socioPermiteUI(estadosSocio, accionesSocio, s.estadoId, 'aportes'),
  );
  const selectedIds = allSocios ? permitidos.map((s) => s.id) : createSocios;
  const socioById = new Map(socios.map((s) => [s.id, s]));

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
          <h3 className="mb-4 text-lg font-bold text-gray-900">Crear Aportes</h3>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-medium text-gray-600">Socios (solo con permiso de "aportes")</label>
              <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
                <input type="checkbox" checked={allSocios} onChange={(e) => setAllSocios(e.target.checked)} className="rounded border-gray-300" />
                Todos los socios habilitados ({permitidos.length})
              </label>
              {!allSocios && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 p-2">
                  {permitidos.map((s) => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50">
                      <input type="checkbox" checked={createSocios.includes(s.id)} onChange={() => toggleSocio(s.id)} className="rounded border-gray-300" />
                      {s.nombre} {s.apellidoPaterno}
                    </label>
                  ))}
                </div>
              )}
              <p className="mt-1 text-xs text-gray-400">{selectedIds.length} socio(s) seleccionado(s)</p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Tipo</label>
                <select value={createTipo} onChange={(e) => setCreateTipo(e.target.value as typeof createTipo)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                  <option value="unico">Único</option>
                  <option value="mensual">Mensual</option>
                  <option value="anual">Anual (varios meses)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Monto (Bs)</label>
                <input type="number" step="0.01" value={createMonto} onChange={(e) => setCreateMonto(Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Gestión</label>
                <input type="number" value={createGestion} onChange={(e) => setCreateGestion(Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {createTipo !== 'anual' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Mes</label>
                  <select value={createMes} onChange={(e) => setCreateMes(Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                    {Array.from({ length: 12 }, (_, i) => (<option key={i + 1} value={i + 1}>{i + 1}</option>))}
                  </select>
                </div>
              )}
              {createTipo === 'anual' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Meses (1-12)</label>
                  <input type="number" min={1} max={12} value={createMeses} onChange={(e) => setCreateMeses(Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={handleCreate} disabled={selectedIds.length === 0 || !createMonto} className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                Crear {selectedIds.length > 0 ? `${selectedIds.length} aporte(s)` : ''}
              </button>
            </div>
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
