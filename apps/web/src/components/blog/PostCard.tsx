import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { formatDate, type Post } from '@/lib/blog';
import { CoverImage } from './CoverImage';

export function PostCard({ post }: { post: Post }) {
  const { title, description, date, tags } = post.frontmatter;
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-border/60 bg-card/60 transition-colors hover:border-border hover:bg-card"
    >
      <div className="aspect-[16/9] overflow-hidden border-b border-border/50 bg-muted transition-transform duration-300 group-hover:scale-[1.02]">
        <CoverImage post={post} />
      </div>
      <div className="flex flex-1 flex-col p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <time dateTime={date}>{formatDate(date)}</time>
        <span aria-hidden>·</span>
        <span>{post.readingTimeMinutes} min read</span>
      </div>
      <h2 className="mt-3 text-lg font-semibold tracking-tight text-foreground transition-colors group-hover:text-info">
        {title}
      </h2>
      <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {tags && tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="secondary" className="font-normal">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}
      </div>
    </Link>
  );
}
