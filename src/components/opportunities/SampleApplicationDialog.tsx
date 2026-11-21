import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DemonstrationProjectBadge } from '@/components/opportunities/DemonstrationProjectBadge';
import { roleName, type DemonstrationProject } from '../../../shared/demonstration-projects';
import type { CreativeRole } from '../../../shared/project-board';

/**
 * Practice run of the applicant form for a demonstration project. It sends nothing: no request is made, the
 * customer is not told, and no booking, payment or message is created. The copy says so at each step.
 */
export function SampleApplicationDialog({ project, variant = 'outline', testId = 'sample-apply' }: {
  project: DemonstrationProject;
  variant?: 'outline' | 'default';
  testId?: string;
}) {
  const roles = project.roles.map((role) => role.role);
  const [open, setOpen] = useState(false);
  const [finished, setFinished] = useState(false);
  const [applyingAs, setApplyingAs] = useState<CreativeRole>(roles[0]);
  const [portfolio, setPortfolio] = useState('');
  const [available, setAvailable] = useState(false);
  const [note, setNote] = useState('');

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) setFinished(false);
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} data-testid={testId}>Preview sample application</Button>
      </DialogTrigger>
      <DialogContent data-testid="sample-application-dialog">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-3">
            <DemonstrationProjectBadge />
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-brand-red-text" data-testid="sample-not-sent">
              Sample application — not sent
            </span>
          </div>
          <DialogTitle>{project.title}</DialogTitle>
          <DialogDescription>
            This shows what an applicant sends for this brief. Nothing you enter is saved or sent, the customer is not notified, and no booking,
            payment or message is created.
          </DialogDescription>
        </DialogHeader>

        {finished ? (
          <div role="status" data-testid="sample-complete" className="flex flex-col gap-2 rounded-md border border-border-strong p-5 text-sm">
            <p className="font-semibold">Sample complete. Nothing was sent.</p>
            <p className="text-muted-foreground">
              Real interest is only sent from a live open call, by a signed-in creator. Demonstration projects cannot be booked or paid for.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="sample-role">Role you are applying for</Label>
              <Select value={applyingAs} onValueChange={(value) => setApplyingAs(value as CreativeRole)}>
                <SelectTrigger id="sample-role" className="w-full bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => <SelectItem key={role} value={role}>{roleName(role)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sample-portfolio">Portfolio link</Label>
              <Input id="sample-portfolio" value={portfolio} onChange={(e) => setPortfolio(e.target.value)} placeholder="https://" className="bg-card" />
            </div>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <Checkbox checked={available} onCheckedChange={(checked) => setAvailable(checked === true)} aria-label="Available for the shoot window and deadline" />
              <span>I am available for the shoot window and the delivery deadline.</span>
            </label>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sample-note">Note to the customer (optional)</Label>
              <Textarea id="sample-note" value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={500} className="bg-card" />
            </div>
          </div>
        )}

        <DialogFooter>
          {finished ? (
            <Button variant="outline" onClick={() => changeOpen(false)}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => changeOpen(false)}>Cancel</Button>
              <Button onClick={() => setFinished(true)} data-testid="sample-complete-button">Complete sample (nothing is sent)</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
