import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAppStore } from '../stores/app.store';

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

export default function ConfigPage() {
  const {
    config, configLoading, configError,
    fetchConfig, updateConfig,
    tiposActividad, addTipoActividad, removeTipoActividad,
  } = useAppStore();

  const [saved, setSaved] = useState(false);
  const [showTipoForm, setShowTipoForm] = useState(false);

  const configForm = useForm<ConfigForm>({
    resolver: zodResolver(configSchema) as any,
    defaultValues: defaultConfig,
  });

  const tipoForm = useForm<TipoForm>({
    resolver: zodResolver(tipoSchema) as any,
    defaultValues: { nombre: '', tolerancia: 15 },
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
      opciones: '[]',
      multas: null,
      tolerancia: data.tolerancia,
    } as any);
    setShowTipoForm(false);
    tipoForm.reset({ nombre: '', tolerancia: 15 });
  }

  async function handleRemoveTipo(nombre: string) {
    if (confirm(`¿Eliminar el tipo "${nombre}"?`)) {
      await removeTipoActividad(nombre);
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Nombre OTB</label>
              <input {...configForm.register('nombreOTB')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              {configForm.formState.errors.nombreOTB && <p className="text-xs text-red-500">{configForm.formState.errors.nombreOTB.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Gestión Actual</label>
              <input type="number" {...configForm.register('gestionActual')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Aporte Base (Bs)</label>
              <input type="number" step="0.01" {...configForm.register('aporteMensualBase')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Días Gracia</label>
              <input type="number" {...configForm.register('diasGraciaAporte')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Tolerancia (min)</label>
              <input type="number" {...configForm.register('toleranciaMinutos')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
          </div>
          <div className="pt-2">
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Guardar Configuración
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
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
            <div key={t.nombre} className="flex items-center justify-between rounded-lg border bg-gray-50 px-4 py-2.5">
              <div>
                <span className="text-sm font-medium text-gray-900">{t.nombre}</span>
                <span className="ml-3 text-xs text-gray-500">Tolerancia: {t.tolerancia} min</span>
              </div>
              <button
                onClick={() => handleRemoveTipo(t.nombre)}
                className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>

        {showTipoForm && (
          <form onSubmit={tipoForm.handleSubmit(handleAddTipo)} className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border bg-gray-50 p-4">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-600">Nombre</label>
              <input {...tipoForm.register('nombre')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              {tipoForm.formState.errors.nombre && <p className="text-xs text-red-500">{tipoForm.formState.errors.nombre.message}</p>}
            </div>
            <div className="w-24">
              <label className="mb-1 block text-xs font-medium text-gray-600">Tolerancia</label>
              <input type="number" {...tipoForm.register('tolerancia')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
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
    </div>
  );
}
