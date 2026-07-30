import { useEffect, useState } from 'react';
import { useAppStore } from '../stores/app.store';

type Tab = 'balance' | 'libro-diario' | 'resumen-socio';

export default function ReportesPage() {
  const {
    socios, fetchSocios,
    balanceReport, libroDiario, resumenSocio, reportsLoading,
    fetchBalance, fetchLibroDiario, fetchResumenSocio,
  } = useAppStore();

  const [tab, setTab] = useState<Tab>('balance');
  const [gestion, setGestion] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [selectedSocioId, setSelectedSocioId] = useState('');

  useEffect(() => {
    fetchSocios();
  }, [fetchSocios]);

  useEffect(() => {
    if (tab === 'balance') fetchBalance(gestion, mes);
    else if (tab === 'libro-diario') fetchLibroDiario(fechaDesde || undefined, fechaHasta || undefined);
    else if (tab === 'resumen-socio' && selectedSocioId) fetchResumenSocio(selectedSocioId);
  }, [tab, gestion, mes, fechaDesde, fechaHasta, selectedSocioId, fetchBalance, fetchLibroDiario, fetchResumenSocio]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'balance', label: 'Balance Mensual' },
    { key: 'libro-diario', label: 'Libro Diario' },
    { key: 'resumen-socio', label: 'Resumen por Socio' },
  ];

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-900">Reportes</h2>

      <div className="mb-6 flex gap-1 rounded-lg border bg-gray-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {reportsLoading && <p className="mb-4 text-sm text-gray-500">Cargando...</p>}

      {tab === 'balance' && (
        <div>
          <div className="mb-4 flex gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Gestión</label>
              <input
                type="number"
                value={gestion}
                onChange={(e) => setGestion(Number(e.target.value))}
                className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Mes</label>
              <select
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => {
                  const m = String(i + 1).padStart(2, '0');
                  return <option key={m} value={m}>{m}</option>;
                })}
              </select>
            </div>
          </div>

          {balanceReport && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl border bg-green-50 p-4">
                  <p className="text-xs font-medium text-green-600">Ingresos</p>
                  <p className="mt-1 text-2xl font-bold text-green-700">
                    Bs {balanceReport.ingresos.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-xl border bg-red-50 p-4">
                  <p className="text-xs font-medium text-red-600">Egresos</p>
                  <p className="mt-1 text-2xl font-bold text-red-700">
                    Bs {balanceReport.egresos.toFixed(2)}
                  </p>
                </div>
                <div className={`rounded-xl border p-4 ${balanceReport.neto >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
                  <p className={`text-xs font-medium ${balanceReport.neto >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                    Neto
                  </p>
                  <p className={`mt-1 text-2xl font-bold ${balanceReport.neto >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                    Bs {balanceReport.neto.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <h4 className="mb-3 text-sm font-semibold text-gray-900">Ingresos por Categoría</h4>
                  {balanceReport.ingresosPorCategoria.length === 0 ? (
                    <p className="text-sm text-gray-400">Sin ingresos en este período</p>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b text-xs text-gray-500">
                          <th className="pb-2 font-medium">Categoría</th>
                          <th className="pb-2 text-right font-medium">Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {balanceReport.ingresosPorCategoria.map((cat, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-2 text-gray-700">{cat.categoria}</td>
                            <td className="py-2 text-right font-medium text-green-700">
                              Bs {cat.total.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <h4 className="mb-3 text-sm font-semibold text-gray-900">Egresos por Categoría</h4>
                  {balanceReport.egresosPorCategoria.length === 0 ? (
                    <p className="text-sm text-gray-400">Sin egresos en este período</p>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b text-xs text-gray-500">
                          <th className="pb-2 font-medium">Categoría</th>
                          <th className="pb-2 text-right font-medium">Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {balanceReport.egresosPorCategoria.map((cat, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-2 text-gray-700">{cat.categoria}</td>
                            <td className="py-2 text-right font-medium text-red-700">
                              Bs {cat.total.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'libro-diario' && (
        <div>
          <div className="mb-4 flex gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Desde</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Hasta</label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {libroDiario.length === 0 && !reportsLoading && (
            <div className="rounded-xl border bg-white p-12 text-center shadow-sm">
              <p className="text-gray-500">No hay movimientos en este período</p>
            </div>
          )}

          {libroDiario.length > 0 && (
            <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Socio</th>
                    <th className="px-4 py-3">Concepto</th>
                    <th className="px-4 py-3">Monto</th>
                    <th className="px-4 py-3">Recibo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {libroDiario.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">{m.fecha}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          m.tipo === 'ingreso' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {m.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {m.socioNombre ? `${m.socioNombre} ${m.socioApellido ?? ''}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{m.nota ?? '-'}</td>
                      <td className={`px-4 py-3 font-medium ${m.tipo === 'ingreso' ? 'text-green-700' : 'text-red-700'}`}>
                        Bs {m.monto.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{m.numeroRecibo ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'resumen-socio' && (
        <div>
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-gray-600">Seleccionar Socio</label>
            <select
              value={selectedSocioId}
              onChange={(e) => setSelectedSocioId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Seleccionar...</option>
              {socios.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre} {s.apellidoPaterno}</option>
              ))}
            </select>
          </div>

          {resumenSocio && (
            <div className="space-y-6">
              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <h4 className="mb-1 text-lg font-semibold text-gray-900">
                  {resumenSocio.socio.nombre} {resumenSocio.socio.apellido}
                </h4>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl border bg-green-50 p-4">
                  <p className="text-xs font-medium text-green-600">Total Aportado</p>
                  <p className="mt-1 text-2xl font-bold text-green-700">
                    Bs {resumenSocio.totalAportado.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-xl border bg-yellow-50 p-4">
                  <p className="text-xs font-medium text-yellow-600">Multas Pagadas</p>
                  <p className="mt-1 text-2xl font-bold text-yellow-700">
                    Bs {resumenSocio.multasPagadas.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-xl border bg-red-50 p-4">
                  <p className="text-xs font-medium text-red-600">Saldo Pendiente Multas</p>
                  <p className="mt-1 text-2xl font-bold text-red-700">
                    Bs {resumenSocio.saldoPendienteMultas.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <p className="text-sm text-gray-600">Aportes Pendientes</p>
                  <p className="text-3xl font-bold text-gray-900">{resumenSocio.aportesPendientes}</p>
                </div>
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <p className="text-sm text-gray-600">Multas Pendientes</p>
                  <p className="text-3xl font-bold text-gray-900">{resumenSocio.multasPendientesCount}</p>
                </div>
              </div>
            </div>
          )}

          {!resumenSocio && !reportsLoading && selectedSocioId && (
            <div className="rounded-xl border bg-white p-12 text-center shadow-sm">
              <p className="text-gray-500">Seleccioná un socio para ver su resumen</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
