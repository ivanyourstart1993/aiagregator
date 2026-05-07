export const Queues = {
  EMAIL: 'email',
  GENERATION: 'generation',
  CALLBACK: 'callback',
  EXPORTS: 'exports',
  GENERATION_DLQ: 'generation-dead-letter',
  CALLBACK_DLQ: 'callback-dead-letter',
  CRM_DISCOVERY: 'crm-discovery',
  CRM_ENRICHMENT: 'crm-enrichment',
  CRM_OUTREACH: 'crm-outreach',
  CRM_EMAIL_OUTREACH: 'crm-email-outreach',
} as const;

export type QueueName = (typeof Queues)[keyof typeof Queues];

export const EMAIL_QUEUE = Queues.EMAIL;
export const GENERATION_QUEUE = Queues.GENERATION;
export const CALLBACK_QUEUE = Queues.CALLBACK;
export const EXPORTS_QUEUE = Queues.EXPORTS;
export const GENERATION_DLQ = Queues.GENERATION_DLQ;
export const CALLBACK_DLQ = Queues.CALLBACK_DLQ;
export const CRM_DISCOVERY_QUEUE = Queues.CRM_DISCOVERY;
export const CRM_ENRICHMENT_QUEUE = Queues.CRM_ENRICHMENT;
export const CRM_OUTREACH_QUEUE = Queues.CRM_OUTREACH;
export const CRM_EMAIL_OUTREACH_QUEUE = Queues.CRM_EMAIL_OUTREACH;
