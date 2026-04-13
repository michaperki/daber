import type { FastifyInstance } from 'fastify';
import { VERSION } from '../version.js';

export async function registerVersionRoute(app: FastifyInstance) {
  app.get('/version', async (_req, reply) => {
    return reply.send({ version: VERSION });
  });
}

