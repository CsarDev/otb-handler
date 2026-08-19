import { Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/auth.store';

const navItems = [
  { to: '/', label: 'Dashboard' } as const,
  { to: '/socios', label: 'Socios' } as const,
  { to: '/actividades', label: 'Actividades' } as const,
  { to: '/asistencia', label: 'Asistencia' } as const,
  { to: '/aportes', label: 'Aportes' } as const,
  { to: '/multas', label: 'Multas' } as const,
  { to: '/egresos', label: 'Egresos' } as const,
  { to: '/reportes', label: 'Reportes' } as const,
  { to: '/config', label: 'Config' } as const,
];

function NavLink({ to, label, onClick }: { to: string; label: string; onClick?: () => void }) {
  const location = useLocation();
  const active = location.pathname === to;

  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-100 text-blue-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      {label}
    </Link>
  );
}

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isAuthenticated, user, logout, loadUser, refresh } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  // Refresh session on boot: the persisted store can be stale (permissions live
  // inside the JWT and are minted at login), so rotate the token FIRST to get a
  // JWT with current permissions, then reload the user object from /auth/me.
  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      await refresh();
      await loadUser();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redirect to login if not authenticated (except for auth pages)
  useEffect(() => {
    const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password'];
    const isPublicPath = publicPaths.some((p) => location.pathname.startsWith(p));

    if (!isAuthenticated && !isPublicPath) {
      navigate({ to: '/login' });
    }
  }, [isAuthenticated, location.pathname, navigate]);

  const handleLogout = async () => {
    await logout();
    navigate({ to: '/login' });
  };

  // Don't render layout for public pages
  const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password'];
  const isPublicPath = publicPaths.some((p) => location.pathname.startsWith(p));

  if (isPublicPath) {
    return <Outlet />;
  }

  // Show loading if not authenticated yet
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r bg-white transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b px-6">
          <h1 className="text-lg font-bold text-gray-900">ControlOTB</h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-gray-400 hover:text-gray-600 lg:hidden"
          >
            ✕
          </button>
        </div>
        <nav className="flex flex-col gap-1 p-4">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} label={item.label} onClick={() => setSidebarOpen(false)} />
          ))}
        </nav>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-white px-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-gray-500 hover:text-gray-700 lg:hidden"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h2 className="text-sm font-medium text-gray-500">Sistema de Gestión OTB</h2>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.name}</span>
            <button
              onClick={handleLogout}
              className="rounded-md bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100"
            >
              Cerrar sesión
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
