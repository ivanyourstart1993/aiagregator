import { z } from 'zod';

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(254),
});

export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(256),
  password: z.string().min(8).max(256),
});

export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
