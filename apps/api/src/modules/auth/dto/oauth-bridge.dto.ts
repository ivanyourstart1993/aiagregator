import { z } from 'zod';

// The bridge is now id_token-driven: the Next.js layer hands the verified
// Google id_token straight through, the API re-verifies its signature and
// claims, and trusts only the resulting payload. The legacy fields are not
// accepted — sending them in addition to idToken is harmless but ignored.
export const oauthBridgeSchema = z.object({
  provider: z.literal('google'),
  idToken: z.string().min(32).max(8192),
});

export type OauthBridgeDto = z.infer<typeof oauthBridgeSchema>;
