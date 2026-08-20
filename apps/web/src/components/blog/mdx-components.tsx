import type { ComponentPropsWithoutRef } from 'react';
import type { MDXComponents } from 'mdx/types';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { SignupCTA } from '@/components/blog/SignupCTA';

const linkClass =
  'font-medium text-info underline underline-offset-4 transition-opacity hover:opacity-80';

function MdxLink({ href = '', children, ...props }: ComponentPropsWithoutRef<'a'>) {
  const isInternal = href.startsWith('/') && !href.startsWith('//');
  if (isInternal) {
    return (
      <Link href={href} className={linkClass}>
        {children}
      </Link>
    );
  }
  const external = href.startsWith('http');
  return (
    <a
      href={href}
      className={linkClass}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      {...props}
    >
      {children}
    </a>
  );
}

/**
 * Element + component map for blog MDX. Styles raw markdown elements explicitly
 * (the project does not use @tailwindcss/typography) and exposes `<SignupCTA />`
 * so articles can drop the conversion block inline.
 */
export const mdxComponents: MDXComponents = {
  SignupCTA,
  a: MdxLink,
  h1: (props) => (
    <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground" {...props} />
  ),
  h2: (props) => (
    <h2
      {...props}
      className={cn(
        'mt-10 scroll-mt-24 border-b border-border/50 pb-2 text-2xl font-semibold tracking-tight text-foreground',
        props.className,
      )}
    />
  ),
  h3: (props) => (
    <h3
      {...props}
      className={cn('mt-8 scroll-mt-24 text-lg font-semibold text-foreground', props.className)}
    />
  ),
  p: (props) => <p className="my-4 leading-7 text-foreground/90" {...props} />,
  ul: (props) => (
    <ul
      className="my-4 ml-5 list-disc space-y-2 text-foreground/90 marker:text-muted-foreground"
      {...props}
    />
  ),
  ol: (props) => (
    <ol
      className="my-4 ml-5 list-decimal space-y-2 text-foreground/90 marker:text-muted-foreground"
      {...props}
    />
  ),
  li: (props) => <li className="leading-7" {...props} />,
  strong: (props) => <strong className="font-semibold text-foreground" {...props} />,
  blockquote: (props) => (
    <blockquote
      className="my-6 border-l-2 border-info/50 pl-4 italic text-muted-foreground"
      {...props}
    />
  ),
  hr: () => <hr className="my-10 border-border/60" />,
  code: (props) => (
    <code
      {...props}
      className={cn(
        'rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground',
        props.className,
      )}
    />
  ),
  pre: (props) => (
    <pre
      {...props}
      className={cn(
        'my-6 overflow-x-auto rounded-md border border-border/60 bg-muted p-4 text-xs leading-relaxed',
        '[&_code]:bg-transparent [&_code]:p-0 [&_code]:text-xs',
        props.className,
      )}
    />
  ),
  table: (props) => (
    <div className="my-6 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  thead: (props) => <thead className="border-b border-border" {...props} />,
  th: (props) => (
    <th className="px-3 py-2 text-left font-semibold text-foreground" {...props} />
  ),
  td: (props) => (
    <td className="border-b border-border/40 px-3 py-2 align-top text-foreground/90" {...props} />
  ),
  // eslint-disable-next-line @next/next/no-img-element
  img: ({ alt, ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ''} className="my-6 rounded-lg border border-border/60" {...props} />
  ),
};
