import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAppStore } from '../stores/app.store';

export const Route = createFileRoute('/socios')({
  component: SociosPage,
});

const socioSchema = z.object({
  nombre: z.string().min(1, 'Requerido'),
  apellidoPaterno: z.string().min(1, 'Requerido'),
  apellidoMaterno: z.string().optional().default(''),
  ci: z.string().optional().default(''),
  telefono: z.string().optional().default(''),
  email: z.string().optional().default(''),
  ocupacion: z.string().optional().default(''),
  direccion: z.string().optional().default(''),
  fechaNac: z.string().optional().default(''),
  fechaIng: z.string().optional().default(''),
  fechaAlta: z.string().optional().default(''),
  aporteBase: z.coerce.number().min(0).default(0),
});

type SocioForm = z.infer<typeof socioSchema>;

function SociosPage() {
  const { socios, sociosLoading, sociosError, fetchSocios, createSocio, updateSocio, deleteSocio } = useAppStore();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: number } & SocioForm | null>(null);

  const form = useForm<SocioForm>({ resolver: zodResolver(socioSchema) as any, defaultValues: socioSchema.parse({}) });

  useEffect(() => {
    fetchSocios();
  }, [fetchSocios]);

  useEffect(() => {
    const timer = setTimeout(() => fetchSocios(search || undefined), 300);
    return () => clearTimeout(timer);
  }, [search, fetchSocios]);

  function openCreate() {
    setEditing(null);
    form.reset(socioSchema.parse({}));
    setModalOpen(true);
  }

  function openEdit(socio: typeof socios[0]) {
    setEditing({ id: socio.id, ...socioSchema.parse(socio) });
    form.reset(socioSchema.parse(socio));
    setModalOpen(true);
  }

  async function onSubmit(data: SocioForm) {
    if (editing) {
      await updateSocio(editing.id, data);
    } else {
      await createSocio(data);
    }
    setModalOpen(false);
    setEditing(null);
  }

  async function handleDelete(id: number) {
    if (confirm('¿Desactivar este socio?')) {
      await deleteSocio(id);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Socios</h2>
        <button
          onClick={openCreate}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Nuevo Socio
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar por nombre o apellido..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none sm:w-80"
        />
      </div>

      {sociosLoading && <p className="text-gray-500">Cargando...</p>}
      {sociosError && <p className="text-red-600">Error: {sociosError}</p>}

      {!sociosLoading && !sociosError && socios.length === 0 && (
        <div className="rounded-xl border bg-white p-12 text-center">
          <p className="text-gray-500">No hay socios registrados</p>
        </div>
      )}

      {socios.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">CI</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Aporte Base</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {socios.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{s.nombre} {s.apellidoPaterno}</td>
                  <td className="px-4 py-3">{s.ci || '—'}</td>
                  <td className="px-4 py-3">{s.telefono || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.estado === 'activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {s.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3">Bs {s.aporteBase.toFixed(2)}</td>
                  <td className="flex gap-2 px-4 py-3">
                    <button
                      onClick={() => openEdit(s)}
                      className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                    >
                      Editar
                    </button>
                    {s.estado === 'activo' && (
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Desactivar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-gray-900">
              {editing ? 'Editar Socio' : 'Nuevo Socio'}
            </h3>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Nombre *</label>
                  <input {...form.register('nombre')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                  {form.formState.errors.nombre && <p className="text-xs text-red-500">{form.formState.errors.nombre.message}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Ap. Paterno *</label>
                  <input {...form.register('apellidoPaterno')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                  {form.formState.errors.apellidoPaterno && <p className="text-xs text-red-500">{form.formState.errors.apellidoPaterno.message}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Ap. Materno</label>
                  <input {...form.register('apellidoMaterno')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">CI</label>
                  <input {...form.register('ci')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Teléfono</label>
                  <input {...form.register('telefono')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Email</label>
                  <input {...form.register('email')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Ocupación</label>
                  <input {...form.register('ocupacion')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Dirección</label>
                  <input {...form.register('direccion')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Fec. Nac.</label>
                  <input type="date" {...form.register('fechaNac')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Fec. Ingreso</label>
                  <input type="date" {...form.register('fechaIng')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Fec. Alta</label>
                  <input type="date" {...form.register('fechaAlta')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Aporte Base (Bs)</label>
                <input type="number" step="0.01" {...form.register('aporteBase')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
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
