// Mustache-style {{var}} substitution. Intentionally no logic, no helpers —
// templates are short outreach text, not a templating language.
//
// Special vars supported:
//   {{name}}, {{ownerName}}, {{ownerEmail}}, {{type}}, {{url}}, {{telegramUsername}},
//   {{topic}} (alias for type, lower-cased + readable), {{score}}
//
// Unknown vars are left literal (so a typo doesn't silently send "Hi !").

import type { Lead } from '@aiagg/db';

type LeadLike = Pick<
  Lead,
  | 'name'
  | 'ownerName'
  | 'ownerEmail'
  | 'telegramUsername'
  | 'url'
  | 'type'
  | 'score'
> & { metadata?: unknown };

const TYPE_LABEL: Record<string, string> = {
  TELEGRAM_CHANNEL: 'telegram channel',
  MOBILE_APP_IOS: 'iOS app',
  MOBILE_APP_ANDROID: 'Android app',
  WEBSITE: 'website',
  OTHER: 'project',
};

function buildVars(lead: LeadLike): Record<string, string> {
  const tg = lead.telegramUsername ?? '';
  return {
    name: lead.name ?? '',
    ownerName: lead.ownerName ?? lead.name ?? 'there',
    ownerEmail: lead.ownerEmail ?? '',
    telegramUsername: tg ? `@${tg.replace(/^@/, '')}` : '',
    url: lead.url ?? '',
    type: TYPE_LABEL[lead.type] ?? String(lead.type).toLowerCase(),
    topic: TYPE_LABEL[lead.type] ?? String(lead.type).toLowerCase(),
    score: String(lead.score ?? 0),
  };
}

export function renderTemplate(template: string, lead: LeadLike): string {
  const vars = buildVars(lead);
  return template.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (full, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : full;
  });
}
