import { expect, test, type Browser, type Page } from '@playwright/test';
import { apiSignupCreator, apiSignupCustomer, loginUi, PNG_BYTES } from './helpers';

async function openContext(browser: Browser, email: string, password: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginUi(page, email, password);
  return { page, close: () => context.close() };
}

test.describe('Team pricing, agreement, booking, delivery and reviews', () => {
  test.setTimeout(240_000);

  test('a customer builds a two-role team and carries it through to reviews', async ({ browser, request }) => {
    const customer = await apiSignupCustomer(request, { name: 'Workflow Client', neighborhood: 'Venice' });
    const photographer = await apiSignupCreator(request, {
      name: 'Wf Photographer',
      services: 'photography',
      specialties: ['Fashion & lookbook'],
      styles: ['Editorial', 'Clean & bright'],
      neighborhoods: ['Venice'],
      citywide: false,
      packageService: 'photography',
      packageName: 'Lookbook half-day',
      packagePriceCents: 90000,
    });
    const videographer = await apiSignupCreator(request, {
      name: 'Wf Videographer',
      services: 'videography',
      specialties: ['Brand films'],
      styles: ['Documentary', 'Editorial'],
      neighborhoods: [],
      citywide: true,
      packageService: 'videography',
      packageName: 'Social cut day',
      packagePriceCents: 120000,
    });

    const client = await openContext(browser, customer.email, customer.password);
    const page = client.page;

    // 1. Build the brief and team in the matching wizard.
    await page.goto('/match');
    await page.getByTestId('project-title').fill('Workflow lookbook and social cut');
    await page.getByTestId('content-type').click();
    await page.getByRole('option', { name: 'Fashion & lookbook', exact: true }).click();
    await page.getByTestId('neighborhood-select').click();
    await page.getByRole('option', { name: 'Venice', exact: true }).click();
    await page.getByTestId('next-step').click();
    await page.getByTestId('service-both').click();
    await page.getByTestId('next-step').click();
    await page.getByTestId('next-step').click();
    await page.getByTestId('next-step').click();

    await page.getByTestId('matches-photography').getByTestId('creator-card').filter({ hasText: 'Wf Photographer' }).getByTestId('add-to-team').click();
    await page.getByTestId('matches-videography').getByTestId('creator-card').filter({ hasText: 'Wf Videographer' }).getByTestId('add-to-team').click();

    // 2. Team pricing with fees before anything is committed.
    // Packages $900 + $1,200 = $2,100. Fee 8% = $168. Total $2,268. Deposit 30% = $680.40.
    await expect(page.getByTestId('quote-subtotal')).toHaveText('$2,100.00');
    await expect(page.getByTestId('quote-total')).toHaveText('$2,268.00');
    await expect(page.getByTestId('quote-deposit')).toHaveText('$680.40');
    await expect(page.getByTestId('quote-balance')).toHaveText('$1,587.60');

    await page.getByTestId('save-brief').click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    const projectId = page.url().split('/projects/')[1];
    await expect(page.getByTestId('project-title')).toHaveText('Workflow lookbook and social cut');
    await expect(page.getByTestId('status-badge').first()).toHaveText('Inviting creators');

    // Booking is not possible until both creators accept.
    await expect(page.getByTestId('send-agreement-cta')).toHaveCount(0);

    // 3. Both creators accept their invitations.
    const photo = await openContext(browser, photographer.email, photographer.password);
    await photo.page.goto(`/projects/${projectId}`);
    await expect(photo.page.getByTestId('next-step')).toContainText('You are invited');
    await photo.page.getByTestId('invitation-policy-accept').click();
    await photo.page.getByTestId('accept-invite').click();
    await expect(photo.page.getByTestId('next-step')).toContainText('Waiting for the agreement');

    const video = await openContext(browser, videographer.email, videographer.password);
    await video.page.goto(`/projects/${projectId}`);
    await video.page.getByTestId('invitation-policy-accept').click();
    await video.page.getByTestId('accept-invite').click();
    await expect(video.page.getByTestId('next-step')).toContainText('Waiting for the agreement');

    // 4. The customer sends one agreement to everyone. Each person approves the same version.
    await page.reload();
    await page.getByTestId('send-agreement-cta').click();
    await page.getByTestId('send-agreement').click();
    await expect(page.getByTestId('status-badge').first()).toHaveText('Awaiting approvals');
    await expect(page.getByTestId('approver')).toHaveCount(3);

    await photo.page.reload();
    await photo.page.getByTestId('approve-cta').click();
    await expect(photo.page.getByTestId('next-step')).toContainText('Waiting for approvals');
    await video.page.reload();
    await video.page.getByTestId('approve-cta').click();

    await page.reload();
    await page.getByTestId('approve-cta').click();
    await expect(page.getByTestId('status-badge').first()).toHaveText('Agreed');
    await expect(page.getByTestId('pay-deposit-cta')).toBeVisible();

    // 5. Deposit: demonstration environment, confirmed by the server.
    await page.getByTestId('pay-deposit-cta').click();
    await expect(page).toHaveURL(/checkout\?kind=deposit/);
    // The deposit waits until the customer accepts the current policy and terms. That version is recorded with the booking.
    await expect(page.getByTestId('continue-to-payment')).toBeDisabled();
    await page.getByTestId('checkout-accept').click();
    await page.getByTestId('continue-to-payment').click();
    await expect(page.getByTestId('demo-payment')).toBeVisible();
    await expect(page.getByTestId('amount-due')).toHaveText('$680.40');
    await page.getByTestId('confirm-demo-payment').click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`));
    await expect(page.getByTestId('flash')).toContainText('Deposit received');
    await expect(page.getByTestId('status-badge').first()).toHaveText('Booked');

    await page.getByTestId('tab-payments').click();
    await expect(page.getByTestId('payment-list')).toContainText('Demonstration (no money moves)');
    await expect(page.getByTestId('payment-row').first()).toHaveAttribute('data-status', 'succeeded');
    await expect(page.getByTestId('demo-badge').first()).toBeVisible();
    await expect(page.getByTestId('booking-record')).toContainText('Refund and Cancellation Policy version');

    // Reviews stay locked until the project is completed.
    await page.getByTestId('tab-reviews').click();
    await expect(page.getByTestId('reviews-locked')).toBeVisible();

    // 6. Creator delivers files.
    await photo.page.reload();
    await expect(photo.page.getByTestId('next-step')).toContainText('Shoot is booked');
    await photo.page.getByTestId('tab-delivery').click();
    await photo.page.getByTestId('delivery-file').setInputFiles({ name: 'lookbook-01.png', mimeType: 'image/png', buffer: PNG_BYTES });
    await photo.page.getByTestId('deliver-files').click();
    await expect(photo.page.getByTestId('delivery-list')).toContainText('lookbook-01.png');

    // 7. Customer requests the included revision.
    await page.reload();
    await expect(page.getByTestId('status-badge').first()).toHaveText('Delivered');
    await page.getByTestId('tab-delivery').click();
    await expect(page.getByTestId('delivery-list')).toContainText('lookbook-01.png');
    // A quality request opens once work is delivered. The customer withdraws it, which releases the payout hold.
    await page.getByTestId('tab-payments').click();
    await page.getByTestId('open-refund-request').click();
    await page.getByRole('radio', { name: 'Delivered work below the quality' }).click();
    await page.getByTestId('refund-description').fill('The first look is underexposed compared with the portfolio.');
    await page.getByTestId('submit-refund-request').click();
    await expect(page.getByTestId('flash')).toContainText('Your refund request has been submitted');
    await page.getByTestId('tab-payments').click();
    const quality = page.getByTestId('refund-request').filter({ hasText: 'Quality of delivered work' });
    await expect(quality.getByTestId('refund-status')).toHaveText('Submitted');
    await quality.getByTestId('withdraw-request').click();
    await expect(page.getByTestId('flash')).toContainText('The request has been withdrawn');
    await page.getByTestId('tab-delivery').click();
    await page.getByTestId('revision-notes').fill('Please swap image three for a brighter frame.');
    await page.getByTestId('request-revision').click();
    await expect(page.getByTestId('status-badge').first()).toHaveText('Revision requested');
    await expect(page.getByTestId('revisions-used')).toHaveText('Included revisions used: 1 of 2');

    // 8. Creator uploads the revised file, then the customer confirms completion.
    await photo.page.reload();
    await photo.page.getByTestId('tab-delivery').click();
    await photo.page.getByTestId('delivery-file').setInputFiles({ name: 'lookbook-01-revised.png', mimeType: 'image/png', buffer: PNG_BYTES });
    await photo.page.getByTestId('deliver-files').click();
    await expect(photo.page.getByTestId('delivery-list')).toContainText('lookbook-01-revised.png');

    await page.reload();
    await page.getByTestId('tab-delivery').click();
    await page.getByTestId('confirm-completion-panel').click();
    await expect(page.getByTestId('status-badge').first()).toHaveText('Completed');

    // 9. The balance is due. Paying it closes the project and schedules payouts.
    await page.getByTestId('pay-balance-cta').click();
    await expect(page).toHaveURL(/checkout\?kind=balance/);
    await expect(page.getByTestId('amount-due')).toHaveText('$1,587.60');
    await page.getByTestId('confirm-demo-payment').click();
    await expect(page.getByTestId('status-badge').first()).toHaveText('Closed');
    await page.getByTestId('tab-payments').click();
    await expect(page.getByTestId('payout-list')).toContainText('Scheduled for');

    // 10. Mutual reviews. The customer reviews each creator, and each creator reviews the customer.
    await page.reload();
    await page.getByTestId('tab-reviews').click();
    await expect(page.getByTestId('review-form')).toHaveCount(2);
    for (let i = 0; i < 2; i += 1) {
      const remaining = 2 - i;
      await page.getByTestId('review-form').first().getByTestId('review-body').fill('Clear brief, on-time delivery and consistent edits. We would book again.');
      await page.getByTestId('review-form').first().getByTestId('submit-review').click();
      await expect(page.getByTestId('review-form')).toHaveCount(remaining - 1);
    }

    await photo.page.reload();
    await photo.page.getByTestId('tab-reviews').click();
    await expect(photo.page.getByTestId('review-form')).toHaveCount(1);
    await photo.page.getByTestId('review-body').fill('The brief was clear, approvals were quick and the payment schedule matched the agreement.');
    await photo.page.getByTestId('submit-review').click();
    await expect(photo.page.getByText('Thanks. Your reviews are published on the profiles involved.')).toBeVisible();

    // The reviews now appear on the creator's public profile, linked to the booking.
    await photo.page.goto(`/creators/${photographer.id}`);
    await expect(photo.page.getByTestId('review-list')).toContainText('Clear brief, on-time delivery');
    await expect(photo.page.getByTestId('review-list')).toContainText('Workflow lookbook and social cut');

    await video.close();
    await photo.close();
    await client.close();
  });
});
