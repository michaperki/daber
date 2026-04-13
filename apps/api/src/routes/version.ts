import type { FastifyInstance } from 'fastify';

export async function registerVersionRoute(app: FastifyInstance) {
  app.get('/version', async (_req, reply) => {
    const rel = process.env.HEROKU_RELEASE_VERSION || '';
    let version = '0';
    if (/^v\d+$/i.test(rel)) version = rel.slice(1);
    else if (/^\d+$/.test(rel)) version = rel;
    return reply.send({ version });
  });
}
