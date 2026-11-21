import type { ProjectStatus } from './types';

export const STATUS_META: Record<ProjectStatus, { label: string; description: string }> = {
  draft: {
    label: 'Draft brief',
    description: 'The brief is being written. Nothing has been sent to creators yet.',
  },
  recruiting: {
    label: 'Inviting creators',
    description: 'Creators are invited. Each one accepts or declines before the agreement is sent.',
  },
  agreement_pending: {
    label: 'Awaiting approvals',
    description: 'Every person on the team must approve the same brief before anything is booked.',
  },
  agreed: {
    label: 'Agreed',
    description: 'The brief is approved by everyone. Pay the deposit to confirm the booking.',
  },
  booked: {
    label: 'Booked',
    description: 'The deposit is paid and the shoot is confirmed.',
  },
  delivered: {
    label: 'Delivered',
    description: 'The creators uploaded files. The customer reviews them next.',
  },
  revision_requested: {
    label: 'Revision requested',
    description: 'The customer requested an included revision.',
  },
  completed: {
    label: 'Completed',
    description: 'The customer confirmed completion. The balance is due to close the project.',
  },
  closed: {
    label: 'Closed',
    description: 'The balance is paid and creator payouts are scheduled. Reviews are open.',
  },
  cancelled: {
    label: 'Cancelled',
    description: 'This project was cancelled. Any refund follows the cancellation policy.',
  },
  disputed: {
    label: 'Dispute open',
    description: 'A dispute is open. Payouts are held while the Photo Shoot team reviews it.',
  },
};

export function statusTone(status: ProjectStatus): 'red' | 'solid' | 'outline' | 'muted' {
  switch (status) {
    case 'agreement_pending':
    case 'revision_requested':
    case 'disputed':
      return 'red';
    case 'booked':
    case 'agreed':
    case 'delivered':
    case 'completed':
    case 'closed':
      return 'solid';
    case 'cancelled':
      return 'muted';
    default:
      return 'outline';
  }
}
