import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAppStore } from '../stores/app.store';
import { Badge } from '@otb/ui';
import type { Socio, Grupo } from '@otb/core';

const socioSchema = z.object({
  nombre: z.string().min(1, 'Requerido'),
  apellidoPaterno: z.string().min(1, 'Requerido'),
  apellidoMaterno: z.string().nullish().default(''),
  ci: z.string().nullish().default(''),
  telefono: z.string().nullish().default(''),
  email: z.string().nullish().default(''),
  ocupacion: z.string().nullish().default(''),
  direccion: z.string().nullish().default(''),
  fechaNac: z.string().nullish().default(''),
  fechaIng: z.string().nullish().default(''),
  fechaAlta: z.string().nullish().default(''),
  aporteBase: z.coerce.number().min(0).default(0),
  estadoId: z.string().nullish().default(''),
  grupoPrimarioId: z.string().nullish().default(''),
  grupoAdicionalIds: z.array(z.string()).default([]),
});

type SocioForm = z.infer<typeof socioSchema>;

const defaultSocio: SocioForm = {
  nombre: '', apellidoPaterno: '', apellidoMaterno: '',
  ci: '', telefono: '', email: '', ocupacion: '', direccion: '',
  fechaNac: '', fechaIng: '', fechaAlta: '',
  aporteBase: 0,
  estadoId: '', grupoPrimarioId: '', grupoAdicionalIds: [],
};

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none';
const labelCls = 'mb-1 block text-xs font-medium text-gray-600';

/** Badge de estado tintado con el color del catálogo (hex inline, sin clases dinámicas). */
function EstadoBadge({ socio }: { socio: Socio }) {
  return (
    <Badge style={{ backgroundColor: socio.estadoColor ?? '#9ca3af', color: '#fff' }}>
      {socio.estadoNombre ?? 'sin estado'}
    </Badge>
  );
}

/** Chips de grupos (primario + adicionales) con wrap para ~360px. */
function GrupoChips({ socio, grupos }: { socio: Socio; grupos: Grupo[] }) {
  const primario = grupos.find((g) => g.id === socio.grupoPrimarioId);
  const chips: { id: string; nombre: string; esPrimario: boolean }[] = [];
  if (primario) chips.push({ id: primario.id, nombre: primario.nombre, esPrimario: true });
  for (const g of socio.grupos) chips.push({ id: g.id, nombre: g.nombre, esPrimario: false });
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span
          key={c.id}
          className="inline-flex items-center whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
        >
          {c.nombre}
          {c.esPrimario && (
            <span className="ml-1 text-[10px] font-medium uppercase text-blue-400">primario</span>
          )}
        </span>
      ))}
    </div>
  );
}

export default function SociosPage() {
  const {
    socios, sociosLoading, sociosError, fetchSocios, createSocio, updateSocio, bajaSocio,
    estadosSocio, grupos, fetchConfig,
  } = useAppStore();
  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [grupoFilter, setGrupoFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<(SocioForm & { id: string }) | null>(null);
  const [ficha, setFicha] = useState<Socio | null>(null);
  const [bajaTarget, setBajaTarget] = useState<Socio | null>(null);
  const [bajaMotivo, setBajaMotivo] = useState('');
  const [bajando, setBajando] = useState(false);

  const form = useForm<SocioForm>({ resolver: zodResolver(socioSchema) as any, defaultValues: defaultSocio });

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    fetchSocios();
  }, [fetchSocios]);

  useEffect(() => {
    const timer = setTimeout(
      () => fetchSocios(search || undefined, estadoFilter || undefined, grupoFilter || undefined),
      300,
    );
    return () => clearTimeout(timer);
  }, [search, estadoFilter, grupoFilter, fetchSocios]);

  const estadoBaja = estadosSocio.find((e) => e.esBaja === 1);

  function openCreate() {
    setEditing(null);
    form.reset(defaultSocio);
    setModalOpen(true);
  }

  function openEdit(socio: Socio) {
    const parsed = socioSchema.parse(socio);
    setEditing({ id: socio.id, ...parsed });
    form.reset(parsed);
    setModalOpen(true);
  }

  async function onSubmit(data: SocioForm) {
    const payload = {
      ...data,
      estadoId: data.estadoId || editing?.estadoId || undefined,
      grupoPrimarioId: data.grupoPrimarioId || undefined,
      grupoAdicionalIds: data.grupoAdicionalIds ?? [],
    };
    if (editing) {
      await updateSocio(editing.id, payload);
    } else {
      await createSocio(payload);
    }
    setModalOpen(false);
    setEditing(null);
  }

  function handlePrimaryChange(id: string) {
    form.setValue('grupoPrimarioId', id);
    // Invariante: el primario no puede estar entre los adicionales
    const current = form.getValues('grupoAdicionalIds');
    if (current.includes(id)) {
      form.setValue(
        'grupoAdicionalIds',
        current.filter((g) => g !== id),
      );
    }
  }

  function toggleAdicional(id: string) {
    const current = form.getValues('grupoAdicionalIds');
    const next = current.includes(id) ? current.filter((g) => g !== id) : [...current, id];
    form.setValue('grupoAdicionalIds', next);
  }

  async function handleBaja() {
    if (!bajaTarget || !bajaMotivo.trim()) return;
    setBajando(true);
    try {
      await bajaSocio(bajaTarget.id, bajaMotivo.trim());
      setBajaTarget(null);
      setBajaMotivo('');
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBajando(false);
    }
  }

  const adicionalIds = form.watch('grupoAdicionalIds');

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

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Buscar por nombre o apellido..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none sm:w-64"
        />
        <select
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">Todos los estados</option>
          {estadosSocio.map((e) => (
            <option key={e.id} value={e.id}>● {e.nombre}</option>
          ))}
        </select>
        <select
          value={grupoFilter}
          onChange={(e) => setGrupoFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">Todos los grupos</option>
          {grupos.map((g) => (
            <option key={g.id} value={g.id}>{g.nombre}</option>
          ))}
        </select>
      </div>

      {sociosLoading && <p className="text-gray-500">Cargando...</p>}
      {sociosError && <p className="text-red-600">Error: {sociosError}</p>}

      {!sociosLoading && !sociosError && socios.length === 0 && (
        <div className="rounded-xl border bg-white p-12 text-center">
          <p className="text-gray-500">No hay socios registrados</p>
        </div>
      )}

      {/* ── Tabla (sm+) ── */}
      {socios.length > 0 && (
        <div className="hidden overflow-x-auto rounded-xl border bg-white shadow-sm sm:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">CI</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Grupos</th>
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
                    <EstadoBadge socio={s} />
                  </td>
                  <td className="px-4 py-3">
                    <GrupoChips socio={s} grupos={grupos} />
                  </td>
                  <td className="px-4 py-3">Bs {s.aporteBase.toFixed(2)}</td>
                  <td className="flex flex-wrap gap-2 px-4 py-3">
                    <button
                      onClick={() => setFicha(s)}
                      className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                    >
                      Ficha
                    </button>
                    <button
                      onClick={() => openEdit(s)}
                      className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                    >
                      Editar
                    </button>
                    {s.estadoId !== estadoBaja?.id && (
                      <button
                        onClick={() => setBajaTarget(s)}
                        className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Dar de baja
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Cards apiladas (móvil ~360px) ── */}
      {socios.length > 0 && (
        <div className="space-y-3 sm:hidden">
          {socios.map((s) => (
            <div key={s.id} className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="font-medium text-gray-900">{s.nombre} {s.apellidoPaterno}</div>
                <EstadoBadge socio={s} />
              </div>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">CI</dt>
                  <dd>{s.ci || '—'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Teléfono</dt>
                  <dd>{s.telefono || '—'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Aporte Base</dt>
                  <dd>Bs {s.aporteBase.toFixed(2)}</dd>
                </div>
              </dl>
              <div className="mt-2">
                <GrupoChips socio={s} grupos={grupos} />
              </div>
              {s.motivoBaja && (
                <p className="mt-2 text-xs text-red-600">
                  Baja: {s.motivoBaja} {s.fechaBaja ? `(${s.fechaBaja})` : ''}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => setFicha(s)}
                  className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  Ficha
                </button>
                <button
                  onClick={() => openEdit(s)}
                  className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                >
                  Editar
                </button>
                {s.estadoId !== estadoBaja?.id && (
                  <button
                    onClick={() => setBajaTarget(s)}
                    className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Dar de baja
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal crear/editar ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-gray-900">
              {editing ? 'Editar Socio' : 'Nuevo Socio'}
            </h3>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Nombre *</label>
                  <input {...form.register('nombre')} className={inputCls} />
                  {form.formState.errors.nombre && <p className="text-xs text-red-500">{form.formState.errors.nombre.message}</p>}
                </div>
                <div>
                  <label className={labelCls}>Ap. Paterno *</label>
                  <input {...form.register('apellidoPaterno')} className={inputCls} />
                  {form.formState.errors.apellidoPaterno && <p className="text-xs text-red-500">{form.formState.errors.apellidoPaterno.message}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Ap. Materno</label>
                  <input {...form.register('apellidoMaterno')} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>CI</label>
                  <input {...form.register('ci')} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Teléfono</label>
                  <input {...form.register('telefono')} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  <input {...form.register('email')} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Ocupación</label>
                  <input {...form.register('ocupacion')} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Dirección</label>
                  <input {...form.register('direccion')} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelCls}>Fec. Nac.</label>
                  <input type="date" {...form.register('fechaNac')} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Fec. Ingreso</label>
                  <input type="date" {...form.register('fechaIng')} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Fec. Alta</label>
                  <input type="date" {...form.register('fechaAlta')} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Aporte Base (Bs)</label>
                  <input type="number" step="0.01" {...form.register('aporteBase')} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Estado</label>
                  <select {...form.register('estadoId')} className={inputCls}>
                    <option value="">(por defecto)</option>
                    {estadosSocio.map((e) => (
                      <option key={e.id} value={e.id}>● {e.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Grupo Primario</label>
                  <select
                    {...form.register('grupoPrimarioId')}
                    onChange={(e) => handlePrimaryChange(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Sin grupo primario</option>
                    {grupos.map((g) => (
                      <option key={g.id} value={g.id}>{g.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Grupos Adicionales</label>
                  <div className="flex min-h-10 flex-wrap gap-2 rounded-lg border border-gray-300 p-2">
                    {grupos.length === 0 && (
                      <span className="text-xs text-gray-400">No hay grupos configurados</span>
                    )}
                    {grupos
                      .filter((g) => g.id !== form.watch('grupoPrimarioId'))
                      .map((g) => {
                        const selected = adicionalIds.includes(g.id);
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => toggleAdicional(g.id)}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors ${
                              selected
                                ? 'bg-blue-600 text-white'
                                : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {g.nombre}
                            {selected && <span aria-hidden>×</span>}
                          </button>
                        );
                      })}
                  </div>
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

      {/* ── Ficha (bottom sheet móvil / modal sm+) ── */}
      {ficha && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white p-6 shadow-xl sm:max-w-lg sm:rounded-xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-gray-900">
                {ficha.nombre} {ficha.apellidoPaterno} {ficha.apellidoMaterno ?? ''}
              </h3>
              <EstadoBadge socio={ficha} />
            </div>

            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-gray-500">CI</dt><dd>{ficha.ci || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Teléfono</dt><dd>{ficha.telefono || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Email</dt><dd>{ficha.email || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Ocupación</dt><dd>{ficha.ocupacion || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Dirección</dt><dd>{ficha.direccion || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Fec. Nac.</dt><dd>{ficha.fechaNac || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Fec. Ingreso</dt><dd>{ficha.fechaIng || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Fec. Alta</dt><dd>{ficha.fechaAlta || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Aporte Base</dt><dd>Bs {ficha.aporteBase.toFixed(2)}</dd></div>
            </dl>

            <div className="mt-3">
              <p className="mb-1 text-xs font-medium text-gray-500">Grupos</p>
              <GrupoChips socio={ficha} grupos={grupos} />
            </div>

            {ficha.motivoBaja && (
              <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
                <p className="font-medium">Dado de baja</p>
                <p className="mt-1">Motivo: {ficha.motivoBaja}</p>
                {ficha.fechaBaja && <p className="mt-1">Fecha: {ficha.fechaBaja}</p>}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setFicha(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Dar de Baja ── */}
      {bajaTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-bold text-gray-900">Dar de baja</h3>
            <p className="mb-3 text-sm text-gray-600">
              {bajaTarget.nombre} {bajaTarget.apellidoPaterno} pasará al estado de baja. Motivo requerido:
            </p>
            <textarea
              value={bajaMotivo}
              onChange={(e) => setBajaMotivo(e.target.value)}
              rows={3}
              placeholder="Motivo de la baja..."
              className={inputCls}
            />
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setBajaTarget(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleBaja}
                disabled={!bajaMotivo.trim() || bajando}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {bajando ? 'Guardando...' : 'Confirmar Baja'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
