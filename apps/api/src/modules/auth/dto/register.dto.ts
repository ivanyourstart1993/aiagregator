import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(256),
  name: z.string().trim().min(1).max(120).optional(),
  locale: z.enum(['en', 'ru']).default('en'),
});

export type RegisterDto = z.infer<typeof registerSchema>;
