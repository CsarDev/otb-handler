import { createFileRoute, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useAppStore } from '../stores/app.store';

export const Route = createFileRoute('/asistencia')({
  validateSearch: (search: Record<string, unknown>) => ({
    actividadId: search.actividadId ? Number(search.actividadId) : undefined,
  }),
  component: AsistenciaPage,
});

const TIPOS_ASISTENCIA = [
  { value: 'asistio', label: 'Presente', class: 'text-green-700 bg-green-50 border-green-300' },
  { value: 'tardanza', label: 'Tardanza', class: 'text-yellow-700 bg-yellow-50 border-yellow-300' },
  { value: 'ausente', label: 'Ausente', class: 'text-red-700 bg-red-50 border-red-300' },
  { value: 'justificado', label: 'Justificado', class: 'text-blue-700 bg-blue-50 border-blue-300' },
] as const;

function AsistenciaPage() {
  const search = useSearch({ from: Route.id }) as { actividadId?: number };
  const initialActividadId = search.actividadId;
  const { actividades, actividadesLoading: actsLoading, fetchActividades } = useAppStore();
  const { socios, sociosLoading: sociosLoading_, fetchSocios } = useAppStore();
  const { asistenciaRecords, asistenciaLoading, asistenciaError, fetchAsistencia, saveAsistencia } = useAppStore();
  const [selectedActividadId, setSelectedActividadId] = useState<number | undefined>(initialActividadId);
  const [registros, setRegistros] = useState<Record<number, { tipoAsistencia: string; minutosTardanza: number }>>({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchActividades();
    fetchSocios();
  }, [fetchActividades, fetchSocios]);

  useEffect(() => {
    if (selectedActividadId) {
      fetchAsistencia(selectedActividadId);
    }
  }, [selectedActividadId, fetchAsistencia]);

  useEffect(() => {
    if (asistenciaRecords.length > 0 && selectedActividadId) {
      const map: Record<number, { tipoAsistencia: string; minutosTardanza: number }> = {};
      for (const r of asistenciaRecords) {
        map[r.socioId] = { tipoAsistencia: r.tipoAsistencia, minutosTardanza: r.minutosTardanza ?? 0 };
      }
      setRegistros(map);
    } else if (selectedActividadId && socios.length > 0) {
      const map: Record<number, { tipoAsistencia: string; minutosTardanza: number }> = {};
      for (const s of socios) {
        if (s.estado === 'activo') {
          map[s.id] = { tipoAsistencia: 'asistio', minutosTardanza: 0 };
        }
      }
      setRegistros(map);
    }
  }, [asistenciaRecords, selectedActividadId, socios]);

  async function handleSave() {
    if (!selectedActividadId) return;
    setSaving(true);
    setSuccess(false);
    try {
      const records = Object.entries(registros).map(([socioId, data]) => ({
        socioId: Number(socioId),
        tipoAsistencia: data.tipoAsistencia,
        minutosTardanza: data.minutosTardanza,
      }));
      await saveAsistencia(selectedActividadId, records);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  function setTipo(socioId: number, tipo: string) {
    setRegistros((prev) => ({
      ...prev,
      [socioId]: { ...prev[socioId], tipoAsistencia: tipo, minutosTardanza: tipo === 'tardanza' ? prev[socioId]?.minutosTardanza || 15 : 0 },
    }));
  }

  function setMinutos(socioId: number, minutos: number) {
    setRegistros((prev) => ({
      ...prev,
      [socioId]: { ...prev[socioId], minutosTardanza: minutos },
    }));
  }

  const activeSocios = socios.filter((s) => s.estado === 'activo');

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Asistencia</h2>
        {selectedActividadId && activeSocios.length > 0 && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar Asistencia'}
          </button>
        )}
      </div>

      {success && (
        <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          Asistencia guardada exitosamente
        </div>
      )}

      <div className="mb-6">
        <label className="mb-1 block text-sm font-medium text-gray-600">Seleccionar Actividad</label>
        <select
          value={selectedActividadId ?? ''}
          onChange={(e) => setSelectedActividadId(e.target.value ? Number(e.target.value) : undefined)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none sm:w-80"
        >
          <option value="">Seleccionar actividad...</option>
          {actividades.map((a) => (
            <option key={a.id} value={a.id}>
              {a.tipo} - {a.fecha}{a.descripcion ? ` - ${a.descripcion}` : ''}
            </option>
          ))}
        </select>
      </div>

      {asistenciaLoading && <p className="text-gray-500">Cargando...</p>}
      {asistenciaError && <p className="text-red-600">Error: {asistenciaError}</p>}

      {!selectedActividadId && !asistenciaLoading && (
        <div className="rounded-xl border bg-white p-12 text-center">
          <p className="text-gray-500">Seleccione una actividad para registrar asistencia</p>
        </div>
      )}

      {selectedActividadId && activeSocios.length === 0 && !asistenciaLoading && (
        <div className="rounded-xl border bg-white p-12 text-center">
          <p className="text-gray-500">No hay socios activos para registrar asistencia</p>
        </div>
      )}

      {selectedActividadId && activeSocios.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Socio</th>
                {TIPOS_ASISTENCIA.map((t) => (
                  <th key={t.value} className="px-4 py-3 text-center">{t.label}</th>
                ))}
                <th className="px-4 py-3 text-center">Min. Tardanza</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {activeSocios.map((s) => {
                const reg = registros[s.id];
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">
                      {s.nombre} {s.apellidoPaterno}
                    </td>
                    {TIPOS_ASISTENCIA.map((t) => (
                      <td key={t.value} className="px-4 py-3 text-center">
                        <input
                          type="radio"
                          name={`asistencia-${s.id}`}
                          value={t.value}
                          checked={reg?.tipoAsistencia === t.value}
                          onChange={() => setTipo(s.id, t.value)}
                          className="h-4 w-4 cursor-pointer accent-blue-600"
                        />
                      </td>
                    ))}
                    <td className="px-4 py-3 text-center">
                      <input
                        type="number"
                        min={0}
                        max={120}
                        value={reg?.minutosTardanza ?? 0}
                        onChange={(e) => setMinutos(s.id, Number(e.target.value))}
                        disabled={reg?.tipoAsistencia !== 'tardanza'}
                        className={`w-20 rounded border px-2 py-1 text-center text-sm ${
                          reg?.tipoAsistencia !== 'tardanza' ? 'bg-gray-100 text-gray-400' : 'border-gray-300'
                        }`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
