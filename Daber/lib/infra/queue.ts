export type Job = { type: 'generate_drills'; payload: { userId?: string | null } };

export interface JobQueue {
  enqueue(job: Job): Promise<void>;
}

class MemoryQueue implements JobQueue {
  private handler: ((job: Job) => Promise<void>) | null = null;
  setHandler(h: (job: Job) => Promise<void>) { this.handler = h; }
  async enqueue(job: Job): Promise<void> {
    // Fire-and-forget immediate processing in-process
    if (this.handler) {
      // Do not await to avoid blocking request
      this.handler(job).catch(() => {});
    }
  }
}

let memoryQueue: MemoryQueue | null = null;

export function getQueue(): { queue: JobQueue; register: (h: (job: Job) => Promise<void>) => void } {
  const backend = (process.env.GEN_QUEUE_BACKEND || 'memory').toLowerCase();
  if (backend === 'redis') {
    // Placeholder: Redis backend not wired yet; fall back to memory with a warning
    if (!memoryQueue) memoryQueue = new MemoryQueue();
    return {
      queue: memoryQueue,
      register: (h) => memoryQueue!.setHandler(h)
    };
  }
  if (!memoryQueue) memoryQueue = new MemoryQueue();
  return {
    queue: memoryQueue,
    register: (h) => memoryQueue!.setHandler(h)
  };
}

export async function scheduleGenerationJob(payload: { userId?: string | null }, handler: (job: Job) => Promise<void>): Promise<void> {
  const { queue, register } = getQueue();
  register(handler);
  await queue.enqueue({ type: 'generate_drills', payload });
}

