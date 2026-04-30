import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

type Tone = 'default' | 'success' | 'warning' | 'info';

interface Props {
  title: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: Tone;
  href?: string;
  ctaLabel?: string;
}

const TONE_DOT: Record<Tone, string> = {
  default: 'bg-muted-foreground/40',
  success: 'bg-success',
  warning: 'bg-warning',
  info: 'bg-info',
};

const TONE_TEXT: Record<Tone, string> = {
  default: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-info',
};

export function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  href,
  ctaLabel,
}: Props) {
  const card = (
    <Card
      className={cn(
        'group relative overflow-hidden border-border/60 bg-card transition-colors',
        href && 'hover:border-border hover:bg-accent/40',
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
        <div className="flex items-center gap-2">
          <span className={cn('h-1.5 w-1.5 rounded-full', TONE_DOT[tone])} aria-hidden />
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </span>
        </div>
        {Icon ? <Icon className="h-4 w-4 text-muted-foreground/70" /> : null}
      </CardHeader>
      <CardContent className="pt-0">
        <div className={cn('text-3xl font-semibold tracking-tight', TONE_TEXT[tone])}>
          {value}
        </div>
        {hint ? (
          <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            {hint}
            {ctaLabel && href ? (
              <>
                <span className="px-1 text-muted-foreground/40">·</span>
                <span className="font-medium text-foreground/80 group-hover:text-foreground">
                  {ctaLabel}
                </span>
                <ArrowUpRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </>
            ) : null}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
  if (href) {
    return (
      <Link href={href} className="block">
        {card}
      </Link>
    );
  }
  return card;
}
