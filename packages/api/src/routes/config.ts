import { Hono } from 'hono';
import { db, schema } from '@otb/db';
import { eq } from 'drizzle-orm';
import { aporteDefActivoDefault } from '../lib/aportes';

const configRouter = new Hono();
const MODULE_NAME = 'otb-core';

function getOtbConfig(): Record<string, unknown> | null {
  const row = db
    .select()
    .from(schema.modulesConfig)
    .where(eq(schema.modulesConfig.moduleName, MODULE_NAME))
    .get();

  return row ? (JSON.parse(row.config ?? '{}') as Record<string, unknown>) : null;
}

configRouter.get('/', (c) => {
  const config = getOtbConfig();
  if (!config) return c.json({ error: 'OTB not configured' }, 404);

  // D11: `aporteMensualBase` se deriva de la primera definición de aporte activa
  // (`aporteDefActivoDefault().monto`); el valor crudo guardado queda como legacy.
  const def = aporteDefActivoDefault();
  return c.json({
    ...config,
    aporteMensualBase: def?.monto ?? config.aporteMensualBase,
  });
});

configRouter.put('/', async (c) => {
  const body = await c.req.json();
  const existing = getOtbConfig();
  const merged = { ...(existing ?? {}), ...body } as Record<string, unknown>;

  const row = db
    .select()
    .from(schema.modulesConfig)
    .where(eq(schema.modulesConfig.moduleName, MODULE_NAME))
    .get();

  if (row) {
    db.update(schema.modulesConfig)
      .set({ config: JSON.stringify(merged) })
      .where(eq(schema.modulesConfig.id, row.id))
      .run();
  } else {
    db.insert(schema.modulesConfig)
      .values({
        id: crypto.randomUUID(),
        moduleName: MODULE_NAME,
        enabled: true,
        config: JSON.stringify(merged),
      })
      .run();
  }

  return c.json(merged);
});

configRouter.get('/initialized', (c) => {
  const config = getOtbConfig();
  const initialized = !!(config?.nombreOTB && config?.gestionActual && config?.aporteMensualBase);
  return c.json({ initialized, config });
});

export default configRouter;
