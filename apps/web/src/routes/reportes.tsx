import { useEffect, useState } from 'react';
import { useAppStore } from '../stores/app.store';

type Tab = 'balance' | 'libro-diario' | 'resumen-socio';
type BalanceMode = 'gestion-mes' | 'gestion' | 'rango' | 'todas';
type ResumenTipo = 'todos' | 'aportes' | 'multas';

export default function ReportesPage() {
  const {
    socios, fetchSocios,
    balanceReport, libroDiario, resumenSocio, reportsLoading,
    fetchBalance, fetchLibroDiario, fetchResumenSocio,
  } = useAppStore();

  const [tab, setTab] = useState<Tab>('balance');
  const [balanceMode, setBalanceMode] = useState<BalanceMode>('gestion-mes');
  const [gestion, setGestion] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [selectedSocioId, setSelectedSocioId] = useState('');
  const [ldGestion, setLdGestion] = useState('');
  const [ldMes, setLdMes] = useState('');
  const [ldTipo, setLdTipo] = useState<string>('todos');
  const [rsGestion, setRsGestion] = useState('');
  const [rsMes, setRsMes] = useState('');
  const [rsFechaDesde, setRsFechaDesde] = useState('');
  const [rsFechaHasta, setRsFechaHasta] = useState('');
  const [rsTipo, setRsTipo] = useState<ResumenTipo>('todos');

  useEffect(() => {
    fetchSocios();
  }, [fetchSocios]);

  useEffect(() => {
    if (tab === 'balance') {
      if (balanceMode === 'gestion-mes') fetchBalance(gestion, mes);
      else if (balanceMode === 'gestion') fetchBalance(gestion);
      else if (balanceMode === 'rango') fetchBalance(undefined, undefined, fechaDesde || undefined, fechaHasta || undefined);
      else fetchBalance();
    } else if (tab === 'libro-diario') {
      fetchLibroDiario(fechaDesde || undefined, fechaHasta || undefined, ldGestion || undefined, ldMes || undefined, ldTipo === 'todos' ? undefined : ldTipo);
    } else if (tab === 'resumen-socio' && selectedSocioId) {
      fetchResumenSocio(selectedSocioId, rsGestion || undefined, rsMes || undefined, rsFechaDesde || undefined, rsFechaHasta || undefined, rsTipo === 'todos' ? undefined : rsTipo);
    }
  }, [tab, balanceMode, gestion, mes, fechaDesde, fechaHasta, selectedSocioId, ldGestion, ldMes, ldTipo, rsGestion, rsMes, rsFechaDesde, rsFechaHasta, rsTipo, fetchBalance, fetchLibroDiario, fetchResumenSocio]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'balance', label: 'Balance' },
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

      {/* ── BALANCE ── */}
      {tab === 'balance' && (
        <div>
          <div className="mb-4 flex flex-wrap gap-3">
            <select
              value={balanceMode}
              onChange={(e) => setBalanceMode(e.target.value as BalanceMode)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="gestion-mes">Gestión + Mes</option>
              <option value="gestion">Solo Gestión</option>
              <option value="rango">Rango de Fechas</option>
              <option value="todas">Todas las Gestiones</option>
            </select>

            {balanceMode !== 'todas' && balanceMode !== 'rango' && (
              <input
                type="number"
                value={gestion}
                onChange={(e) => setGestion(Number(e.target.value))}
                className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Gestión"
              />
            )}

            {balanceMode === 'gestion-mes' && (
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
            )}

            {balanceMode === 'rango' && (
              <>
                <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Desde" />
                <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Hasta" />
              </>
            )}
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
                  <p className={`text-xs font-medium ${balanceReport.neto >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>Neto</p>
                  <p className={`mt-1 text-2xl font-bold ${balanceReport.neto >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                    Bs {balanceReport.neto.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <h4 className="mb-3 text-sm font-semibold text-gray-900">Ingresos por Categoría</h4>
                  {balanceReport.ingresosPorCategoria.length === 0 ? (
                    <p className="text-sm text-gray-400">Sin ingresos</p>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead><tr className="border-b text-xs text-gray-500"><th className="pb-2 font-medium">Categoría</th><th className="pb-2 text-right font-medium">Monto</th></tr></thead>
                      <tbody>
                        {balanceReport.ingresosPorCategoria.map((cat, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-2 text-gray-700">{cat.categoria}</td>
                            <td className="py-2 text-right font-medium text-green-700">Bs {cat.total.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <h4 className="mb-3 text-sm font-semibold text-gray-900">Egresos por Categoría</h4>
                  {balanceReport.egresosPorCategoria.length === 0 ? (
                    <p className="text-sm text-gray-400">Sin egresos</p>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead><tr className="border-b text-xs text-gray-500"><th className="pb-2 font-medium">Categoría</th><th className="pb-2 text-right font-medium">Monto</th></tr></thead>
                      <tbody>
                        {balanceReport.egresosPorCategoria.map((cat, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-2 text-gray-700">{cat.categoria}</td>
                            <td className="py-2 text-right font-medium text-red-700">Bs {cat.total.toFixed(2)}</td>
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

      {/* ── LIBRO DIARIO ── */}
      {tab === 'libro-diario' && (
        <div>
          <div className="mb-4 flex flex-wrap gap-3">
            <input
              type="number"
              placeholder="Gestión"
              value={ldGestion}
              onChange={(e) => setLdGestion(e.target.value)}
              className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <select
              value={ldMes}
              onChange={(e) => setLdMes(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Todos los meses</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={String(i + 1).padStart(2, '0')}>{i + 1}</option>
              ))}
            </select>
            <select
              value={ldTipo}
              onChange={(e) => setLdTipo(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="todos">Todos</option>
              <option value="ingreso">Ingresos</option>
              <option value="egreso">Egresos</option>
            </select>
            <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Desde" />
            <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Hasta" />
          </div>

          {libroDiario.length === 0 && !reportsLoading && (
            <div className="rounded-xl border bg-white p-12 text-center shadow-sm">
              <p className="text-gray-500">No hay movimientos</p>
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
                        }`}>{m.tipo}</span>
                      </td>
                      <td className="px-4 py-3">{m.socioNombre ? `${m.socioNombre} ${m.socioApellido ?? ''}` : '-'}</td>
                      <td className="px-4 py-3 text-gray-700">{m.nota ?? '-'}</td>
                      <td className={`px-4 py-3 font-medium ${m.tipo === 'ingreso' ? 'text-green-700' : 'text-red-700'}`}>Bs {m.monto.toFixed(2)}</td>
                      <td className="px-4 py-3 text-gray-500">{m.numeroRecibo ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── RESUMEN SOCIO ── */}
      {tab === 'resumen-socio' && (
        <div>
          <div className="mb-4 flex flex-wrap gap-3">
            <select
              value={selectedSocioId}
              onChange={(e) => setSelectedSocioId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Seleccionar socio...</option>
              {socios.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre} {s.apellidoPaterno}</option>
              ))}
            </select>
            <input type="number" placeholder="Gestión" value={rsGestion} onChange={(e) => setRsGestion(e.target.value)} className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input type="number" placeholder="Mes" min={1} max={12} value={rsMes} onChange={(e) => setRsMes(e.target.value)} className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input type="date" value={rsFechaDesde} onChange={(e) => setRsFechaDesde(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Desde" />
            <input type="date" value={rsFechaHasta} onChange={(e) => setRsFechaHasta(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Hasta" />
            <select value={rsTipo} onChange={(e) => setRsTipo(e.target.value as ResumenTipo)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="todos">Aportes + Multas</option>
              <option value="aportes">Solo Aportes</option>
              <option value="multas">Solo Multas</option>
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
                  <p className="mt-1 text-2xl font-bold text-green-700">Bs {resumenSocio.totalAportado.toFixed(2)}</p>
                </div>
                <div className="rounded-xl border bg-yellow-50 p-4">
                  <p className="text-xs font-medium text-yellow-600">Multas Pagadas</p>
                  <p className="mt-1 text-2xl font-bold text-yellow-700">Bs {resumenSocio.multasPagadas.toFixed(2)}</p>
                </div>
                <div className="rounded-xl border bg-red-50 p-4">
                  <p className="text-xs font-medium text-red-600">Saldo Pendiente</p>
                  <p className="mt-1 text-2xl font-bold text-red-700">Bs {resumenSocio.saldoPendienteMultas.toFixed(2)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {(rsTipo === 'todos' || rsTipo === 'aportes') && (
                  <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <h4 className="mb-3 text-sm font-semibold text-gray-900">Aportes Pendientes ({resumenSocio.aportesPendientes.length})</h4>
                    {resumenSocio.aportesPendientes.length === 0 ? (
                      <p className="text-sm text-gray-400">Sin aportes pendientes</p>
                    ) : (
                      <table className="w-full text-left text-sm">
                        <thead><tr className="border-b text-xs text-gray-500"><th className="pb-2 font-medium">Mes</th><th className="pb-2 font-medium">Gestión</th><th className="pb-2 font-medium">Tipo</th><th className="pb-2 text-right font-medium">Monto</th><th className="pb-2 text-right font-medium">Saldo</th></tr></thead>
                        <tbody>
                          {resumenSocio.aportesPendientes.map((a) => (
                            <tr key={a.id} className="border-b last:border-0">
                              <td className="py-2 text-gray-700">{a.mes}</td>
                              <td className="py-2 text-gray-700">{a.gestion}</td>
                              <td className="py-2 text-gray-700">{a.tipo}</td>
                              <td className="py-2 text-right text-gray-700">Bs {a.montoBase.toFixed(2)}</td>
                              <td className="py-2 text-right font-medium text-yellow-700">Bs {(a.saldoPendiente ?? a.montoBase).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {(rsTipo === 'todos' || rsTipo === 'multas') && (
                  <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <h4 className="mb-3 text-sm font-semibold text-gray-900">Multas Pendientes ({resumenSocio.multasPendientes.length})</h4>
                    {resumenSocio.multasPendientes.length === 0 ? (
                      <p className="text-sm text-gray-400">Sin multas pendientes</p>
                    ) : (
                      <table className="w-full text-left text-sm">
                        <thead><tr className="border-b text-xs text-gray-500"><th className="pb-2 font-medium">Concepto</th><th className="pb-2 font-medium">Fecha</th><th className="pb-2 text-right font-medium">Monto</th><th className="pb-2 text-right font-medium">Saldo</th></tr></thead>
                        <tbody>
                          {resumenSocio.multasPendientes.map((m) => (
                            <tr key={m.id} className="border-b last:border-0">
                              <td className="py-2 text-gray-700">{m.concepto}</td>
                              <td className="py-2 text-gray-700">{m.fechaGen}</td>
                              <td className="py-2 text-right text-gray-700">Bs {m.monto.toFixed(2)}</td>
                              <td className="py-2 text-right font-medium text-red-700">Bs {m.saldoPendiente.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
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
