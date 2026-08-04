import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAppStore } from '../stores/app.store';
import { Badge } from '@otb/ui';
import type { TipoActividad, EstadoSocio, Grupo, TipoAporte } from '@otb/core';

const configSchema = z.object({
  nombreOTB: z.string().min(1, 'Requerido'),
  gestionActual: z.coerce.number().min(2000),
  aporteMensualBase: z.coerce.number().min(0),
  diasGraciaAporte: z.coerce.number().min(0).default(0),
  toleranciaMinutos: z.coerce.number().min(0).default(15),
});

type ConfigForm = z.infer<typeof configSchema>;

const defaultConfig: ConfigForm = {
  nombreOTB: '', gestionActual: new Date().getFullYear(),
  aporteMensualBase: 0, diasGraciaAporte: 0, toleranciaMinutos: 15,
};

const tipoSchema = z.object({
  nombre: z.string().min(1, 'Requerido'),
  tolerancia: z.coerce.number().min(0).default(15),
});

type TipoForm = z.infer<typeof tipoSchema>;

const tipoAporteSchema = z.object({
  nombre: z.string().min(1, 'Requerido'),
  montoBase: z.coerce.number().min(0, 'Debe ser >= 0'),
  descripcion: z.string().default(''),
  activo: z.boolean().default(true),
});

type TipoAporteForm = z.infer<typeof tipoAporteSchema>;

const defaultTipoAporteForm: TipoAporteForm = {
  nombre: '',
  montoBase: 0,
  descripcion: '',
  activo: true,
};

const opcionesDisponibles = ['asistio', 'falta', 'tardanza', 'justificado'];

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none';
const labelCls = 'mb-1 block text-xs font-medium text-gray-600';

/** Switch radix-free (botón role="switch"); solo se usa en esta página. */
function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`h-5 w-9 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-blue-600' : 'bg-gray-300'
      }`}
    >
      <span
        className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

type EstadoFormState = {
  nombre: string;
  color: string;
  esActivo: boolean;
  esBaja: boolean;
  esDefecto: boolean;
  accionIds: string[];
};

const estadoFormVacio = (accionIds: string[]): EstadoFormState => ({
  nombre: '',
  color: '#22c55e',
  esActivo: false,
  esBaja: false,
  esDefecto: false,
  accionIds,
});

function estadoAForm(estado: EstadoSocio): EstadoFormState {
  return {
    nombre: estado.nombre,
    color: estado.color,
    esActivo: estado.esActivo === 1,
    esBaja: estado.esBaja === 1,
    esDefecto: estado.esDefecto === 1,
    accionIds: [...estado.accionIds],
  };
}

export default function ConfigPage() {
  const {
    config, configLoading, configError,
    fetchConfig, updateConfig,
    tiposActividad, addTipoActividad, updateTipoActividad, removeTipoActividad,
    tiposAporte, addTipoAporte, updateTipoAporte, removeTipoAporte,
    estadosSocio, accionesSocio, grupos,
    addEstadoSocio, updateEstadoSocio, removeEstadoSocio, setEstadoAcciones,
    addAccionSocio, removeAccionSocio,
    addGrupo, updateGrupo, removeGrupo,
  } = useAppStore();

  const [saved, setSaved] = useState(false);
  const [showTipoForm, setShowTipoForm] = useState(false);
  const [editingTipo, setEditingTipo] = useState<TipoActividad | null>(null);
  const [editOpciones, setEditOpciones] = useState<string[]>([]);
  const [editMultas, setEditMultas] = useState<Record<string, number>>({});

  // Estados de Socio
  const [showEstadoForm, setShowEstadoForm] = useState(false);
  const [editingEstado, setEditingEstado] = useState<EstadoSocio | null>(null);
  const [estadoForm, setEstadoForm] = useState<EstadoFormState>(() =>
    estadoFormVacio([]),
  );
  const [estadoFormError, setEstadoFormError] = useState<string | null>(null);
  const [savingAcciones, setSavingAcciones] = useState<Record<string, boolean>>({});

  // Acciones
  const [accionClave, setAccionClave] = useState('');
  const [accionNombre, setAccionNombre] = useState('');
  const [accionDescripcion, setAccionDescripcion] = useState('');
  const [accionWarning, setAccionWarning] = useState<string | null>(null);

  // Grupos
  const [showGrupoForm, setShowGrupoForm] = useState(false);
  const [editingGrupo, setEditingGrupo] = useState<Grupo | null>(null);
  const [grupoForm, setGrupoForm] = useState({ nombre: '', descripcion: '' });
  const [grupoFormError, setGrupoFormError] = useState<string | null>(null);

  const configForm = useForm<ConfigForm>({
    resolver: zodResolver(configSchema) as any,
    defaultValues: defaultConfig,
  });

  const tipoForm = useForm<TipoForm>({
    resolver: zodResolver(tipoSchema) as any,
    defaultValues: { nombre: '', tolerancia: 15 },
  });

  // Tipos de Aporte
  const [showTipoAporteForm, setShowTipoAporteForm] = useState(false);
  const [editingTipoAporte, setEditingTipoAporte] = useState<TipoAporte | null>(null);

  const tipoAporteForm = useForm<TipoAporteForm>({
    resolver: zodResolver(tipoAporteSchema) as any,
    defaultValues: defaultTipoAporteForm,
  });

  const editTipoAporteForm = useForm<TipoAporteForm>({
    resolver: zodResolver(tipoAporteSchema) as any,
    defaultValues: defaultTipoAporteForm,
  });

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (config) {
      configForm.reset(configSchema.parse(config));
    }
  }, [config, configForm]);

  async function handleConfigSave(data: ConfigForm) {
    await updateConfig(data);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleAddTipo(data: TipoForm) {
    if (tiposActividad.some((t) => t.nombre === data.nombre)) {
      alert('Ya existe un tipo con ese nombre');
      return;
    }
    await addTipoActividad({
      nombre: data.nombre,
      opciones: JSON.stringify(opcionesDisponibles),
      multas: null,
      tolerancia: data.tolerancia,
    } as any);
    setShowTipoForm(false);
    tipoForm.reset({ nombre: '', tolerancia: 15 });
  }

  function handleEditTipo(tipo: TipoActividad) {
    const parsedOpciones = typeof tipo.opciones === 'string' ? JSON.parse(tipo.opciones) : tipo.opciones ?? opcionesDisponibles;
    const parsedMultas = typeof tipo.multas === 'string' ? JSON.parse(tipo.multas) : tipo.multas ?? {};
    setEditingTipo(tipo);
    setEditOpciones(Array.isArray(parsedOpciones) ? parsedOpciones : opcionesDisponibles);
    setEditMultas(parsedMultas);
  }

  async function handleSaveEdit() {
    if (!editingTipo) return;
    await updateTipoActividad(editingTipo.id, {
      opciones: JSON.stringify(editOpciones),
      multas: JSON.stringify(editMultas),
    });
    setEditingTipo(null);
  }

  function toggleOpcion(opcion: string) {
    setEditOpciones((prev) =>
      prev.includes(opcion)
        ? prev.filter((o) => o !== opcion)
        : [...prev, opcion],
    );
  }

  function setMultaMonto(opcion: string, monto: number) {
    setEditMultas((prev) => ({ ...prev, [opcion]: monto }));
  }

  async function handleRemoveTipo(id: string, nombre: string) {
    if (confirm(`¿Eliminar el tipo "${nombre}"?`)) {
      await removeTipoActividad(id);
    }
  }

  /* ── Tipos de Aporte ──────────────────────────────────────────── */

  async function handleAddTipoAporte(data: TipoAporteForm) {
    if (tiposAporte.some((t) => t.nombre === data.nombre.trim())) {
      alert('Ya existe un tipo con ese nombre');
      return;
    }
    try {
      await addTipoAporte({
        nombre: data.nombre.trim(),
        montoBase: data.montoBase,
        descripcion: data.descripcion?.trim() || null,
        activo: data.activo ? 1 : 0,
      });
      setShowTipoAporteForm(false);
      tipoAporteForm.reset(defaultTipoAporteForm);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function handleOpenEditTipoAporte(tipo: TipoAporte) {
    setEditingTipoAporte(tipo);
    editTipoAporteForm.reset({
      nombre: tipo.nombre,
      montoBase: tipo.montoBase,
      descripcion: tipo.descripcion ?? '',
      activo: tipo.activo === 1,
    });
  }

  async function handleSaveEditTipoAporte() {
    if (!editingTipoAporte) return;
    const data = editTipoAporteForm.getValues();
    try {
      await updateTipoAporte(editingTipoAporte.id, {
        nombre: data.nombre.trim(),
        montoBase: data.montoBase,
        descripcion: data.descripcion?.trim() || null,
        activo: data.activo ? 1 : 0,
      });
      setEditingTipoAporte(null);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleRemoveTipoAporte(id: string, nombre: string) {
    if (!confirm(`¿Eliminar el tipo "${nombre}"?`)) return;
    try {
      await removeTipoAporte(id);
    } catch (e) {
      if ((e as { status?: number }).status === 409) {
        alert('No se puede eliminar: hay socios usando este tipo');
      } else {
        alert((e as Error).message);
      }
    }
  }

  /* ── Estados de Socio ─────────────────────────────────────────── */

  function openEstadoCreate() {
    setEditingEstado(null);
    setEstadoFormError(null);
    setEstadoForm(estadoFormVacio(accionesSocio.map((a) => a.id)));
    setShowEstadoForm(true);
  }

  function openEstadoEdit(estado: EstadoSocio) {
    setEditingEstado(estado);
    setEstadoFormError(null);
    setEstadoForm(estadoAForm(estado));
    setShowEstadoForm(true);
  }

  function toggleEstadoAccion(accionId: string) {
    setEstadoForm((prev) => ({
      ...prev,
      accionIds: prev.accionIds.includes(accionId)
        ? prev.accionIds.filter((id) => id !== accionId)
        : [...prev.accionIds, accionId],
    }));
  }

  async function handleEstadoSubmit() {
    if (!estadoForm.nombre.trim()) {
      setEstadoFormError('El nombre es requerido');
      return;
    }
    setEstadoFormError(null);
    const payload = {
      nombre: estadoForm.nombre.trim(),
      color: estadoForm.color,
      esActivo: estadoForm.esActivo ? 1 : 0,
      esBaja: estadoForm.esBaja ? 1 : 0,
      esDefecto: estadoForm.esDefecto ? 1 : 0,
      accionIds: estadoForm.accionIds,
    };
    try {
      if (editingEstado) {
        await updateEstadoSocio(editingEstado.id, payload);
      } else {
        await addEstadoSocio(payload);
      }
      setShowEstadoForm(false);
      setEditingEstado(null);
    } catch (e) {
      setEstadoFormError((e as Error).message);
    }
  }

  async function handleToggleAccion(estado: EstadoSocio, accionId: string) {
    // Lee el estado fresco del store para no pisar cambios concurrentes.
    const actual =
      useAppStore.getState().estadosSocio.find((e) => e.id === estado.id) ?? estado;
    const next = actual.accionIds.includes(accionId)
      ? actual.accionIds.filter((id) => id !== accionId)
      : [...actual.accionIds, accionId];
    setSavingAcciones((prev) => ({ ...prev, [estado.id]: true }));
    try {
      await setEstadoAcciones(estado.id, next);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSavingAcciones((prev) => ({ ...prev, [estado.id]: false }));
    }
  }

  async function handleRemoveEstado(estado: EstadoSocio) {
    if (!confirm(`¿Eliminar el estado "${estado.nombre}"?`)) return;
    try {
      await removeEstadoSocio(estado.id);
    } catch (e) {
      if ((e as { status?: number }).status === 409) {
        alert('No se puede eliminar: el estado tiene socios asociados');
      } else {
        alert((e as Error).message);
      }
    }
  }

  // Advertencia: acciones que ningún estado permite
  const accionesSinEstado = accionesSocio.filter(
    (a) => !estadosSocio.some((e) => e.accionIds.includes(a.id)),
  );

  /* ── Acciones ─────────────────────────────────────────────────── */

  async function handleAddAccion() {
    const clave = accionClave.trim();
    const nombre = accionNombre.trim();
    if (!clave || !nombre) {
      setAccionWarning('La clave y el nombre son requeridos');
      return;
    }
    setAccionWarning(null);
    try {
      await addAccionSocio({
        clave,
        nombre,
        descripcion: accionDescripcion.trim() || null,
      });
      setAccionClave('');
      setAccionNombre('');
      setAccionDescripcion('');
    } catch (e) {
      if ((e as { status?: number }).status === 409) {
        setAccionWarning(`Ya existe una acción con la clave "${clave}"`);
      } else {
        setAccionWarning((e as Error).message);
      }
    }
  }

  async function handleRemoveAccion(id: string, nombre: string) {
    if (!confirm(`¿Eliminar la acción "${nombre}"?`)) return;
    try {
      await removeAccionSocio(id);
    } catch (e) {
      if ((e as { status?: number }).status === 409) {
        alert('No se puede eliminar: la acción está en uso por uno o más estados');
      } else {
        alert((e as Error).message);
      }
    }
  }

  /* ── Grupos ───────────────────────────────────────────────────── */

  function openGrupoCreate() {
    setEditingGrupo(null);
    setGrupoFormError(null);
    setGrupoForm({ nombre: '', descripcion: '' });
    setShowGrupoForm(true);
  }

  function openGrupoEdit(grupo: Grupo) {
    setEditingGrupo(grupo);
    setGrupoFormError(null);
    setGrupoForm({ nombre: grupo.nombre, descripcion: grupo.descripcion ?? '' });
    setShowGrupoForm(true);
  }

  async function handleGrupoSubmit() {
    if (!grupoForm.nombre.trim()) {
      setGrupoFormError('El nombre es requerido');
      return;
    }
    setGrupoFormError(null);
    const payload = {
      nombre: grupoForm.nombre.trim(),
      descripcion: grupoForm.descripcion.trim() || null,
    };
    try {
      if (editingGrupo) {
        await updateGrupo(editingGrupo.id, payload);
      } else {
        await addGrupo(payload);
      }
      setShowGrupoForm(false);
      setEditingGrupo(null);
    } catch (e) {
      setGrupoFormError((e as Error).message);
    }
  }

  async function handleRemoveGrupo(grupo: Grupo) {
    if (!confirm(`¿Eliminar el grupo "${grupo.nombre}"?`)) return;
    try {
      await removeGrupo(grupo.id);
    } catch (e) {
      if ((e as { status?: number }).status === 409) {
        alert('No se puede eliminar: el grupo tiene socios asociados');
      } else {
        alert((e as Error).message);
      }
    }
  }

  if (configLoading) {
    return <p className="text-gray-500">Cargando configuración...</p>;
  }

  if (configError) {
    return <p className="text-red-600">Error: {configError}</p>;
  }

  return (
    <div className="max-w-2xl space-y-8">
      <h2 className="text-2xl font-bold text-gray-900">Configuración</h2>

      {saved && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          Configuración guardada exitosamente
        </div>
      )}

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">OTB</h3>
        <form onSubmit={configForm.handleSubmit(handleConfigSave)} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Nombre OTB</label>
              <input {...configForm.register('nombreOTB')} className={inputCls} />
              {configForm.formState.errors.nombreOTB && <p className="text-xs text-red-500">{configForm.formState.errors.nombreOTB.message}</p>}
            </div>
            <div>
              <label className={labelCls}>Gestión Actual</label>
              <input type="number" {...configForm.register('gestionActual')} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Aporte Base (Bs)</label>
              <input type="number" step="0.01" {...configForm.register('aporteMensualBase')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Días Gracia</label>
              <input type="number" {...configForm.register('diasGraciaAporte')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Tolerancia (min)</label>
              <input type="number" {...configForm.register('toleranciaMinutos')} className={inputCls} />
            </div>
          </div>
          <div className="pt-2">
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Guardar Configuración
            </button>
          </div>
        </form>
      </div>

      {/* ── Tipos de Actividad ── */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-gray-900">Tipos de Actividad</h3>
          <button
            onClick={() => setShowTipoForm(true)}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            + Nuevo Tipo
          </button>
        </div>

        {tiposActividad.length === 0 && (
          <p className="text-sm text-gray-500">No hay tipos de actividad configurados</p>
        )}

        <div className="space-y-2">
          {tiposActividad.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-gray-50 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-gray-900">{t.nombre}</span>
                <span className="ml-3 text-xs text-gray-500">Tolerancia: {t.tolerancia} min</span>
                <span className="ml-3 text-xs text-gray-400">
                  Opciones: {(() => { try { return JSON.parse(typeof t.opciones === 'string' ? t.opciones : '[]').join(', '); } catch { return '-'; } })()}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEditTipo(t)}
                  className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleRemoveTipo(t.id, t.nombre)}
                  className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>

        {showTipoForm && (
          <form onSubmit={tipoForm.handleSubmit(handleAddTipo)} className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border bg-gray-50 p-4">
            <div className="min-w-40 flex-1">
              <label className={labelCls}>Nombre</label>
              <input {...tipoForm.register('nombre')} className={inputCls} />
              {tipoForm.formState.errors.nombre && <p className="text-xs text-red-500">{tipoForm.formState.errors.nombre.message}</p>}
            </div>
            <div className="w-24">
              <label className={labelCls}>Tolerancia</label>
              <input type="number" {...tipoForm.register('tolerancia')} className={inputCls} />
            </div>
            <button type="submit" className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
              Agregar
            </button>
            <button type="button" onClick={() => setShowTipoForm(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
          </form>
        )}
      </div>

      {/* ── Tipos de Aporte ── */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-gray-900">Tipos de Aporte</h3>
          <button
            onClick={() => setShowTipoAporteForm(true)}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            + Nuevo Tipo
          </button>
        </div>

        {tiposAporte.length === 0 && (
          <p className="text-sm text-gray-500">No hay tipos de aporte configurados</p>
        )}

        <div className="space-y-2">
          {tiposAporte.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-gray-50 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-gray-900">{t.nombre}</span>
                <span className="ml-3 text-xs text-gray-500">Bs {t.montoBase.toFixed(2)}</span>
                {t.activo === 1 && <Badge variant="green">activo</Badge>}
                {t.descripcion && <span className="ml-3 text-xs text-gray-400">{t.descripcion}</span>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleOpenEditTipoAporte(t)}
                  className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleRemoveTipoAporte(t.id, t.nombre)}
                  className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>

        {showTipoAporteForm && (
          <form
            onSubmit={tipoAporteForm.handleSubmit(handleAddTipoAporte)}
            className="mt-4 space-y-3 rounded-lg border bg-gray-50 p-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Nombre *</label>
                <input {...tipoAporteForm.register('nombre')} className={inputCls} />
                {tipoAporteForm.formState.errors.nombre && <p className="text-xs text-red-500">{tipoAporteForm.formState.errors.nombre.message}</p>}
              </div>
              <div>
                <label className={labelCls}>Monto Base (Bs) *</label>
                <input type="number" step="0.01" min="0" {...tipoAporteForm.register('montoBase')} className={inputCls} />
                {tipoAporteForm.formState.errors.montoBase && <p className="text-xs text-red-500">{tipoAporteForm.formState.errors.montoBase.message}</p>}
              </div>
            </div>
            <div>
              <label className={labelCls}>Descripción (opcional)</label>
              <input {...tipoAporteForm.register('descripcion')} className={inputCls} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <Switch
                  checked={tipoAporteForm.watch('activo')}
                  label="tipo de aporte activo"
                  onChange={() => tipoAporteForm.setValue('activo', !tipoAporteForm.watch('activo'))}
                />
                activo
              </label>
              <div className="flex gap-2">
                <button type="submit" className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
                  Agregar
                </button>
                <button type="button" onClick={() => setShowTipoAporteForm(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Cancelar
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* ── Estados de Socio ── */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-gray-900">Estados de Socio</h3>
          <button
            onClick={openEstadoCreate}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            + Nuevo Estado
          </button>
        </div>

        {estadosSocio.length === 0 && (
          <p className="text-sm text-gray-500">No hay estados configurados</p>
        )}

        {accionesSinEstado.length > 0 && (
          <div className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
            ⚠️ Ningún estado permite: {accionesSinEstado.map((a) => a.nombre).join(', ')}
          </div>
        )}

        <div className="space-y-4">
          {estadosSocio.map((estado) => (
            <div key={estado.id} className="rounded-lg border bg-gray-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: estado.color }}
                    aria-hidden
                  />
                  <span className="text-sm font-medium text-gray-900">{estado.nombre}</span>
                  {estado.esActivo === 1 && <Badge variant="green">activo</Badge>}
                  {estado.esDefecto === 1 && <Badge variant="blue">defecto</Badge>}
                  {estado.esBaja === 1 && <Badge variant="red">baja</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  {savingAcciones[estado.id] && (
                    <span className="text-xs text-gray-500">Guardando…</span>
                  )}
                  <button
                    disabled={Boolean(savingAcciones[estado.id])}
                    onClick={() => openEstadoEdit(estado)}
                    className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                  >
                    Editar
                  </button>
                  <button
                    disabled={Boolean(savingAcciones[estado.id])}
                    onClick={() => handleRemoveEstado(estado)}
                    className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Eliminar
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-gray-200 pt-3">
                {accionesSocio.map((accion) => {
                  const checked = estado.accionIds.includes(accion.id);
                  return (
                    <label key={accion.id} className="flex cursor-pointer items-center gap-2 text-xs text-gray-700">
                      <Switch
                        checked={checked}
                        label={`${estado.nombre}: ${accion.nombre}`}
                        onChange={() => handleToggleAccion(estado, accion.id)}
                      />
                      {accion.nombre}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Acciones ── */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Acciones</h3>

        {accionesSocio.length === 0 && (
          <p className="text-sm text-gray-500">No hay acciones configuradas</p>
        )}

        <div className="space-y-2">
          {accionesSocio.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-gray-50 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <span className="font-mono text-xs text-gray-500">{a.clave}</span>
                <span className="ml-2 text-sm font-medium text-gray-900">{a.nombre}</span>
                {a.descripcion && <span className="ml-2 text-xs text-gray-400">{a.descripcion}</span>}
              </div>
              <button
                onClick={() => handleRemoveAccion(a.id, a.nombre)}
                className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAddAccion();
          }}
          className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border bg-gray-50 p-4"
        >
          <div className="w-32">
            <label className={labelCls}>Clave</label>
            <input
              value={accionClave}
              onChange={(e) => setAccionClave(e.target.value)}
              placeholder="ej. carnet"
              className={inputCls}
            />
          </div>
          <div className="min-w-32 flex-1">
            <label className={labelCls}>Nombre</label>
            <input
              value={accionNombre}
              onChange={(e) => setAccionNombre(e.target.value)}
              placeholder="Carnet"
              className={inputCls}
            />
          </div>
          <div className="min-w-40 flex-1">
            <label className={labelCls}>Descripción (opcional)</label>
            <input
              value={accionDescripcion}
              onChange={(e) => setAccionDescripcion(e.target.value)}
              className={inputCls}
            />
          </div>
          <button type="submit" className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
            Agregar
          </button>
        </form>

        {accionWarning && (
          <p className="mt-2 text-xs text-amber-600">{accionWarning}</p>
        )}
      </div>

      {/* ── Grupos ── */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-gray-900">Grupos</h3>
          <button
            onClick={openGrupoCreate}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            + Nuevo Grupo
          </button>
        </div>

        {grupos.length === 0 && (
          <p className="text-sm text-gray-500">No hay grupos configurados</p>
        )}

        <div className="space-y-2">
          {grupos.map((g) => (
            <div key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-gray-50 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-gray-900">{g.nombre}</span>
                {g.descripcion && <span className="ml-2 text-xs text-gray-400">{g.descripcion}</span>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => openGrupoEdit(g)}
                  className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleRemoveGrupo(g)}
                  className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Modal Editar Tipo ── */}
      {editingTipo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-gray-900">
              Editar: {editingTipo.nombre}
            </h3>

            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">Opciones de Asistencia</label>
              <div className="space-y-2">
                {opcionesDisponibles.map((opcion) => (
                  <label key={opcion} className="flex flex-wrap items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editOpciones.includes(opcion)}
                      onChange={() => toggleOpcion(opcion)}
                      className="rounded border-gray-300"
                    />
                    {opcion}
                    {editOpciones.includes(opcion) && (
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Multa Bs"
                        value={editMultas[opcion] ?? ''}
                        onChange={(e) => setMultaMonto(opcion, Number(e.target.value))}
                        className="ml-2 w-28 rounded border border-gray-300 px-2 py-1 text-xs"
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setEditingTipo(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Estado ── */}
      {showEstadoForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-gray-900">
              {editingEstado ? `Editar estado: ${editingEstado.nombre}` : 'Nuevo Estado'}
            </h3>

            {estadoFormError && (
              <p className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-600">{estadoFormError}</p>
            )}

            <div className="space-y-3">
              <div>
                <label className={labelCls}>Nombre *</label>
                <input
                  value={estadoForm.nombre}
                  onChange={(e) => setEstadoForm((p) => ({ ...p, nombre: e.target.value }))}
                  placeholder="ej. voluntario"
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={estadoForm.color}
                    onChange={(e) => setEstadoForm((p) => ({ ...p, color: e.target.value }))}
                    className="h-10 w-14 cursor-pointer rounded border border-gray-300"
                  />
                  <span className="font-mono text-xs text-gray-500">{estadoForm.color}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={estadoForm.esActivo}
                    onChange={(e) => setEstadoForm((p) => ({ ...p, esActivo: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  esActivo (cuenta en el dashboard)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={estadoForm.esDefecto}
                    onChange={(e) => setEstadoForm((p) => ({ ...p, esDefecto: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  esDefecto
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={estadoForm.esBaja}
                    onChange={(e) => setEstadoForm((p) => ({ ...p, esBaja: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  esBaja
                </label>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Acciones permitidas (pre-marcadas todas por defecto)
                </label>
                <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-lg border bg-gray-50 p-3">
                  {accionesSocio.length === 0 && (
                    <p className="text-xs text-gray-500">No hay acciones configuradas</p>
                  )}
                  {accionesSocio.map((accion) => (
                    <label key={accion.id} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={estadoForm.accionIds.includes(accion.id)}
                        onChange={() => toggleEstadoAccion(accion.id)}
                        className="rounded border-gray-300"
                      />
                      {accion.nombre}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => setShowEstadoForm(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleEstadoSubmit}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                {editingEstado ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Grupo ── */}
      {showGrupoForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-gray-900">
              {editingGrupo ? `Editar grupo: ${editingGrupo.nombre}` : 'Nuevo Grupo'}
            </h3>

            {grupoFormError && (
              <p className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-600">{grupoFormError}</p>
            )}

            <div className="space-y-3">
              <div>
                <label className={labelCls}>Nombre *</label>
                <input
                  value={grupoForm.nombre}
                  onChange={(e) => setGrupoForm((p) => ({ ...p, nombre: e.target.value }))}
                  placeholder="ej. Manzano A"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Descripción (opcional)</label>
                <input
                  value={grupoForm.descripcion}
                  onChange={(e) => setGrupoForm((p) => ({ ...p, descripcion: e.target.value }))}
                  className={inputCls}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => setShowGrupoForm(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleGrupoSubmit}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                {editingGrupo ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Editar Tipo de Aporte ── */}
      {editingTipoAporte && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-gray-900">
              Editar tipo: {editingTipoAporte.nombre}
            </h3>

            <div className="space-y-3">
              <div>
                <label className={labelCls}>Nombre *</label>
                <input {...editTipoAporteForm.register('nombre')} className={inputCls} />
                {editTipoAporteForm.formState.errors.nombre && <p className="text-xs text-red-500">{editTipoAporteForm.formState.errors.nombre.message}</p>}
              </div>
              <div>
                <label className={labelCls}>Monto Base (Bs) *</label>
                <input type="number" step="0.01" min="0" {...editTipoAporteForm.register('montoBase')} className={inputCls} />
                {editTipoAporteForm.formState.errors.montoBase && <p className="text-xs text-red-500">{editTipoAporteForm.formState.errors.montoBase.message}</p>}
              </div>
              <div>
                <label className={labelCls}>Descripción (opcional)</label>
                <input {...editTipoAporteForm.register('descripcion')} className={inputCls} />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <Switch
                  checked={editTipoAporteForm.watch('activo')}
                  label="tipo de aporte activo"
                  onChange={() => editTipoAporteForm.setValue('activo', !editTipoAporteForm.watch('activo'))}
                />
                activo
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => setEditingTipoAporte(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEditTipoAporte}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
