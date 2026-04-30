import { z } from 'zod';

export const oauthBridgeSchema = z.object({
  provider: z.enum(['google']),
  providerAccountId: z.string().min(1).max(256),
  email: z.string().email().max(254),
  name: z.string().min(1).max(128).optional(),
});

export type OauthBridgeDto = z.infer<typeof oauthBridgeSchema>;
