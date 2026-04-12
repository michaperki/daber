import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPrisma } from '../db.js';

const CalibrationSchema = z.object({
  version: z.literal(1),
  samples: z.record(z.string(), z.array(z.string())), // letter → base64[]
  updated_at: z.string().datetime(),
});

export async function registerCalibrationRoutes(app: FastifyInstance) {
  app.get('/api/calibration/:deviceId', async (req, reply) => {
    const { deviceId } = req.params as { deviceId: string };
    const prisma = getPrisma();
    const row = await prisma.deviceCalibration.findUnique({ where: { device_id: deviceId } });
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return reply.send(row.payload);
  });

  app.put('/api/calibration/:deviceId', async (req, reply) => {
    const { deviceId } = req.params as { deviceId: string };
    const parse = CalibrationSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: 'invalid_payload' });
    const payload = parse.data;
    const prisma = getPrisma();
    await prisma.deviceCalibration.upsert({
      where: { device_id: deviceId },
      update: { payload },
      create: { device_id: deviceId, payload },
    });
    return reply.send({ ok: true, updated_at: payload.updated_at });
  });
}

