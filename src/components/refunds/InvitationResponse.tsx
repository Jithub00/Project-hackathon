import { useId, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { REFUND_POLICY_VERSION, TERMS_VERSION } from '../../../shared/policy';

interface InvitationResponseProps {
  busy: boolean;
  onAccept: (versions: { acceptedRefundPolicyVersion: string; acceptedTermsVersion: string }) => void;
  onDecline: () => void;
}

/**
 * The creator's answer to an invitation. Accepting requires the current Refund and Cancellation Policy and Terms, and
 * the creator is told that platform guarantees apply even if a profile or project term says otherwise.
 */
export function InvitationResponse({ busy, onAccept, onDecline }: InvitationResponseProps) {
  const [agreed, setAgreed] = useState(false);
  const checkboxId = useId();
  return (
    <div className="flex flex-col gap-5" data-testid="invitation-response">
      <div className="flex flex-col gap-2 rounded-md border border-white/15 bg-surface-raised p-4 text-sm leading-relaxed">
        <p>
          Before you accept, read the <Link to="/policies/refund-and-cancellation" className="underline underline-offset-4">Refund and Cancellation Policy</Link> and the{' '}
          <Link to="/terms" className="underline underline-offset-4">Terms and Conditions</Link>. The quality and delivery guarantee and the 72-hour cancellation guarantee apply to every booking, even if a profile description or project term says otherwise.
        </p>
      </div>
      <div className="flex items-start gap-3">
        <Checkbox id={checkboxId} checked={agreed} onCheckedChange={(value) => setAgreed(value === true)} data-testid="invitation-policy-accept" />
        <Label htmlFor={checkboxId} className="font-normal leading-relaxed">
          I accept the Refund and Cancellation Policy (version {REFUND_POLICY_VERSION}) and the Terms and Conditions (version {TERMS_VERSION}).
        </Label>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={busy || !agreed}
          onClick={() => onAccept({ acceptedRefundPolicyVersion: REFUND_POLICY_VERSION, acceptedTermsVersion: TERMS_VERSION })}
          data-testid="accept-invite"
        >
          Accept invitation
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onDecline} data-testid="decline-invite">Decline</Button>
      </div>
    </div>
  );
}
