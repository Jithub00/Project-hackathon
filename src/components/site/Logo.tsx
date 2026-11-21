import { Link } from 'react-router';
import { cn } from '@/lib/utils';

/** The supplied Photo Shoot wordmark (transparent PNG, 727 by 190 pixels). */
export function Logo({ className, to = '/' }: { className?: string; to?: string }) {
  return (
    <Link to={to} aria-label="Photo Shoot home" className="inline-flex shrink-0 items-center rounded-sm focus-visible:outline-2">
      <img src="/brand/photoshoot-logo.png" alt="Photo Shoot" width={727} height={190} className={cn('h-9 w-auto md:h-10', className)} />
    </Link>
  );
}
