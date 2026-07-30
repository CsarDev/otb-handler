import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAppStore } from '../stores/app.store';

const actividadSchema = z.object({
  tipoId: z.string().min(1, 'Requerido'),
  fecha: z.string().min(1, 'Fecha requerida'),
  hora: z.string().nullish().default(''),
  descripcion: z.string().nullish().default(''),
});

type ActividadForm = z.infer<typeof actividadSchema>;

export default function ActividadesPage() {
  const { actividades, actividadesLoading, actividadesError, fetchActividades, createActividad, updateActividad, deleteActividad, tiposActividad } = useAppStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string } & ActividadForm | null>(null);

  const form = useForm<ActividadForm>({
    resolver: zodResolver(actividadSchema) as any,
    defaultValues: { tipoId: '', fecha: '', hora: '', descripcion: '' },
  });

  useEffect(() => {
    fetchActividades();
  }, [fetchActividades]);

  function openCreate() {
    setEditing(null);
    form.reset({ tipoId: '', fecha: '', hora: '', descripcion: '' });
    setModalOpen(true);
  }

  function openEdit(a: typeof actividades[0]) {
    setEditing({ id: a.id, tipoId: a.tipoId, fecha: a.fecha, hora: a.hora ?? '', descripcion: a.descripcion ?? '' });
    form.reset({ tipoId: a.tipoId, fecha: a.fecha, hora: a.hora ?? '', descripcion: a.descripcion ?? '' });
    setModalOpen(true);
  }

  async function onSubmit(data: ActividadForm) {
    if (editing) {
      await updateActividad(editing.id, data);
    } else {
      await createActividad(data);
    }
    setModalOpen(false);
    setEditing(null);
  }

  async function handleDelete(id: string) {
    if (confirm('¿Eliminar esta actividad?')) {
      await deleteActividad(id);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Actividades</h2>
        <button
          onClick={openCreate}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Nueva Actividad
        </button>
      </div>

      {actividadesLoading && <p className="text-gray-500">Cargando...</p>}
      {actividadesError && <p className="text-red-600">Error: {actividadesError}</p>}

      {!actividadesLoading && !actividadesError && actividades.length === 0 && (
        <div className="rounded-xl border bg-white p-12 text-center">
          <p className="text-gray-500">No hay actividades registradas</p>
        </div>
      )}

      {actividades.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Hora</th>
                <th className="px-4 py-3">Descripción</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {actividades.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{a.tipoId}</td>

                  <td className="px-4 py-3">{a.fecha}</td>
                  <td className="px-4 py-3">{a.hora}</td>
                  <td className="max-w-xs truncate px-4 py-3">{a.descripcion || '—'}</td>
                  <td className="flex gap-2 px-4 py-3">
                    <button
                      onClick={() => openEdit(a)}
                      className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(a.id)}
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
              {editing ? 'Editar Actividad' : 'Nueva Actividad'}
            </h3>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Tipo</label>
                <select {...form.register('tipoId')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                  <option value="">Seleccionar...</option>
                  {tiposActividad.map((t) => (
                    <option key={t.nombre} value={t.nombre}>{t.nombre}</option>
                  ))}
                </select>
                {form.formState.errors.tipoId && <p className="text-xs text-red-500">{form.formState.errors.tipoId.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Fecha</label>
                  <input type="date" {...form.register('fecha')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                  {form.formState.errors.fecha && <p className="text-xs text-red-500">{form.formState.errors.fecha.message}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Hora</label>
                  <input type="time" {...form.register('hora')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                  {form.formState.errors.hora && <p className="text-xs text-red-500">{form.formState.errors.hora.message}</p>}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Descripción</label>
                <textarea {...form.register('descripcion')} rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
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
