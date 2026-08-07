import { useEffect, useState } from 'react';
import { useAppStore } from '../stores/app.store';
import { socioPermiteUI } from '../lib/permisos';
import { Badge } from '@otb/ui';

type Tab = 'balance' | 'libro-diario' | 'resumen-socio';
type BalanceMode = 'gestion-mes' | 'gestion' | 'rango' | 'todas';
type ResumenTipo = 'todos' | 'aportes' | 'multas';

/** Badge de estado del socio con color del catálogo (hex inline). */
function SocioEstadoBadge({ socioId, socioById }: { socioId: string; socioById: Map<string, { estadoColor: string | null; estadoNombre: string | null }> }) {
  const socio = socioById.get(socioId);
  if (!socio?.estadoNombre) return null;
  return (
    <Badge style={{ backgroundColor: socio.estadoColor ?? '#9ca3af', color: '#fff' }}>
      {socio.estadoNombre}
    </Badge>
  );
}

export default function ReportesPage() {
  const {
    socios, fetchSocios,
    estadosSocio, accionesSocio, grupos, fetchConfig,
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
  const [ldEstadoId, setLdEstadoId] = useState('');
  const [ldGrupoId, setLdGrupoId] = useState('');
  const [rsGestion, setRsGestion] = useState('');
  const [rsMes, setRsMes] = useState('');
  const [rsFechaDesde, setRsFechaDesde] = useState('');
  const [rsFechaHasta, setRsFechaHasta] = useState('');
  const [rsTipo, setRsTipo] = useState<ResumenTipo>('todos');
  const [rsEstadoId, setRsEstadoId] = useState('');
  const [rsGrupoId, setRsGrupoId] = useState('');

  useEffect(() => {
    fetchSocios();
    fetchConfig();
  }, [fetchSocios, fetchConfig]);

  useEffect(() => {
    if (tab === 'balance') {
      if (balanceMode === 'gestion-mes') fetchBalance(gestion, mes);
      else if (balanceMode === 'gestion') fetchBalance(gestion);
      else if (balanceMode === 'rango') fetchBalance(undefined, undefined, fechaDesde || undefined, fechaHasta || undefined);
      else fetchBalance();
    } else if (tab === 'libro-diario') {
      // D47: firma refactorizada (filters?, page?) — el mapeo de filtros es el de
      // D49 inline; el wiring completo (filtros extraídos, setLibroDiarioPage,
      // Pagination, empty-state por total) llega en T5.3 (Slice C).
      fetchLibroDiario({
        fechaDesde: fechaDesde || undefined,
        fechaHasta: fechaHasta || undefined,
        gestion: ldGestion || undefined,
        mes: ldMes || undefined,
        tipo: ldTipo === 'todos' ? undefined : ldTipo,
        estadoId: ldEstadoId || undefined,
        grupoId: ldGrupoId || undefined,
      });
    } else if (tab === 'resumen-socio' && selectedSocioId) {
      fetchResumenSocio(selectedSocioId, rsGestion || undefined, rsMes || undefined, rsFechaDesde || undefined, rsFechaHasta || undefined, rsTipo === 'todos' ? undefined : rsTipo, rsEstadoId || undefined, rsGrupoId || undefined);
    }
  }, [tab, balanceMode, gestion, mes, fechaDesde, fechaHasta, selectedSocioId, ldGestion, ldMes, ldTipo, ldEstadoId, ldGrupoId, rsGestion, rsMes, rsFechaDesde, rsFechaHasta, rsTipo, rsEstadoId, rsGrupoId, fetchBalance, fetchLibroDiario, fetchResumenSocio]);

  const sociosConPermiso = socios.filter((s) =>
    socioPermiteUI(estadosSocio, accionesSocio, s.estadoId, 'reportes'),
  );
  const socioById = new Map(socios.map((s) => [s.id, s]));

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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
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
            <select
              value={ldEstadoId}
              onChange={(e) => setLdEstadoId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Todos los estados de socio</option>
              {estadosSocio.map((e) => (<option key={e.id} value={e.id}>● {e.nombre}</option>))}
            </select>
            <select
              value={ldGrupoId}
              onChange={(e) => setLdGrupoId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Todos los grupos</option>
              {grupos.map((g) => (<option key={g.id} value={g.id}>{g.nombre}</option>))}
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
            <div className="hidden overflow-x-auto rounded-xl border bg-white shadow-sm sm:block">
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
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{m.socioNombre ? `${m.socioNombre} ${m.socioApellido ?? ''}` : '-'}</span>
                          {m.socioId && <SocioEstadoBadge socioId={m.socioId} socioById={socioById} />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{m.nota ?? '-'}</td>
                      <td className={`px-4 py-3 font-medium ${m.tipo === 'ingreso' ? 'text-green-700' : 'text-red-700'}`}>Bs {m.monto.toFixed(2)}</td>
                      <td className="px-4 py-3 text-gray-500">{m.numeroRecibo ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {libroDiario.length > 0 && (
            <div className="space-y-3 sm:hidden">
              {libroDiario.map((m) => (
                <div key={m.id} className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${m.tipo === 'ingreso' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{m.tipo}</span>
                    <span className="text-xs text-gray-500">{m.fecha}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900">{m.socioNombre ? `${m.socioNombre} ${m.socioApellido ?? ''}` : '-'}</span>
                    {m.socioId && <SocioEstadoBadge socioId={m.socioId} socioById={socioById} />}
                  </div>
                  <dl className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between gap-2"><dt className="text-gray-500">Concepto</dt><dd>{m.nota ?? '-'}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-gray-500">Monto</dt><dd className={`font-medium ${m.tipo === 'ingreso' ? 'text-green-700' : 'text-red-700'}`}>Bs {m.monto.toFixed(2)}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-gray-500">Recibo</dt><dd>{m.numeroRecibo ?? '-'}</dd></div>
                  </dl>
                </div>
              ))}
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
              {sociosConPermiso.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre} {s.apellidoPaterno}</option>
              ))}
            </select>
            <input type="number" placeholder="Gestión" value={rsGestion} onChange={(e) => setRsGestion(e.target.value)} className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input type="number" placeholder="Mes" min={1} max={12} value={rsMes} onChange={(e) => setRsMes(e.target.value)} className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <select
              value={rsEstadoId}
              onChange={(e) => setRsEstadoId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Todos los estados de socio</option>
              {estadosSocio.map((e) => (<option key={e.id} value={e.id}>● {e.nombre}</option>))}
            </select>
            <select
              value={rsGrupoId}
              onChange={(e) => setRsGrupoId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Todos los grupos</option>
              {grupos.map((g) => (<option key={g.id} value={g.id}>{g.nombre}</option>))}
            </select>
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
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-lg font-semibold text-gray-900">
                    {resumenSocio.socio.nombre} {resumenSocio.socio.apellido}
                  </h4>
                  {resumenSocio.socio.id && <SocioEstadoBadge socioId={resumenSocio.socio.id} socioById={socioById} />}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
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
