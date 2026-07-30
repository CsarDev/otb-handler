import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAppStore } from '../stores/app.store';

const createAporteSchema = z.object({
  socioId: z.string().min(1, 'Seleccione un socio'),
  mes: z.coerce.number().min(1).max(12),
  gestion: z.coerce.number().min(2000),
  tipo: z.enum(['mensual', 'extraordinario']),
  montoBase: z.coerce.number().min(1, 'Monto requerido'),
});

const pagarSchema = z.object({
  monto: z.coerce.number().min(0.01, 'Monto requerido'),
  numeroRecibo: z.string().nullish().default(''),
  fechaPago: z.string().min(1, 'Fecha requerida'),
});

type CreateAporteForm = z.infer<typeof createAporteSchema>;
type PagarForm = z.infer<typeof pagarSchema>;

export default function AportesPage() {
  const { aportes, aportesLoading, aportesError, fetchAportes, createAporte, pagarAporte, anularAporte } = useAppStore();
  const { socios, fetchSocios } = useAppStore();
  const [filters, setFilters] = useState({ socioId: '', mes: '', gestion: '', estado: '', tipo: '', fechaDesde: '', fechaHasta: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const createForm = useForm<CreateAporteForm>({
    resolver: zodResolver(createAporteSchema) as any,
    defaultValues: { socioId: '', mes: new Date().getMonth() + 1, gestion: new Date().getFullYear(), tipo: 'mensual', montoBase: 0 },
  });

  const payForm = useForm<PagarForm>({
    resolver: zodResolver(pagarSchema) as any,
    defaultValues: { monto: 0, numeroRecibo: '', fechaPago: new Date().toISOString().split('T')[0] },
  });

  useEffect(() => {
    fetchSocios();
  }, [fetchSocios]);

  useEffect(() => {
    const hasFilters = filters.socioId || filters.mes || filters.gestion || filters.estado || filters.tipo || filters.fechaDesde || filters.fechaHasta;
    fetchAportes(hasFilters ? {
      socioId: filters.socioId || undefined,
      mes: filters.mes || undefined,
      gestion: filters.gestion || undefined,
      estado: filters.estado || undefined,
      tipo: filters.tipo || undefined,
      fechaDesde: filters.fechaDesde || undefined,
      fechaHasta: filters.fechaHasta || undefined,
    } : undefined);
  }, [filters, fetchAportes]);

  async function handleCreate(data: CreateAporteForm) {
    await createAporte(data as any);
    setCreateOpen(false);
    createForm.reset();
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

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Aportes</h2>
        <button
          onClick={() => setCreateOpen(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Nuevo Aporte
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={filters.socioId}
          onChange={(e) => setFilters((f) => ({ ...f, socioId: e.target.value }))}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">Todos los socios</option>
          {socios.map((s) => (
            <option key={s.id} value={s.id}>{s.nombre} {s.apellidoPaterno}</option>
          ))}
        </select>
        <select
          value={filters.mes}
          onChange={(e) => setFilters((f) => ({ ...f, mes: e.target.value }))}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">Todos los meses</option>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>{i + 1}</option>
          ))}
        </select>
        <input
          type="number"
          placeholder="Gestión"
          value={filters.gestion}
          onChange={(e) => setFilters((f) => ({ ...f, gestion: e.target.value }))}
          className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <select
          value={filters.tipo}
          onChange={(e) => setFilters((f) => ({ ...f, tipo: e.target.value }))}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">Todos los tipos</option>
          <option value="mensual">Mensual</option>
          <option value="extraordinario">Extraordinario</option>
          <option value="anual">Anual</option>
          <option value="unico">Único</option>
        </select>
        <select
          value={filters.estado}
          onChange={(e) => setFilters((f) => ({ ...f, estado: e.target.value }))}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">Todos los estados</option>
          <option value="pagado">Pagado</option>
          <option value="pendiente">Pendiente</option>
          <option value="anulado">Anulado</option>
        </select>
        <input
          type="date"
          value={filters.fechaDesde}
          onChange={(e) => setFilters((f) => ({ ...f, fechaDesde: e.target.value }))}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          placeholder="Pago desde"
        />
        <input
          type="date"
          value={filters.fechaHasta}
          onChange={(e) => setFilters((f) => ({ ...f, fechaHasta: e.target.value }))}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          placeholder="Pago hasta"
        />
      </div>

      {aportesLoading && <p className="text-gray-500">Cargando...</p>}
      {aportesError && <p className="text-red-600">Error: {aportesError}</p>}

      {!aportesLoading && !aportesError && aportes.length === 0 && (
        <div className="rounded-xl border bg-white p-12 text-center">
          <p className="text-gray-500">No hay aportes registrados</p>
        </div>
      )}

      {aportes.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Socio</th>
                <th className="px-4 py-3">Mes</th>
                <th className="px-4 py-3">Gestión</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Monto</th>
                <th className="px-4 py-3">Pagado</th>
                <th className="px-4 py-3">Saldo</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {aportes.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{a.socioNombre ? `${a.socioNombre} ${a.socioApellido ?? ''}` : a.socioId}</td>
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
                    }`}>
                      {a.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {a.estado === 'pendiente' && (
                        <>
                          <button
                            onClick={() => { setPayingId(a.id); payForm.setValue('monto', a.saldoPendiente ?? a.montoBase); }}
                            className="rounded px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50"
                          >
                            Pagar
                          </button>
                          <button
                            onClick={() => { setVoidingId(a.id); setVoidReason(''); }}
                            className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            Anular
                          </button>
                        </>
                      )}
                      {a.estado === 'pagado' && a.fechaPago && (
                        <span className="text-xs text-gray-400">Pagado: {a.fechaPago}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-gray-900">Nuevo Aporte</h3>
            <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Socio</label>
                <select {...createForm.register('socioId')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                  <option value="">Seleccionar...</option>
                  {socios.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre} {s.apellidoPaterno}</option>
                  ))}
                </select>
                {createForm.formState.errors.socioId && <p className="text-xs text-red-500">{createForm.formState.errors.socioId.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Mes</label>
                  <select {...createForm.register('mes')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>{i + 1}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Gestión</label>
                  <input type="number" {...createForm.register('gestion')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Tipo</label>
                <select {...createForm.register('tipo')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                  <option value="mensual">Mensual</option>
                  <option value="extraordinario">Extraordinario</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Monto Base (Bs)</label>
                <input type="number" step="0.01" {...createForm.register('montoBase')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setCreateOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Cancelar
                </button>
                <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  Crear
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {payingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-gray-900">Registrar Pago</h3>
            {payingId && aportes.find((a) => a.id === payingId) && (
              <p className="mb-3 text-sm text-gray-600">
                Saldo pendiente: Bs {(aportes.find((a) => a.id === payingId)!.saldoPendiente ?? aportes.find((a) => a.id === payingId)!.montoBase).toFixed(2)}
              </p>
            )}
            <form onSubmit={payForm.handleSubmit(handlePay)} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Monto (Bs)</label>
                <input type="number" step="0.01" {...payForm.register('monto')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">N° Recibo</label>
                <input {...payForm.register('numeroRecibo')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Fecha de Pago</label>
                <input type="date" {...payForm.register('fechaPago')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setPayingId(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Cancelar
                </button>
                <button type="submit" className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
                  Pagar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {voidingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-gray-900">Anular Aporte</h3>
            <p className="mb-3 text-sm text-gray-600">Ingrese el motivo de la anulación:</p>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              rows={3}
              placeholder="Motivo de anulación..."
            />
            <div className="flex justify-end gap-3 pt-3">
              <button type="button" onClick={() => setVoidingId(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAnular}
                disabled={!voidReason.trim()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Anular
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
