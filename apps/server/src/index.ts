import { serve } from '@hono/node-server';
import api from '@otb/api';
import { logger } from '@otb/logger';

const port = Number(process.env.PORT ?? 3000);

logger.info({ port }, 'Starting OTB server');

serve({
  fetch: api.fetch,
  port,
});
