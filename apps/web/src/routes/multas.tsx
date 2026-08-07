import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAppStore } from '../stores/app.store';
import { socioPermiteUI } from '../lib/permisos';
import { Badge, MultiSelect, Pagination } from '@otb/ui';
import type { Multa, Socio } from '@otb/core';

const createMultaSchema = z
  .object({
    // D41: socioIds ya no es obligatorio SOLO — se exige al menos un socio O un grupo.
    socioIds: z.array(z.string()),
    concepto: z.string().min(1, 'Concepto requerido'),
    monto: z.coerce.number().min(1, 'Monto requerido'),
    actividadId: z.string().nullish().default(''),
    grupoIds: z.array(z.string()).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.socioIds.length === 0 && data.grupoIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Seleccione al menos un socio o grupo',
        path: ['socioIds'],
      });
    }
  });

const pagarSchema = z.object({
  monto: z.coerce.number().min(0.01, 'Monto requerido'),
  numeroRecibo: z.string().nullish().default(''),
  fechaPago: z.string().min(1, 'Fecha requerida'),
});

type CreateMultaForm = z.infer<typeof createMultaSchema>;
type PagarForm = z.infer<typeof pagarSchema>;

/** Unión deduplicada (cliente, best-effort) de los socios objetivo (D41): miembros
 *  ACTUALES de los grupos seleccionados (primario O adicional) ∪ socios directos.
 *  Hint display-only — el servidor re-resuelve autoritativamente vía sociosPorGrupos (D35). */
function calcularSociosObjetivo(socios: Socio[], selectedSocioIds: string[], selectedGrupoIds: string[]): number {
  const ids = new Set<string>(selectedSocioIds);
  for (const gid of selectedGrupoIds) {
    for (const s of socios) {
      if (s.grupoPrimarioId === gid || s.grupos.some((g) => g.id === gid)) {
        ids.add(s.id);
      }
    }
  }
  return ids.size;
}

/** Badge de estado del socio con color del catálogo (hex inline). */
function SocioEstadoBadge({ multa, socioById }: { multa: Multa; socioById: Map<string, { estadoColor: string | null; estadoNombre: string | null }> }) {
  const socio = socioById.get(multa.socioId);
  if (!socio?.estadoNombre) return null;
  return (
    <Badge style={{ backgroundColor: socio.estadoColor ?? '#9ca3af', color: '#fff' }}>
      {socio.estadoNombre}
    </Badge>
  );
}

export default function MultasPage() {
  const { multas, multasTotal, multasPage, multasPageSize, multasLoading, multasError, pagarMulta, anularMulta, createMultasBulk, setMultasPage, setMultasPageSize } = useAppStore();
  const { socios, fetchSocios, actividades, fetchActividades } = useAppStore();
  const { estadosSocio, accionesSocio, grupos, fetchConfig } = useAppStore();
  const [tab, setTab] = useState<'crear' | 'listar'>('listar');
  const [filters, setFilters] = useState({ socioId: '', estado: '', actividadId: '', fechaDesde: '', fechaHasta: '', gestion: '', estadoId: '', grupoId: '' });
  // D38: filtros mapeados (undefined si vacíos) compartidos por el efecto de
  // reset y por onPageChange del Pagination — mismo objeto en ambos caminos.
  const hasListarFilters = Boolean(filters.socioId || filters.estado || filters.actividadId || filters.fechaDesde || filters.fechaHasta || filters.gestion || filters.estadoId || filters.grupoId);
  const listarFilters = hasListarFilters
    ? {
        socioId: filters.socioId || undefined,
        estado: filters.estado || undefined,
        actividadId: filters.actividadId || undefined,
        fechaDesde: filters.fechaDesde || undefined,
        fechaHasta: filters.fechaHasta || undefined,
        gestion: filters.gestion || undefined,
        estadoId: filters.estadoId || undefined,
        grupoId: filters.grupoId || undefined,
      }
    : undefined;
  const [createOpen, setCreateOpen] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  // D41: selección de grupos del MultiSelect (los socios viven en el form).
  const [selectedGrupoIds, setSelectedGrupoIds] = useState<string[]>([]);

  const createForm = useForm<CreateMultaForm>({
    resolver: zodResolver(createMultaSchema) as any,
    defaultValues: { socioIds: [], concepto: '', monto: 0, actividadId: '', grupoIds: [] },
  });

  const payForm = useForm<PagarForm>({
    resolver: zodResolver(pagarSchema) as any,
    defaultValues: { monto: 0, numeroRecibo: '', fechaPago: new Date().toISOString().split('T')[0] },
  });

  useEffect(() => {
    fetchSocios();
    fetchActividades();
    fetchConfig();
  }, [fetchSocios, fetchActividades, fetchConfig]);

  useEffect(() => {
    if (tab !== 'listar') return;
    // D38: reset a página 1 ante cualquier cambio de filtros/tab. El dep NO
    // incluye multasPage (loop guard): onPageChange pasa los filtros actuales y
    // la identidad de `filters` no cambia → el efecto no se re-dispara.
    setMultasPage(1, listarFilters);
  }, [tab, filters, setMultasPage]);

  async function handleCreate(data: CreateMultaForm) {
    try {
      // D41: la acción del store reemplaza el fetch crudo de /multas/bulk;
      // refresca la lista en página 1 y propaga el mensaje amigable del API.
      await createMultasBulk({
        socioIds: data.socioIds,
        grupoIds: data.grupoIds,
        concepto: data.concepto,
        monto: data.monto,
        actividadId: data.actividadId || undefined,
      });
      setCreateOpen(false);
      createForm.reset();
      setSelectedGrupoIds([]);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handlePay(data: PagarForm) {
    if (payingId === null) return;
    await pagarMulta(payingId, { ...data, numeroRecibo: data.numeroRecibo ?? undefined });
    setPayingId(null);
    payForm.reset();
  }

  async function handleAnular() {
    if (voidingId === null || !voidReason.trim()) return;
    await anularMulta(voidingId, voidReason);
    setVoidingId(null);
    setVoidReason('');
  }

  const permitidos = socios.filter((s) =>
    socioPermiteUI(estadosSocio, accionesSocio, s.estadoId, 'multas'),
  );
  const socioById = new Map(socios.map((s) => [s.id, s]));
  const socioIdsWatch = createForm.watch('socioIds') as string[];
  const sociosObjetivo = calcularSociosObjetivo(socios, socioIdsWatch, selectedGrupoIds);

  const tabs = [
    { key: 'listar' as const, label: 'Listar Multas' },
    { key: 'crear' as const, label: 'Crear Multas' },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Multas</h2>
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
          <h3 className="mb-4 text-lg font-bold text-gray-900">Crear Multas Batch</h3>
          <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-medium text-gray-600">Socios (solo con permiso de "multas")</label>
              <MultiSelect
                options={permitidos.map((s) => ({ value: s.id, label: `${s.nombre} ${s.apellidoPaterno}` }))}
                selected={socioIdsWatch}
                onChange={(values) => createForm.setValue('socioIds', values, { shouldValidate: true })}
                placeholder="Buscar socio..."
                searchPlaceholder="Buscar por nombre o apellido"
                emptyLabel={permitidos.length === 0 ? 'Ningún socio tiene permiso de "multas".' : 'Sin coincidencias'}
              />
              {createForm.formState.errors.socioIds && <p className="text-xs text-red-500">{createForm.formState.errors.socioIds.message}</p>}
            </div>
            <div>
              <label className="mb-2 block text-xs font-medium text-gray-600">Grupos</label>
              <MultiSelect
                options={grupos.map((g) => ({ value: g.id, label: g.nombre }))}
                selected={selectedGrupoIds}
                onChange={setSelectedGrupoIds}
                placeholder="Buscar grupo..."
                searchPlaceholder="Buscar por nombre"
                emptyLabel="Sin coincidencias"
              />
              {selectedGrupoIds.length > 0 && (
                <p className="mt-1 text-xs text-gray-400">
                  Se aplicará a todos los socios del grupo al momento de la creación
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Concepto</label>
              <input {...createForm.register('concepto')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              {createForm.formState.errors.concepto && <p className="text-xs text-red-500">{createForm.formState.errors.concepto.message}</p>}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Monto (Bs)</label>
                <input type="number" step="0.01" {...createForm.register('monto')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                {createForm.formState.errors.monto && <p className="text-xs text-red-500">{createForm.formState.errors.monto.message}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Actividad (opcional)</label>
                <select {...createForm.register('actividadId')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                  <option value="">Sin actividad</option>
                  {actividades.map((a) => (
                    <option key={a.id} value={a.id}>{a.tipoNombre ?? a.id} - {a.fecha}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="submit" className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700">
                Crear Multas ({sociosObjetivo} socios)
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── TAB LISTAR ── */}
      {tab === 'listar' && (
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
            <select value={filters.estado} onChange={(e) => setFilters((f) => ({ ...f, estado: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
              <option value="">Todos los estados de pago</option>
              <option value="pagado">Pagado</option>
              <option value="pendiente">Pendiente</option>
              <option value="anulado">Anulado</option>
            </select>
            <select value={filters.actividadId} onChange={(e) => setFilters((f) => ({ ...f, actividadId: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
              <option value="">Todas las actividades</option>
              {actividades.map((a) => (<option key={a.id} value={a.id}>{a.tipoNombre ?? a.id} - {a.fecha}</option>))}
            </select>
            <input type="date" value={filters.fechaDesde} onChange={(e) => setFilters((f) => ({ ...f, fechaDesde: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" placeholder="Fecha desde" />
            <input type="date" value={filters.fechaHasta} onChange={(e) => setFilters((f) => ({ ...f, fechaHasta: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" placeholder="Fecha hasta" />
            <input type="number" placeholder="Gestión" value={filters.gestion} onChange={(e) => setFilters((f) => ({ ...f, gestion: e.target.value }))} className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </div>

          {multasLoading && <p className="text-gray-500">Cargando...</p>}
          {multasError && <p className="text-red-600">Error: {multasError}</p>}

          {!multasLoading && !multasError && multasTotal === 0 && (
            <div className="rounded-xl border bg-white p-12 text-center"><p className="text-gray-500">No hay multas registradas</p></div>
          )}

          {multas.length > 0 && (
            <div className="hidden overflow-x-auto rounded-xl border bg-white shadow-sm sm:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr><th className="px-4 py-3">Socio</th><th className="px-4 py-3">Concepto</th><th className="px-4 py-3">Monto</th><th className="px-4 py-3">Saldo</th><th className="px-4 py-3">Fecha Gen.</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Acciones</th></tr>
                </thead>
                <tbody className="divide-y">
                  {multas.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{m.socioNombre ? `${m.socioNombre} ${m.socioApellido ?? ''}` : m.socioId}</span>
                          <SocioEstadoBadge multa={m} socioById={socioById} />
                        </div>
                      </td>
                      <td className="px-4 py-3">{m.concepto}</td>
                      <td className="px-4 py-3">Bs {m.monto.toFixed(2)}</td>
                      <td className="px-4 py-3">Bs {m.saldoPendiente.toFixed(2)}</td>
                      <td className="px-4 py-3">{m.fechaGen}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          m.estado === 'pagado' ? 'bg-green-100 text-green-700'
                          : (m.estado as string) === 'anulado' ? 'bg-gray-100 text-gray-500'
                          : 'bg-yellow-100 text-yellow-700'
                        }`}>{m.estado}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {m.estado === 'pendiente' && (
                            <>
                              <button onClick={() => { setPayingId(m.id); payForm.setValue('monto', m.saldoPendiente); }} className="rounded px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50">Pagar</button>
                              <button onClick={() => { setVoidingId(m.id); setVoidReason(''); }} className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Anular</button>
                            </>
                          )}
                          {m.estado === 'pagado' && m.fechaPago && <span className="text-xs text-gray-400">Pagado: {m.fechaPago}</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {multas.length > 0 && (
            <div className="space-y-3 sm:hidden">
              {multas.map((m) => (
                <div key={m.id} className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-gray-900">{m.socioNombre ? `${m.socioNombre} ${m.socioApellido ?? ''}` : m.socioId}</span>
                    <SocioEstadoBadge multa={m} socioById={socioById} />
                  </div>
                  <dl className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between gap-2"><dt className="text-gray-500">Concepto</dt><dd>{m.concepto}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-gray-500">Monto</dt><dd>Bs {m.monto.toFixed(2)}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-gray-500">Saldo</dt><dd>Bs {m.saldoPendiente.toFixed(2)}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-gray-500">Fecha</dt><dd>{m.fechaGen}</dd></div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-gray-500">Estado</dt>
                      <dd><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${m.estado === 'pagado' ? 'bg-green-100 text-green-700' : (m.estado as string) === 'anulado' ? 'bg-gray-100 text-gray-500' : 'bg-yellow-100 text-yellow-700'}`}>{m.estado}</span></dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.estado === 'pendiente' && (
                      <>
                        <button onClick={() => { setPayingId(m.id); payForm.setValue('monto', m.saldoPendiente); }} className="rounded px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50">Pagar</button>
                        <button onClick={() => { setVoidingId(m.id); setVoidReason(''); }} className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Anular</button>
                      </>
                    )}
                    {m.estado === 'pagado' && m.fechaPago && <span className="text-xs text-gray-400">Pagado: {m.fechaPago}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* D37/D38: Pagination debajo de tabla y cards; total=0 → null (sin controles).
              Si la página quedó fuera de rango (items vacíos, total > 0) se muestra para
              poder volver, sin falsa empty-state. */}
          <Pagination
            page={multasPage}
            total={multasTotal}
            pageSize={multasPageSize}
            onPageChange={(p) => setMultasPage(p, listarFilters)}
            onPageSizeChange={(s) => setMultasPageSize(s, listarFilters)}
          />
        </>
      )}

      {/* PAY MODAL */}
      {payingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-gray-900">Registrar Pago de Multa</h3>
            {payingId && multas.find((m) => m.id === payingId) && (
              <p className="mb-3 text-sm text-gray-600">Saldo pendiente: Bs {multas.find((m) => m.id === payingId)!.saldoPendiente.toFixed(2)}</p>
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
            <h3 className="mb-4 text-lg font-bold text-gray-900">Anular Multa</h3>
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
