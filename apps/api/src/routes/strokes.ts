import { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getPrisma } from '../db.js';

const PointSchema = z.object({ x: z.number(), y: z.number(), t: z.number().optional() });
const StrokeSchema = z.array(PointSchema);
const PayloadSchema = z.object({
  version: z.literal(1),
  deviceId: z.string().min(1),
  sessionId: z.string().optional(),
  letter: z.string().min(1),
  split: z.enum(['train', 'val', 'test']).default('train'),
  strokes: z.array(StrokeSchema).min(1),
});

type StrokeSampleRow = {
  letter: string;
  strokes: unknown;
};

export async function registerStrokesRoutes(app: FastifyInstance) {
  app.get('/api/strokes/:deviceId', async (req, reply) => {
    const { deviceId } = req.params as { deviceId: string };
    const prisma = getPrisma();
    const rows = await prisma.$queryRaw<StrokeSampleRow[]>`
      SELECT letter, strokes
      FROM stroke_sample
      WHERE device_id = ${deviceId}
      ORDER BY created_at ASC
    `;
    const grouped: Record<string, Array<Array<{ x: number; y: number; t?: number }>>> = {} as any;
    for (const r of rows) {
      const letter = r.letter;
      if (!grouped[letter]) grouped[letter] = [] as any;
      grouped[letter]!.push((r.strokes as any) || []);
    }
    return reply.send({ version: 1, samples: grouped });
  });
  app.post('/api/strokes', async (req, reply) => {
    const parse = PayloadSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: 'invalid_payload' });
    const p = parse.data;
    const prisma = getPrisma();
    await prisma.$executeRaw`
      INSERT INTO stroke_sample (id, device_id, letter, split, strokes)
      VALUES (${randomUUID()}, ${p.deviceId}, ${p.letter}, ${p.split}, ${JSON.stringify(p.strokes)}::jsonb)
    `;
    return reply.send({ ok: true });
  });
}
