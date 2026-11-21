import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DEMONSTRATION_LABEL } from '../../../shared/demonstration-projects';

/** Marks a sample brief. Every demonstration listing and its page carries this label. */
export function DemonstrationProjectBadge({ className }: { className?: string }) {
  return (
    <Badge
      data-testid="demonstration-badge"
      className={cn('rounded-sm px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em]', className)}
    >
      {DEMONSTRATION_LABEL}
    </Badge>
  );
}
