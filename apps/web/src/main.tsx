import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  RouterProvider,
  createRouter,
  createRootRouteWithContext,
  createRoute,
} from '@tanstack/react-router';
import './styles.css';

// ----- Layout (root) -----
import { Layout } from './routes/__root';

const rootRoute = createRootRouteWithContext<{}>()({
  component: Layout,
});

// ----- Pages -----
import DashboardPage from './routes/index';
import SociosPage from './routes/socios';
import AportesPage from './routes/aportes';
import MultasPage from './routes/multas';
import EgresosPage from './routes/egresos';
import ActividadesPage from './routes/actividades';
import AsistenciaPage from './routes/asistencia';
import ConfigPage from './routes/config';
import ReportesPage from './routes/reportes';
import { LoginPage } from './routes/login';
import { RegisterPage } from './routes/register';
import { ForgotPasswordPage } from './routes/forgot-password';
import { ResetPasswordPage } from './routes/reset-password';
import { UsersPage } from './routes/users';

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: DashboardPage });
const sociosRoute = createRoute({ getParentRoute: () => rootRoute, path: '/socios', component: SociosPage });
const aportesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/aportes', component: AportesPage });
const multasRoute = createRoute({ getParentRoute: () => rootRoute, path: '/multas', component: MultasPage });
const egresosRoute = createRoute({ getParentRoute: () => rootRoute, path: '/egresos', component: EgresosPage });
const actividadesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/actividades', component: ActividadesPage });
const asistenciaRoute = createRoute({ getParentRoute: () => rootRoute, path: '/asistencia', component: AsistenciaPage });
const configRoute = createRoute({ getParentRoute: () => rootRoute, path: '/config', component: ConfigPage });
const reportesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/reportes', component: ReportesPage });
const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: LoginPage });
const registerRoute = createRoute({ getParentRoute: () => rootRoute, path: '/register', component: RegisterPage });
const forgotPasswordRoute = createRoute({ getParentRoute: () => rootRoute, path: '/forgot-password', component: ForgotPasswordPage });
const resetPasswordRoute = createRoute({ getParentRoute: () => rootRoute, path: '/reset-password', component: ResetPasswordPage });
const usersRoute = createRoute({ getParentRoute: () => rootRoute, path: '/users', component: UsersPage });

const routeTree = rootRoute.addChildren([
  indexRoute,
  sociosRoute,
  aportesRoute,
  multasRoute,
  egresosRoute,
  actividadesRoute,
  asistenciaRoute,
  configRoute,
  reportesRoute,
  loginRoute,
  registerRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
  usersRoute,
]);

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);