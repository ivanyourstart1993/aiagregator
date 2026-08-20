import { ArrowRight, Sparkles } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SignupCTAProps {
  /** Headline. Tailor per article for a stronger, contextual pitch. */
  title?: string;
  description?: string;
  primaryLabel?: string;
  primaryHref?: string;
  /** Pass an empty string to hide the secondary action. */
  secondaryLabel?: string;
  secondaryHref?: string;
  className?: string;
}

/**
 * In-text conversion block, designed to be dropped straight into article MDX
 * (`<SignupCTA />`) or rendered automatically at the end of every post. Pulls
 * the reader toward signup / the playground without leaving the page.
 */
export function SignupCTA({
  title = 'Start building with one API key',
  description = 'Get instant access to Nano Banana, Kling, Veo, Seedance and dozens more models behind one stable API — prepaid USD billing, no per-provider accounts. Sign up and get $5 in free credit to start.',
  primaryLabel = 'Create your free API key',
  primaryHref = '/signup',
  secondaryLabel = 'Try the playground',
  secondaryHref = '/playground',
  className,
}: SignupCTAProps) {
  return (
    <aside
      className={cn(
        'my-8 overflow-hidden rounded-xl border border-info/30 bg-info/[0.07] p-5 sm:p-6',
        className,
      )}
    >
      <div className="flex items-start gap-4">
        <span className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-info/15 text-info sm:flex">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <h3 className="text-base font-semibold text-foreground sm:text-lg">{title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm">
              <Link href={primaryHref}>
                {primaryLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            {secondaryLabel ? (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
              >
                <Link href={secondaryHref}>{secondaryLabel}</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  );
}
