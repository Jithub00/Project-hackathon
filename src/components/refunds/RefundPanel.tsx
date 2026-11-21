import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { ErrorAlert } from '@/components/site/ui-bits';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatBookingTime } from '../../../shared/cancellation';
import { formatUsdExact } from '../../../shared/money';
import { CANCELLATION_SUMMARY, QUALITY_SUMMARY, REFUND_POLICY_VERSION, TERMS_VERSION } from '../../../shared/policy';
import { NOT_DELIVERED_REQUEST_STATUSES, QUALITY_REQUEST_STATUSES } from '../../../shared/refund-rules';
import type { CancellationPreview, ProjectDetail, RefundRequestView } from '../../../shared/types';

interface RefundPanelProps {
  project: ProjectDetail;
  viewerIsCustomer: boolean;
  canCancel: boolean;
  onChanged: (message: string) => void;
  setError: (message: string | null) => void;
}

/** A booking time in Los Angeles time, from an ISO instant the server sent. */
function laTime(iso: string | null): string | null {
  return iso ? formatBookingTime(Date.parse(iso)) : null;
}

export function cancellationOutcomeText(c: CancellationPreview): string {
  switch (c.outcome) {
    case 'no_payment':
      return 'Nothing has been paid toward this booking, so cancelling creates no refund.';
    case 'full_refund_guarantee':
      return `The 72-hour cancellation guarantee applies. Cancelling now refunds a full ${formatUsdExact(c.paidCents)}, which is 100% of what you paid, including the deposit and the customer service fee.`;
    case 'under_review':
      return 'Cancelling now is less than 72 hours before the scheduled start, so the 72-hour guarantee does not apply. A Photo Shoot reviewer would decide any refund in writing. No amount is promised for this case.';
    case 'unknown_start':
      return 'The agreed brief has no usable start time, so the 72-hour deadline cannot be calculated. A Photo Shoot reviewer will decide any refund.';
  }
}

export function RefundPanel({ project, viewerIsCustomer, canCancel, onChanged, setError }: RefundPanelProps) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const outcome = project.cancellation;
  const showCancel = viewerIsCustomer && canCancel;
  const canRequest = viewerIsCustomer && NOT_DELIVERED_REQUEST_STATUSES.includes(project.status);

  return (
    <section className="flex flex-col gap-5 rounded-lg border border-border bg-card p-6 text-sm leading-relaxed" aria-labelledby="refunds-title" data-testid="refund-panel">
      <div className="flex flex-col gap-3">
        <h3 id="refunds-title" className="text-sm font-semibold uppercase tracking-[0.12em]">Refund and cancellation</h3>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">Quality and delivery guarantee.</span> {QUALITY_SUMMARY}
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">72-hour cancellation guarantee.</span> {CANCELLATION_SUMMARY}
        </p>
        <Link to="/policies/refund-and-cancellation" className="underline underline-offset-4">
          Read the Refund and Cancellation Policy (version {REFUND_POLICY_VERSION})
        </Link>
      </div>

      {viewerIsCustomer && outcome ? (
        <div className="flex flex-col gap-2 border-t border-border pt-5">
          <p data-testid="refund-preview">{cancellationOutcomeText(outcome)}</p>
          {outcome.deadline ? (
            <p className="text-muted-foreground" data-testid="cancellation-deadline">
              72-hour deadline: <span className="text-foreground">{laTime(outcome.deadline)}</span> (Los Angeles time).
            </p>
          ) : null}
          {outcome.scheduledStart ? (
            <p className="text-muted-foreground">Scheduled start: {laTime(outcome.scheduledStart)} (Los Angeles time).</p>
          ) : null}
          {showCancel ? (
            <div>
              <Button variant="outline" onClick={() => setCancelOpen(true)} data-testid="open-cancel">Cancel project</Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {!viewerIsCustomer ? (
        <p className="border-t border-border pt-5 text-muted-foreground">
          A customer cancellation is covered by the 72-hour guarantee above. If a creator cancels a confirmed booking, the booking closes and a Photo Shoot reviewer decides any refund in writing. The policy does not yet set a fixed rule for creator cancellations.
        </p>
      ) : null}

      {project.refundRequests.length > 0 ? (
        <div className="flex flex-col gap-4 border-t border-border pt-5" data-testid="refund-requests">
          <h4 className="text-xs font-semibold uppercase tracking-[0.12em]">Requests</h4>
          {project.refundRequests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              onChanged={onChanged}
              setError={setError}
            />
          ))}
        </div>
      ) : null}

      {canRequest ? (
        <div className="border-t border-border pt-5">
          <Button variant="outline" onClick={() => setRequestOpen(true)} data-testid="open-refund-request">Request a refund</Button>
        </div>
      ) : null}

      <BookingRecord project={project} />

      {showCancel ? (
        <CancelDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          project={project}
          onDone={(message) => {
            setCancelOpen(false);
            onChanged(message);
          }}
        />
      ) : null}
      {canRequest ? (
        <RequestDialog
          open={requestOpen}
          onOpenChange={setRequestOpen}
          project={project}
          onCancelInstead={() => {
            setRequestOpen(false);
            setCancelOpen(true);
          }}
          onDone={(message) => {
            setRequestOpen(false);
            onChanged(message);
          }}
          setError={setError}
        />
      ) : null}
    </section>
  );
}

function BookingRecord({ project }: { project: ProjectDetail }) {
  const booking = project.booking;
  if (!booking) {
    return project.paidCents > 0 ? (
      <p className="border-t border-border pt-5 text-muted-foreground" data-testid="no-booking-record">
        This booking has no booking record. It was made before the current policy record was kept.
      </p>
    ) : null;
  }
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-5" data-testid="booking-record">
      <h4 className="text-xs font-semibold uppercase tracking-[0.12em]">Booking record</h4>
      <p className="text-muted-foreground">
        Accepted at checkout: Refund and Cancellation Policy version {booking.policyVersion}, Terms and Conditions version {booking.termsVersion}
        {booking.acceptedAt ? `, on ${formatBookingTime(Date.parse(booking.acceptedAt))}` : ''}.{' '}
        <Link to={`/policies/refund-and-cancellation?version=${booking.policyVersion}`} className="underline underline-offset-4">View that version</Link>
      </p>
      <p className="text-muted-foreground">Booked {formatBookingTime(Date.parse(booking.bookedAt))}. Paid toward the booking: {formatUsdExact(booking.paidCents)}.</p>
      <ul className="flex flex-col gap-2">
        {booking.members.map((member) => (
          <li key={member.userId} className="text-muted-foreground">
            <span className="font-semibold text-foreground">{member.name}</span> · {member.packageName} · {formatUsdExact(member.priceCents)} ·{' '}
            {member.portfolio.length} portfolio item{member.portfolio.length === 1 ? '' : 's'} recorded at booking
          </li>
        ))}
      </ul>
    </div>
  );
}

function RequestCard({ request, onChanged, setError }: { request: RefundRequestView; onChanged: (message: string) => void; setError: (m: string | null) => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const label = request.reason === 'cancellation' ? 'Cancellation' : request.reason === 'quality' ? 'Quality of delivered work' : 'Agreed work not delivered';

  const act = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setNote('');
      onChanged(message);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="flex flex-col gap-3 rounded-md border border-white/15 bg-surface-raised p-4" data-testid="refund-request" data-status={request.status}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="font-semibold">{label}</p>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-red-text" data-testid="refund-status">{request.statusLabel}</p>
      </div>
      <p className="text-muted-foreground">{request.statusExplanation}</p>
      <dl className="grid gap-2 text-xs sm:grid-cols-3">
        {request.requestedCents !== null ? (
          <div><dt className="uppercase tracking-[0.12em] text-muted-foreground">Amount paid toward this</dt><dd className="mt-1 font-semibold tabular-nums">{formatUsdExact(request.requestedCents)}</dd></div>
        ) : null}
        {request.approvedCents !== null ? (
          <div><dt className="uppercase tracking-[0.12em] text-muted-foreground">Approved</dt><dd className="mt-1 font-semibold tabular-nums" data-testid="refund-approved">{formatUsdExact(request.approvedCents)}</dd></div>
        ) : null}
        <div><dt className="uppercase tracking-[0.12em] text-muted-foreground">Confirmed by the provider</dt><dd className="mt-1 font-semibold tabular-nums">{formatUsdExact(request.refundedCents)}</dd></div>
      </dl>
      {request.reason === 'cancellation' && request.cancelledAt ? (
        <p className="text-xs text-muted-foreground">
          Cancellation recorded {formatBookingTime(Date.parse(request.cancelledAt))} (Los Angeles time).{' '}
          {request.qualifies72h === true ? 'It was at least 72 hours before the scheduled start.' : request.qualifies72h === false ? 'It was less than 72 hours before the scheduled start.' : ''}
        </p>
      ) : null}
      {request.description ? <p className="whitespace-pre-line text-muted-foreground">{request.description}</p> : null}
      {request.evidence.portfolio.length + request.evidence.deliveries.length + request.evidence.messages.length > 0 ? (
        <div className="text-xs text-muted-foreground">
          <p className="uppercase tracking-[0.12em]">Evidence included</p>
          <ul className="mt-1 flex flex-col gap-1">
            {request.evidence.portfolio.map((item) => <li key={item.id}>Portfolio: {item.title}</li>)}
            {request.evidence.deliveries.map((file) => <li key={file.id}>Delivered file: {file.fileName}</li>)}
            {request.evidence.messages.map((message) => <li key={message.id}>Message from {message.authorName}: “{message.body.slice(0, 140)}”</li>)}
          </ul>
        </div>
      ) : null}
      {request.decision ? (
        <p className="border-t border-border pt-3 text-sm" data-testid="refund-decision">
          <span className="font-semibold">Decision:</span> {request.decision.note}{' '}
          <span className="text-xs text-muted-foreground">({request.decision.decidedBy === 'policy' ? 'applied by policy' : 'Photo Shoot reviewer'})</span>
        </p>
      ) : null}
      {request.notes.length > 0 ? (
        <ul className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
          {request.notes.map((n) => (
            <li key={n.id}><span className="font-semibold">{n.authorName}</span> <span className="text-xs text-muted-foreground">({n.authorRole})</span>: {n.body}</li>
          ))}
        </ul>
      ) : null}
      {request.viewer.canAddNote ? (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <Label htmlFor={`note-${request.id}`}>Add a response or evidence</Label>
          <Textarea id={`note-${request.id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="bg-background" maxLength={2000} />
          <div>
            <Button variant="outline" size="sm" disabled={busy || note.trim().length < 5} onClick={() => act(() => api.post(`/api/refund-requests/${request.id}/notes`, { body: note.trim() }), 'Your response has been added.')}>
              Add response
            </Button>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {request.viewer.canWithdraw ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => act(() => api.post(`/api/refund-requests/${request.id}/withdraw`), 'The request has been withdrawn.')} data-testid="withdraw-request">
            Withdraw request
          </Button>
        ) : null}
        {request.viewer.canRetry ? (
          <Button size="sm" disabled={busy} onClick={() => act(() => api.post(`/api/refund-requests/${request.id}/retry`), 'We tried to send the refund again.')} data-testid="retry-refund">
            Try again
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function CancelDialog({ open, onOpenChange, project, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; project: ProjectDetail; onDone: (message: string) => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<string | null>(null);
  const outcome = project.cancellation;

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setLocal(null);
    try {
      const result = await api.post<{ message: string }>(`/api/projects/${project.id}/cancel`, { reason });
      setReason('');
      onDone(result.message);
    } catch (error) {
      setLocal(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cancel this booking?</DialogTitle>
          <DialogDescription>{cancellationOutcomeText(outcome)}</DialogDescription>
        </DialogHeader>
        {outcome.deadline ? (
          <p className="text-sm text-muted-foreground">72-hour deadline: {laTime(outcome.deadline)} (Los Angeles time). Your cancellation time is recorded when you confirm.</p>
        ) : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor="cancel-reason">Reason</Label>
          <Textarea id="cancel-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="bg-background" data-testid="cancel-reason" />
        </div>
        {local ? <ErrorAlert message={local} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Keep the booking</Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={busy || reason.trim().length < 5} data-testid="confirm-cancel">
            {busy ? 'Cancelling…' : 'Confirm cancellation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type RequestReason = 'not_delivered' | 'quality' | 'cancellation';

function RequestDialog({
  open,
  onOpenChange,
  project,
  onCancelInstead,
  onDone,
  setError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectDetail;
  onCancelInstead: () => void;
  onDone: (message: string) => void;
  setError: (m: string | null) => void;
}) {
  const [reason, setReason] = useState<RequestReason | ''>('');
  const [description, setDescription] = useState('');
  const [portfolio, setPortfolio] = useState<string[]>([]);
  const [deliveries, setDeliveries] = useState<string[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<string | null>(null);
  const portfolioOptions = (project.booking?.members ?? []).flatMap((m) => m.portfolio.map((item) => ({ id: item.id, label: `${m.name}: ${item.title}` })));
  const messageOptions = project.messages.slice(-20);
  const qualityAllowed = QUALITY_REQUEST_STATUSES.includes(project.status);
  const canSubmit = (reason === 'quality' || reason === 'not_delivered') && description.trim().length >= 20 && !busy;

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const submit = async () => {
    if (reason !== 'quality' && reason !== 'not_delivered') return;
    if (!canSubmit) return;
    setBusy(true);
    setLocal(null);
    try {
      await api.post(`/api/projects/${project.id}/refund-requests`, {
        reason,
        description: description.trim(),
        portfolioItemIds: portfolio,
        deliveryIds: deliveries,
        messageIds: messages,
      });
      setDescription('');
      setPortfolio([]);
      setDeliveries([]);
      setMessages([]);
      onDone('Your refund request has been submitted. Photo Shoot will review the evidence from both sides.');
    } catch (error) {
      setLocal(errorMessage(error));
      setError(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Request a refund</DialogTitle>
          <DialogDescription>Choose one reason. Your request is reviewed by Photo Shoot, and the creator can respond.</DialogDescription>
        </DialogHeader>
        <RadioGroup value={reason} onValueChange={(v) => setReason(v as RequestReason)} aria-label="Reason for the refund request">
          <div className="flex items-start gap-3">
            <RadioGroupItem value="cancellation" id="reason-cancellation" />
            <Label htmlFor="reason-cancellation" className="font-normal">Cancellation. The 72-hour guarantee applies if you cancel at least 72 hours before the shoot. A cancellation made less than 72 hours before the shoot is recorded and reviewed.</Label>
          </div>
          <div className="flex items-start gap-3">
            <RadioGroupItem value="not_delivered" id="reason-not-delivered" />
            <Label htmlFor="reason-not-delivered" className="font-normal">Agreed work not delivered</Label>
          </div>
          {qualityAllowed ? (
            <div className="flex items-start gap-3">
              <RadioGroupItem value="quality" id="reason-quality" />
              <Label htmlFor="reason-quality" className="font-normal">Delivered work below the quality represented in the profile and portfolio</Label>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">A quality request opens once work has been delivered, and before the balance is paid.</p>
          )}
        </RadioGroup>

        {reason === 'cancellation' ? (
          <div className="flex flex-col gap-3 border-t border-border pt-4 text-sm">
            <p className="text-muted-foreground">Cancelling records the time and applies the 72-hour guarantee automatically if it qualifies.</p>
            <div><Button onClick={onCancelInstead}>Continue to cancellation</Button></div>
          </div>
        ) : null}

        {reason === 'quality' || reason === 'not_delivered' ? (
          <div className="flex flex-col gap-5 border-t border-border pt-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="refund-description">Describe the problem</Label>
              <Textarea id="refund-description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} className="bg-background" maxLength={3000} data-testid="refund-description" />
              <p className="text-xs text-muted-foreground">At least 20 characters. The signed agreement (version included automatically) is part of the evidence.</p>
            </div>
            {portfolioOptions.length > 0 ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-semibold">Portfolio examples from this booking</legend>
                {portfolioOptions.map((option) => (
                  <label key={option.id} className="flex items-center gap-3 text-sm">
                    <Checkbox checked={portfolio.includes(option.id)} onCheckedChange={() => toggle(portfolio, setPortfolio, option.id)} />
                    {option.label}
                  </label>
                ))}
              </fieldset>
            ) : null}
            {project.deliveries.length > 0 ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-semibold">Delivered files</legend>
                {project.deliveries.map((file) => (
                  <label key={file.id} className="flex items-center gap-3 text-sm">
                    <Checkbox checked={deliveries.includes(file.id)} onCheckedChange={() => toggle(deliveries, setDeliveries, file.id)} />
                    {file.fileName}
                  </label>
                ))}
              </fieldset>
            ) : null}
            {messageOptions.length > 0 ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-semibold">Project messages</legend>
                <ul className="flex max-h-48 flex-col gap-2 overflow-y-auto">
                  {messageOptions.map((message) => (
                    <li key={message.id}>
                      <label className={cn('flex items-start gap-3 text-sm')}>
                        <Checkbox checked={messages.includes(message.id)} onCheckedChange={() => toggle(messages, setMessages, message.id)} className="mt-0.5" />
                        <span><span className="font-semibold">{message.authorName}:</span> <span className="text-muted-foreground">{message.body.slice(0, 160)}</span></span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Agreement version included automatically. Terms version {TERMS_VERSION}.
            </p>
          </div>
        ) : null}

        {local ? <ErrorAlert message={local} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {reason === 'quality' || reason === 'not_delivered' ? (
            <Button onClick={() => void submit()} disabled={!canSubmit} data-testid="submit-refund-request">
              {busy ? 'Submitting…' : 'Submit request'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
