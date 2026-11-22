import type { ReactNode } from 'react';

/** Says that a creators page is showing the example data bundled with the site, and why. */
export function SampleNotice({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <div role="status" data-testid={testId} className="flex flex-col gap-2 rounded-lg border border-dashed border-border-strong p-5 text-sm leading-relaxed">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-red-text">Example data</p>
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}
