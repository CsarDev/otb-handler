import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAppStore } from '../stores/app.store';

export const Route = createFileRoute('/actividades')({
  component: ActividadesPage,
});

const actividadSchema = z.object({
  tipo: z.string().min(1, 'Requerido'),
  fecha: z.string().min(1, 'Requerido'),
  hora: z.string().optional().default(''),
  descripcion: z.string().min(1, 'Requerido'),
});

type ActividadForm = z.infer<typeof actividadSchema>;

function ActividadesPage() {
  const { actividades, actividadesLoading, actividadesError, fetchActividades, createActividad, updateActividad, deleteActividad } = useAppStore();
  const { config, fetchConfig } = useAppStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: number } & ActividadForm | null>(null);

  const form = useForm<ActividadForm>({
    resolver: zodResolver(actividadSchema) as any,
    defaultValues: actividadSchema.parse({}),
  });

  useEffect(() => {
    fetchActividades();
    fetchConfig();
  }, [fetchActividades, fetchConfig]);

  function openCreate() {
    setEditing(null);
    form.reset(actividadSchema.parse({}));
    setModalOpen(true);
  }

  function openEdit(a: typeof actividades[0]) {
    setEditing({ id: a.id, ...actividadSchema.parse(a) });
    form.reset(actividadSchema.parse(a));
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

  async function handleDelete(id: number) {
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
        <div className="space-y-3">
          {actividades.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                    {a.tipo}
                  </span>
                  <span className="text-sm text-gray-500">{a.fecha}</span>
                  {a.hora && <span className="text-sm text-gray-400">{a.hora}</span>}
                </div>
                <p className="mt-1 text-sm text-gray-700">{a.descripcion}</p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/asistencia"
                  search={{ actividadId: a.id }}
                  className="rounded px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50"
                >
                  Asistencia
                </Link>
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
              </div>
            </div>
          ))}
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
                <select {...form.register('tipo')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                  <option value="">Seleccionar...</option>
                  <option value="Asamblea">Asamblea</option>
                  <option value="Evento Social">Evento Social</option>
                  <option value="Reunión">Reunión</option>
                  <option value="Taller">Taller</option>
                  <option value="Deporte">Deporte</option>
                  <option value="Otro">Otro</option>
                </select>
                {form.formState.errors.tipo && <p className="text-xs text-red-500">{form.formState.errors.tipo.message}</p>}
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
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Descripción</label>
                <textarea {...form.register('descripcion')} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                {form.formState.errors.descripcion && <p className="text-xs text-red-500">{form.formState.errors.descripcion.message}</p>}
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
