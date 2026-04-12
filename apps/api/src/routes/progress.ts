import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPrisma } from '../db.js';

const ProgressSchema = z.object({
  version: z.literal(1),
  prefs: z.object({
    mode: z.enum(['knn', 'centroid', 'hybrid']),
    k: z.number().int().min(1).max(99),
    augment: z.boolean(),
    samples_per_letter: z.number().int().min(0).max(100),
    practice_threshold: z.number().min(0).max(1),
    pilot_wizard_done: z.boolean(),
  }),
  practice_stats: z.object({ correct: z.number().int(), total: z.number().int() }),
  vocab_stats: z.object({
    correct_letters: z.number().int(),
    total_letters: z.number().int(),
    words_completed: z.number().int(),
  }),
  seen_words: z.record(z.string(), z.object({ count: z.number().int(), last_seen_at: z.string() })),
  updated_at: z.string().datetime(),
});

export async function registerProgressRoutes(app: FastifyInstance) {
  app.get('/api/progress/:deviceId', async (req, reply) => {
    const { deviceId } = req.params as { deviceId: string };
    const prisma = getPrisma();
    const row = await prisma.deviceProgress.findUnique({ where: { device_id: deviceId } });
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return reply.send(row.payload);
  });

  app.put('/api/progress/:deviceId', async (req, reply) => {
    const { deviceId } = req.params as { deviceId: string };
    const parse = ProgressSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: 'invalid_payload' });
    const payload = parse.data;
    const prisma = getPrisma();
    await prisma.deviceProgress.upsert({
      where: { device_id: deviceId },
      update: { payload },
      create: { device_id: deviceId, payload },
    });
    return reply.send({ ok: true, updated_at: payload.updated_at });
  });
}
