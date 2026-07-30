import { Route as rootRoute } from './routes/__root'
import { Route as IndexRoute } from './routes/index'
import { Route as SociosRoute } from './routes/socios'
import { Route as AportesRoute } from './routes/aportes'
import { Route as MultasRoute } from './routes/multas'
import { Route as EgresosRoute } from './routes/egresos'
import { Route as ActividadesRoute } from './routes/actividades'
import { Route as AsistenciaRoute } from './routes/asistencia'
import { Route as ConfigRoute } from './routes/config'
import { Route as ReportesRoute } from './routes/reportes'

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': { parentRoute: typeof rootRoute }
    '/socios': { parentRoute: typeof rootRoute }
    '/aportes': { parentRoute: typeof rootRoute }
    '/multas': { parentRoute: typeof rootRoute }
    '/egresos': { parentRoute: typeof rootRoute }
    '/actividades': { parentRoute: typeof rootRoute }
    '/asistencia': { parentRoute: typeof rootRoute }
    '/config': { parentRoute: typeof rootRoute }
    '/reportes': { parentRoute: typeof rootRoute }
  }
}

export const routeTree = rootRoute.addChildren([
  IndexRoute,
  SociosRoute,
  AportesRoute,
  MultasRoute,
  EgresosRoute,
  ActividadesRoute,
  AsistenciaRoute,
  ConfigRoute,
  ReportesRoute,
])
