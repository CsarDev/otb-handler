import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';

import sociosRouter from './routes/socios';
import aportesRouter from './routes/aportes';
import multasRouter from './routes/multas';
import egresosRouter from './routes/egresos';
import asistenciaRouter from './routes/asistencia';
import actividadesRouter from './routes/actividades';
import dashboardRouter from './routes/dashboard';
import configRouter from './routes/config';
import tiposActividadRouter from './routes/tipos-actividad';

const api = new Hono();

api.use('*', cors());
api.use('*', honoLogger());

api.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

api.route('/api/socios', sociosRouter);
api.route('/api/aportes', aportesRouter);
api.route('/api/multas', multasRouter);
api.route('/api/egresos', egresosRouter);
api.route('/api/asistencia', asistenciaRouter);
api.route('/api/actividades', actividadesRouter);
api.route('/api/dashboard', dashboardRouter);
api.route('/api/tipos-actividad', tiposActividadRouter);
api.route('/api/config', configRouter);

export default api;
export type ApiApp = typeof api;
