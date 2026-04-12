import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import staticPlugin from '@fastify/static';
import path from 'node:path';
import { registerCalibrationRoutes } from './routes/calibration.js';
import { registerProgressRoutes } from './routes/progress.js';
import { registerHealthRoute } from './routes/health.js';
import { registerStrokesRoutes } from './routes/strokes.js';
import fs from 'node:fs';

const PORT = Number(process.env.PORT || 3000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(sensible);
  await app.register(cors, { origin: CORS_ORIGIN, credentials: false });

  await registerHealthRoute(app);
  await registerCalibrationRoutes(app);
  await registerProgressRoutes(app);
  await registerStrokesRoutes(app);

  // In production, serve the built SPA if present
  const webDist = path.resolve(process.cwd(), 'apps/web/dist');
  if (process.env.NODE_ENV === 'production' && fs.existsSync(webDist)) {
    await app.register(staticPlugin, {
      root: webDist,
      wildcard: false,
    });
    // SPA fallback
    app.get('/*', async (_req, reply) => {
      return reply.sendFile('index.html');
    });
  }

  return app;
}

buildServer()
  .then((app) => app.listen({ port: PORT, host: '0.0.0.0' }))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
