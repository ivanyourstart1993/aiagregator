export const Queues = {
  EMAIL: 'email',
  GENERATION: 'generation',
  CALLBACK: 'callback',
  GENERATION_DLQ: 'generation-dead-letter',
  CALLBACK_DLQ: 'callback-dead-letter',
} as const;

export type QueueName = (typeof Queues)[keyof typeof Queues];

export const EMAIL_QUEUE = Queues.EMAIL;
export const GENERATION_QUEUE = Queues.GENERATION;
export const CALLBACK_QUEUE = Queues.CALLBACK;
export const GENERATION_DLQ = Queues.GENERATION_DLQ;
export const CALLBACK_DLQ = Queues.CALLBACK_DLQ;
