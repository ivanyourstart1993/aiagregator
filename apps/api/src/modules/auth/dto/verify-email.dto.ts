import { z } from 'zod';

export const verifyEmailSchema = z.object({
  token: z.string().min(8).max(128),
});

export type VerifyEmailDto = z.infer<typeof verifyEmailSchema>;

export const resendVerificationSchema = z.object({
  email: z.string().email().max(254),
});

export type ResendVerificationDto = z.infer<typeof resendVerificationSchema>;
