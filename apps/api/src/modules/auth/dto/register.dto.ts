import { z } from 'zod';

// Keep names short and free of obvious lead-gen / phishing payloads.
// We've seen automated signup floods where `name` carried bit.ly URLs
// and Turkish "Güvenli Bonus" promo strings — these blockers remove the
// channel even if the bot still gets through. List is conservative on
// purpose; it can grow as new patterns appear.
const URL_LIKE = /(https?:\/\/|www\.|\bbit\.ly\b|\bt\.me\b|\btinyurl\b|\bcutt\.ly\b|\bshorturl\b)/i;
const TELEGRAM_HANDLE = /@[A-Za-z0-9_]{4,}/;
// Block long emoji runs (3+ in a row). One stray emoji in a name is fine.
const EMOJI_RUN = /(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]\s*){3,}/u;

const nameField = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .refine((v) => !URL_LIKE.test(v), {
    message: 'Имя не должно содержать ссылок',
  })
  .refine((v) => !TELEGRAM_HANDLE.test(v), {
    message: 'Имя не должно содержать ссылок на мессенджеры',
  })
  .refine((v) => !EMOJI_RUN.test(v), {
    message: 'Слишком много эмодзи в имени',
  })
  .optional();

export const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(256),
  name: nameField,
  locale: z.enum(['en', 'ru']).default('en'),
});

export type RegisterDto = z.infer<typeof registerSchema>;
