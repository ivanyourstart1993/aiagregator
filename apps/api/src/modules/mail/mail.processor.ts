/**
 * NOTE: BullMQ processor lives in apps/worker once that app is implemented in
 * Этап 1 Чанк 4 wiring. For Stage 1 the API enqueues jobs but also has a sync
 * fallback path; this file is a placeholder declaring the planned signature so
 * the worker app can pull it in via shared types if needed.
 */
export interface EmailJobData {
  template: 'verify-email';
  to: string;
  props: { name: string; verifyUrl: string };
}
