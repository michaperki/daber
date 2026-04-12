import { FastifyInstance } from 'fastify';
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

function flattenStrokes(strokes: Array<Array<{ x: number; y: number; t?: number }>>): number[][] {
  const pts: number[][] = [];
  strokes.forEach((s, sid) => {
    s.forEach((p) => pts.push([p.x, p.y, p.t ?? 0, sid]));
  });
  return pts;
}

export async function registerStrokesRoutes(app: FastifyInstance) {
  app.get('/api/strokes/:deviceId', async (req, reply) => {
    const { deviceId } = req.params as { deviceId: string };
    const prisma = getPrisma();
    const rows = await prisma.strokeSample.findMany({ where: { device_id: deviceId }, orderBy: { created_at: 'asc' } });
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
    await prisma.strokeSample.create({
      data: {
        device_id: p.deviceId,
        letter: p.letter,
        split: p.split,
        strokes: p.strokes,
      },
    });
    return reply.send({ ok: true });
  });
}
