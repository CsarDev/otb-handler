import { useEffect, useState } from 'react';
import { useAppStore } from '../stores/app.store';
import { socioPermiteUI } from '../lib/permisos';

const TIPOS_ASISTENCIA = [
  { value: 'asistio', label: 'Presente', class: 'text-green-700 bg-green-50 border-green-300' },
  { value: 'tardanza', label: 'Tardanza', class: 'text-yellow-700 bg-yellow-50 border-yellow-300' },
  { value: 'ausente', label: 'Ausente', class: 'text-red-700 bg-red-50 border-red-300' },
  { value: 'justificado', label: 'Justificado', class: 'text-blue-700 bg-blue-50 border-blue-300' },
] as const;

export default function AsistenciaPage() {
  const initialActividadId = undefined;
  const { actividades, actividadesLoading: actsLoading, fetchActividades } = useAppStore();
  const { socios, sociosLoading: sociosLoading_, fetchSocios } = useAppStore();
  const { estadosSocio, accionesSocio, grupos, fetchConfig } = useAppStore();
  const { asistenciaRecords, asistenciaLoading, asistenciaError, fetchAsistencia, saveAsistencia } = useAppStore();
  const [selectedActividadId, setSelectedActividadId] = useState<string | undefined>(initialActividadId);
  const [estadoFilter, setEstadoFilter] = useState('');
  const [grupoFilter, setGrupoFilter] = useState('');
  const [registros, setRegistros] = useState<Record<string, { tipoAsistencia: string; minutosTardanza: number }>>({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchActividades();
    fetchSocios();
    fetchConfig();
  }, [fetchActividades, fetchSocios, fetchConfig]);

  useEffect(() => {
    if (selectedActividadId) {
      fetchAsistencia(selectedActividadId, estadoFilter || undefined, grupoFilter || undefined);
    }
  }, [selectedActividadId, estadoFilter, grupoFilter, fetchAsistencia]);

  // Socios habilitados: su estado permite la acción "asistencia"
  const activosPermitidos = socios.filter((s) =>
    socioPermiteUI(estadosSocio, accionesSocio, s.estadoId, 'asistencia'),
  );

  // Roster visible: los filtros estado/grupo aplican TAMBIÉN al roster, no solo al fetch.
  const sociosFiltrados = activosPermitidos.filter((s) => {
    if (estadoFilter && s.estadoId !== estadoFilter) return false;
    if (grupoFilter) {
      const enGrupo = s.grupoPrimarioId === grupoFilter || s.grupos.some((g) => g.id === grupoFilter);
      if (!enGrupo) return false;
    }
    return true;
  });

  useEffect(() => {
    if (asistenciaRecords.length > 0 && selectedActividadId) {
      const map: Record<string, { tipoAsistencia: string; minutosTardanza: number }> = {};
      for (const r of asistenciaRecords) {
        map[r.socioId] = { tipoAsistencia: r.tipoAsistencia, minutosTardanza: r.minutosTardanza ?? 0 };
      }
      setRegistros(map);
    } else if (selectedActividadId && sociosFiltrados.length > 0) {
      const map: Record<string, { tipoAsistencia: string; minutosTardanza: number }> = {};
      for (const s of sociosFiltrados) {
        map[s.id] = { tipoAsistencia: 'asistio', minutosTardanza: 0 };
      }
      setRegistros(map);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asistenciaRecords, selectedActividadId, socios, estadosSocio, accionesSocio, estadoFilter, grupoFilter]);

  async function handleSave() {
    if (!selectedActividadId) return;
    setSaving(true);
    setSuccess(false);
    try {
      const records = Object.entries(registros).map(([socioId, data]) => ({
        socioId,
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

  function setTipo(socioId: string, tipo: string) {
    setRegistros((prev) => ({
      ...prev,
      [socioId]: { ...prev[socioId], tipoAsistencia: tipo, minutosTardanza: tipo === 'tardanza' ? prev[socioId]?.minutosTardanza || 15 : 0 },
    }));
  }

  function setMinutos(socioId: string, minutos: number) {
    setRegistros((prev) => ({
      ...prev,
      [socioId]: { ...prev[socioId], minutosTardanza: minutos },
    }));
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Asistencia</h2>
        {selectedActividadId && activosPermitidos.length > 0 && (
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

      <div className="mb-6 flex flex-wrap gap-3">
        <div className="w-full sm:w-80">
          <label className="mb-1 block text-sm font-medium text-gray-600">Seleccionar Actividad</label>
          <select
            value={selectedActividadId ?? ''}
            onChange={(e) => setSelectedActividadId(e.target.value || undefined)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">Seleccionar actividad...</option>
            {actividades.map((a) => (
              <option key={a.id} value={a.id}>
                {a.fecha}{a.descripcion ? ` - ${a.descripcion}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-auto">
          <label className="mb-1 block text-sm font-medium text-gray-600">Estado</label>
          <select
            value={estadoFilter}
            onChange={(e) => setEstadoFilter(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">Todos los estados</option>
            {estadosSocio.map((e) => (
              <option key={e.id} value={e.id}>● {e.nombre}</option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-auto">
          <label className="mb-1 block text-sm font-medium text-gray-600">Grupo</label>
          <select
            value={grupoFilter}
            onChange={(e) => setGrupoFilter(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">Todos los grupos</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>{g.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      {asistenciaLoading && <p className="text-gray-500">Cargando...</p>}
      {asistenciaError && <p className="text-red-600">Error: {asistenciaError}</p>}

      {!selectedActividadId && !asistenciaLoading && (
        <div className="rounded-xl border bg-white p-12 text-center">
          <p className="text-gray-500">Seleccione una actividad para registrar asistencia</p>
        </div>
      )}

      {selectedActividadId && sociosFiltrados.length === 0 && !asistenciaLoading && (
        <div className="rounded-xl border bg-white p-12 text-center">
          <p className="text-gray-500">No hay socios habilitados para registrar asistencia</p>
        </div>
      )}

      {selectedActividadId && sociosFiltrados.length > 0 && (
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
              {sociosFiltrados.map((s) => {
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
