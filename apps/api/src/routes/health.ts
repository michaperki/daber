import { FastifyInstance } from 'fastify';

export async function registerHealthRoute(app: FastifyInstance) {
  app.get('/health', async (_req, reply) => reply.send({ ok: true }));
}

