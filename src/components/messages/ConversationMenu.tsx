import { useId, useState } from 'react';
import { Link } from 'react-router';
import { Ban, Ellipsis, Flag, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { ErrorAlert } from '@/components/site/ui-bits';
import { errorMessage } from '@/lib/api';
import { useMessagingStore } from '@/lib/messaging/hooks';
import {
  previewOf,
  REPORT_DETAILS_MAX_CHARS,
  REPORT_MAX_MESSAGES,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  type DirectMessage,
  type MessageParticipant,
  type ReportReason,
} from '../../../shared/messaging';

interface ConversationMenuProps {
  peer: MessageParticipant;
  conversationId: string | null;
  blockedByViewer: boolean;
  messages: DirectMessage[];
  viewerId: string | null;
}

type DialogKind = 'block' | 'unblock' | 'report' | null;

/** Conversation options: view profile, block or unblock, and report. Blocking and reporting confirm before they act. */
export function ConversationMenu({ peer, conversationId, blockedByViewer, messages, viewerId }: ConversationMenuProps) {
  const [dialog, setDialog] = useState<DialogKind>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 shrink-0 rounded-full"
            aria-label={`Conversation options for ${peer.name}`}
            data-testid="conversation-menu-trigger"
          >
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem asChild>
            <Link to={peer.profileUrl} data-testid="menu-view-profile">
              <UserRound /> View profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {blockedByViewer ? (
            <DropdownMenuItem onSelect={() => setDialog('unblock')} data-testid="menu-unblock">
              <ShieldCheck /> Unblock {peer.name}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setDialog('block')} variant="destructive" data-testid="menu-block">
              <Ban /> Block {peer.name}
            </DropdownMenuItem>
          )}
          {conversationId ? (
            <DropdownMenuItem onSelect={() => setDialog('report')} data-testid="menu-report">
              <Flag /> Report conversation
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <BlockDialog
        open={dialog === 'block' || dialog === 'unblock'}
        mode={dialog === 'unblock' ? 'unblock' : 'block'}
        peer={peer}
        onOpenChange={(open) => setDialog(open ? dialog : null)}
      />
      {conversationId ? (
        <ReportDialog
          open={dialog === 'report'}
          conversationId={conversationId}
          peer={peer}
          messages={messages}
          viewerId={viewerId}
          onOpenChange={(open) => setDialog(open ? 'report' : null)}
        />
      ) : null}
    </>
  );
}

function BlockDialog({ open, mode, peer, onOpenChange }: { open: boolean; mode: 'block' | 'unblock'; peer: MessageParticipant; onOpenChange: (open: boolean) => void }) {
  const store = useMessagingStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const blocking = mode === 'block';

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await store.setBlocked(peer.id, blocking);
      setDone(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setDone(false);
      setError(null);
    }
  };

  let title = blocking ? `Block ${peer.name}?` : `Unblock ${peer.name}?`;
  let body = blocking
    ? "They won't be able to send you messages, and you won't be able to message them. Your conversation history stays available to you."
    : 'You will be able to message each other again.';
  if (done) {
    title = blocking ? `${peer.name} is blocked` : `${peer.name} is unblocked`;
    body = blocking ? 'Messaging is now unavailable in both directions. Your conversation history is still here.' : 'Messaging is available again.';
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        {error ? <ErrorAlert message={error} /> : null}
        <DialogFooter>
          {done ? (
            <Button type="button" onClick={() => close(false)} data-testid="block-done">
              Done
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void confirm()} disabled={busy} data-testid="block-confirm">
                {busy ? 'Saving…' : blocking ? `Block ${peer.name}` : `Unblock ${peer.name}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportDialog({
  open,
  conversationId,
  peer,
  messages,
  viewerId,
  onOpenChange,
}: {
  open: boolean;
  conversationId: string;
  peer: MessageParticipant;
  messages: DirectMessage[];
  viewerId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const store = useMessagingStore();
  const groupId = useId();
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const canSubmit = reason !== '' && selected.length > 0 && !busy;

  const toggle = (id: string) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      return current.length >= REPORT_MAX_MESSAGES ? current : [...current, id];
    });
  };

  const submit = async () => {
    if (reason === '' || selected.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await store.report({ conversationId, reason, details: details.trim(), messageIds: selected });
      setDone(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setDone(false);
      setError(null);
      setReason('');
      setSelected([]);
      setDetails('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle>Report sent</DialogTitle>
              <DialogDescription>
                Our moderation team will review the messages you selected. {peer.name} has not been notified.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" onClick={() => close(false)} data-testid="report-done">
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Report this conversation</DialogTitle>
              <DialogDescription>Choose a reason, then select the messages that show the problem. Reports go to moderators only.</DialogDescription>
            </DialogHeader>

            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm font-semibold">Reason</legend>
              <RadioGroup value={reason} onValueChange={(value) => setReason(value as ReportReason)} aria-label="Reason for report">
                {REPORT_REASONS.map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <RadioGroupItem value={item} id={`${groupId}-${item}`} />
                    <Label htmlFor={`${groupId}-${item}`} className="font-normal">
                      {REPORT_REASON_LABELS[item]}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>

            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm font-semibold">
                Messages to include <span className="font-normal text-muted-foreground">(up to {REPORT_MAX_MESSAGES})</span>
              </legend>
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">There are no saved messages to select.</p>
              ) : (
                <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-md border border-border p-3">
                  {messages.map((message) => {
                    const mine = message.senderId === viewerId;
                    const checkboxId = `${groupId}-m-${message.id}`;
                    const disabled = !selected.includes(message.id) && selected.length >= REPORT_MAX_MESSAGES;
                    return (
                      <li key={message.id} className="flex items-start gap-3">
                        <Checkbox
                          id={checkboxId}
                          checked={selected.includes(message.id)}
                          disabled={disabled}
                          onCheckedChange={() => toggle(message.id)}
                          className="mt-0.5"
                        />
                        <Label htmlFor={checkboxId} className="font-normal leading-snug">
                          <span className="font-semibold">{mine ? 'You' : peer.name}: </span>
                          <span className="text-muted-foreground">{previewOf(message.body)}</span>
                        </Label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>

            <div className="flex flex-col gap-2">
              <Label htmlFor={`${groupId}-details`}>Explain the problem (optional)</Label>
              <Textarea
                id={`${groupId}-details`}
                value={details}
                maxLength={REPORT_DETAILS_MAX_CHARS}
                onChange={(event) => setDetails(event.target.value)}
                rows={3}
                className="bg-background"
                data-testid="report-details"
              />
            </div>

            {error ? <ErrorAlert message={error} /> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void submit()} disabled={!canSubmit} data-testid="report-submit">
                {busy ? 'Sending…' : 'Send report'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
