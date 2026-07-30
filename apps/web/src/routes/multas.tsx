import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAppStore } from '../stores/app.store';

const createMultaSchema = z.object({
  socioId: z.string().min(1, 'Seleccione un socio'),
  actividadId: z.string().nullish().default(''),
  concepto: z.string().min(1, 'Concepto requerido'),
  monto: z.coerce.number().min(1, 'Monto requerido'),
});

const pagarSchema = z.object({
  monto: z.coerce.number().min(0.01, 'Monto requerido'),
  numeroRecibo: z.string().nullish().default(''),
  fechaPago: z.string().min(1, 'Fecha requerida'),
});

type CreateMultaForm = z.infer<typeof createMultaSchema>;
type PagarForm = z.infer<typeof pagarSchema>;

export default function MultasPage() {
  const { multas, multasLoading, multasError, fetchMultas, createMulta, pagarMulta, anularMulta } = useAppStore();
  const { socios, fetchSocios } = useAppStore();
  const [filters, setFilters] = useState({ socioId: '', estado: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);

  const createForm = useForm<CreateMultaForm>({
    resolver: zodResolver(createMultaSchema) as any,
    defaultValues: { socioId: '', actividadId: '', concepto: '', monto: 0 },
  });

  const payForm = useForm<PagarForm>({
    resolver: zodResolver(pagarSchema) as any,
    defaultValues: { monto: 0, numeroRecibo: '', fechaPago: new Date().toISOString().split('T')[0] },
  });

  useEffect(() => {
    fetchSocios();
  }, [fetchSocios]);

  useEffect(() => {
    fetchMultas(filters.socioId || filters.estado ? {
      socioId: filters.socioId || undefined,
      estado: filters.estado || undefined,
    } : undefined);
  }, [filters, fetchMultas]);

  async function handleCreate(data: CreateMultaForm) {
    await createMulta(data as any);
    setCreateOpen(false);
    createForm.reset();
  }

  async function handlePay(data: PagarForm) {
    if (payingId === null) return;
    await pagarMulta(payingId, { ...data, numeroRecibo: data.numeroRecibo ?? undefined });
    setPayingId(null);
    payForm.reset();
  }

  async function handleAnular(id: string) {
    if (confirm('¿Anular esta multa?')) {
      await anularMulta(id);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Multas</h2>
        <button
          onClick={() => setCreateOpen(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Nueva Multa
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
          value={filters.estado}
          onChange={(e) => setFilters((f) => ({ ...f, estado: e.target.value }))}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">Todos los estados</option>
          <option value="pagado">Pagado</option>
          <option value="pendiente">Pendiente</option>
          <option value="anulado">Anulado</option>
        </select>
      </div>

      {multasLoading && <p className="text-gray-500">Cargando...</p>}
      {multasError && <p className="text-red-600">Error: {multasError}</p>}

      {!multasLoading && !multasError && multas.length === 0 && (
        <div className="rounded-xl border bg-white p-12 text-center">
          <p className="text-gray-500">No hay multas registradas</p>
        </div>
      )}

      {multas.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Socio ID</th>
                <th className="px-4 py-3">Concepto</th>
                <th className="px-4 py-3">Monto</th>
                <th className="px-4 py-3">Fecha Gen.</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {multas.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{m.socioId}</td>
                  <td className="px-4 py-3">{m.concepto}</td>
                  <td className="px-4 py-3">Bs {m.monto.toFixed(2)}</td>
                  <td className="px-4 py-3">{m.fechaGen}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      m.estado === 'pagado' ? 'bg-green-100 text-green-700'
                      : (m.estado as string) === 'anulado' ? 'bg-gray-100 text-gray-500'
                      : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {m.estado}
                    </span>
                  </td>
                  <td className="flex gap-2 px-4 py-3">
                    {m.estado === 'pendiente' && (
                      <>
                        <button
                          onClick={() => { setPayingId(m.id); payForm.setValue('monto', m.monto); }}
                          className="rounded px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50"
                        >
                          Pagar
                        </button>
                        <button
                          onClick={() => handleAnular(m.id)}
                          className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Anular
                        </button>
                      </>
                    )}
                    {m.estado === 'pagado' && m.fechaPago && (
                      <span className="text-xs text-gray-400">Pagado: {m.fechaPago}</span>
                    )}
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
            <h3 className="mb-4 text-lg font-bold text-gray-900">Nueva Multa</h3>
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
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Concepto</label>
                <input {...createForm.register('concepto')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                {createForm.formState.errors.concepto && <p className="text-xs text-red-500">{createForm.formState.errors.concepto.message}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Monto (Bs)</label>
                <input type="number" step="0.01" {...createForm.register('monto')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                {createForm.formState.errors.monto && <p className="text-xs text-red-500">{createForm.formState.errors.monto.message}</p>}
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
            <h3 className="mb-4 text-lg font-bold text-gray-900">Registrar Pago de Multa</h3>
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
    </div>
  );
}
