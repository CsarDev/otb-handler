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

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: DashboardPage });
const sociosRoute = createRoute({ getParentRoute: () => rootRoute, path: '/socios', component: SociosPage });
const aportesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/aportes', component: AportesPage });
const multasRoute = createRoute({ getParentRoute: () => rootRoute, path: '/multas', component: MultasPage });
const egresosRoute = createRoute({ getParentRoute: () => rootRoute, path: '/egresos', component: EgresosPage });
const actividadesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/actividades', component: ActividadesPage });
const asistenciaRoute = createRoute({ getParentRoute: () => rootRoute, path: '/asistencia', component: AsistenciaPage });
const configRoute = createRoute({ getParentRoute: () => rootRoute, path: '/config', component: ConfigPage });
const reportesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/reportes', component: ReportesPage });

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