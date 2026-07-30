import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAppStore } from '../stores/app.store';

export const Route = createFileRoute('/egresos')({
  component: EgresosPage,
});

const egresoSchema = z.object({
  categoria: z.string().min(1, 'Requerido'),
  beneficiario: z.string().min(1, 'Requerido'),
  monto: z.coerce.number().min(0.01, 'Debe ser mayor a 0'),
  descripcion: z.string().optional().default(''),
  fecha: z.string().min(1, 'Fecha requerida'),
  numRecibo: z.string().optional().default(''),
});

type EgresoForm = z.infer<typeof egresoSchema>;

const CATEGORIAS = [
  'Servicios',
  'Mantenimiento',
  'Eventos',
  'Materiales',
  'Transporte',
  'Otros',
];

function EgresosPage() {
  const { egresos, egresosLoading, egresosError, fetchEgresos, createEgreso, updateEgreso, deleteEgreso } = useAppStore();
  const [filters, setFilters] = useState({ categoria: '', fechaDesde: '', fechaHasta: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: number } & EgresoForm | null>(null);

  const form = useForm<EgresoForm>({
    resolver: zodResolver(egresoSchema) as any,
    defaultValues: egresoSchema.parse({}),
  });

  useEffect(() => {
    fetchEgresos(filters.categoria || filters.fechaDesde || filters.fechaHasta ? {
      categoria: filters.categoria || undefined,
      fechaDesde: filters.fechaDesde || undefined,
      fechaHasta: filters.fechaHasta || undefined,
    } : undefined);
  }, [filters, fetchEgresos]);

  function openCreate() {
    setEditing(null);
    form.reset(egresoSchema.parse({}));
    setModalOpen(true);
  }

  function openEdit(e: typeof egresos[0]) {
    setEditing({ id: e.id, ...egresoSchema.parse(e) });
    form.reset(egresoSchema.parse(e));
    setModalOpen(true);
  }

  async function onSubmit(data: EgresoForm) {
    if (editing) {
      await updateEgreso(editing.id, data);
    } else {
      await createEgreso(data);
    }
    setModalOpen(false);
    setEditing(null);
  }

  async function handleDelete(id: number) {
    if (confirm('¿Eliminar este egreso?')) {
      await deleteEgreso(id);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Egresos</h2>
        <button
          onClick={openCreate}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Nuevo Egreso
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={filters.categoria}
          onChange={(e) => setFilters((f) => ({ ...f, categoria: e.target.value }))}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          type="date"
          value={filters.fechaDesde}
          onChange={(e) => setFilters((f) => ({ ...f, fechaDesde: e.target.value }))}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <input
          type="date"
          value={filters.fechaHasta}
          onChange={(e) => setFilters((f) => ({ ...f, fechaHasta: e.target.value }))}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      {egresosLoading && <p className="text-gray-500">Cargando...</p>}
      {egresosError && <p className="text-red-600">Error: {egresosError}</p>}

      {!egresosLoading && !egresosError && egresos.length === 0 && (
        <div className="rounded-xl border bg-white p-12 text-center">
          <p className="text-gray-500">No hay egresos registrados</p>
        </div>
      )}

      {egresos.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Beneficiario</th>
                <th className="px-4 py-3">Monto</th>
                <th className="px-4 py-3">Descripción</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">N° Recibo</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {egresos.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{e.categoria}</td>
                  <td className="px-4 py-3">{e.beneficiario}</td>
                  <td className="px-4 py-3 font-medium text-red-600">Bs {e.monto.toFixed(2)}</td>
                  <td className="max-w-xs truncate px-4 py-3">{e.descripcion || '—'}</td>
                  <td className="px-4 py-3">{e.fecha}</td>
                  <td className="px-4 py-3">{e.numRecibo || '—'}</td>
                  <td className="flex gap-2 px-4 py-3">
                    <button
                      onClick={() => openEdit(e)}
                      className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(e.id)}
                      className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-gray-900">
              {editing ? 'Editar Egreso' : 'Nuevo Egreso'}
            </h3>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Categoría</label>
                <select {...form.register('categoria')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                  <option value="">Seleccionar...</option>
                  {CATEGORIAS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                {form.formState.errors.categoria && <p className="text-xs text-red-500">{form.formState.errors.categoria.message}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Beneficiario</label>
                <input {...form.register('beneficiario')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                {form.formState.errors.beneficiario && <p className="text-xs text-red-500">{form.formState.errors.beneficiario.message}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Monto (Bs)</label>
                <input type="number" step="0.01" {...form.register('monto')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                {form.formState.errors.monto && <p className="text-xs text-red-500">{form.formState.errors.monto.message}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Descripción</label>
                <textarea {...form.register('descripcion')} rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Fecha</label>
                  <input type="date" {...form.register('fecha')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                  {form.formState.errors.fecha && <p className="text-xs text-red-500">{form.formState.errors.fecha.message}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">N° Recibo</label>
                  <input {...form.register('numRecibo')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Cancelar
                </button>
                <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  {editing ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
