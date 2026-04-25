export const Queues = {
  EMAIL: 'email',
  GENERATION: 'generation',
} as const;

export type QueueName = (typeof Queues)[keyof typeof Queues];

export const EMAIL_QUEUE = Queues.EMAIL;
export const GENERATION_QUEUE = Queues.GENERATION;
