import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useAppStore } from '../stores/app.store';

export const Route = createFileRoute('/')({
  component: DashboardPage,
});

function KpiCard({
  title,
  value,
  prefix,
  positive,
  negative,
}: {
  title: string;
  value: number;
  prefix?: string;
  positive?: boolean;
  negative?: boolean;
}) {
  const colorClass =
    positive && value > 0
      ? 'text-green-600'
      : negative && value < 0
        ? 'text-red-600'
        : 'text-gray-900';

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <p className="text-sm text-gray-500">{title}</p>
      <p className={`text-3xl font-bold ${colorClass}`}>
        {prefix}{value.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
    </div>
  );
}

function DashboardPage() {
  const { dashboard, dashboardLoading, dashboardError, fetchDashboard } = useAppStore();

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (dashboardLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-500">Cargando dashboard...</p>
      </div>
    );
  }

  if (dashboardError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-600">Error al cargar: {dashboardError}</p>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="rounded-xl border bg-white p-6 text-center">
        <p className="text-gray-500">No hay datos disponibles</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-900">Dashboard</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
        <KpiCard title="Total Socios" value={dashboard.totalSocios} prefix="" />
        <KpiCard title="Recaudado (Bs)" value={dashboard.recaudado} prefix="Bs " />
        <KpiCard title="Morosos" value={dashboard.morosos} prefix="" />
        <KpiCard title="Multas Pendientes" value={dashboard.multasPendientes} prefix="Bs " />
        <KpiCard title="Egresos del Mes" value={dashboard.egresosMes} prefix="Bs " />
        <KpiCard title="Neto" value={dashboard.neto} prefix="Bs " positive negative />
      </div>
    </div>
  );
}
