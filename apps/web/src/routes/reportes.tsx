import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/reportes')({
  component: ReportesPage,
});

function ReportesPage() {
  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-gray-900">Reportes</h2>
      <div className="rounded-xl border bg-white p-12 text-center shadow-sm">
        <p className="text-gray-500">Módulo de reportes en desarrollo</p>
      </div>
    </div>
  );
}
