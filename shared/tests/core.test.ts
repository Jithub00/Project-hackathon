import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BIO_MAX_WORDS, checkBiography, countWords } from '../biography';
import { CREATOR_COMMISSION_RATE, CUSTOMER_FEE_RATE, DEPOSIT_RATE, quoteTeam } from '../pricing';
import { isLaNeighborhood, LA_NEIGHBORHOOD_NAMES, regionOf } from '../service-area';
import { evaluateCreator, suggestTeam, type MatchableCreator } from '../matching';
import { requiredApproverIds, summarizeChanges } from '../brief';
import { formatUsd, formatUsdExact } from '../money';
import type { BriefContent } from '../types';

const creator = (overrides: Partial<MatchableCreator> = {}): MatchableCreator => ({
  id: 'c1',
  name: 'Test Creator',
  services: 'photography',
  styles: ['Editorial'],
  neighborhoods: ['Venice'],
  citywide: false,
  seekingClients: true,
  weekdays: [1, 2, 3, 4, 5],
  availableDates: [],
  bookedDates: [],
  packages: [{ id: 'p1', service: 'photography', name: 'Half day', hours: 4, priceCents: 80000, deliverables: '' }],
  ratingAverage: 4.9,
  ratingCount: 12,
  ...overrides,
});

describe('biography limit', () => {
  it('counts whitespace-separated words', () => {
    assert.equal(countWords(''), 0);
    assert.equal(countWords('  one   two\nthree '), 3);
  });

  it('accepts exactly 350 words and rejects 351 with a message that keeps the text', () => {
    const ok = Array.from({ length: BIO_MAX_WORDS }, () => 'word').join(' ');
    assert.equal(checkBiography(ok).ok, true);
    const over = `${ok} extra`;
    const result = checkBiography(over);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.words, 351);
      assert.equal(result.over, 1);
      assert.match(result.message, /Remove 1 word to save/);
    }
  });
});

describe('pricing', () => {
  it('adds an 8% customer fee, takes 10% commission and splits a 30% deposit', () => {
    assert.equal(CUSTOMER_FEE_RATE, 0.08);
    assert.equal(CREATOR_COMMISSION_RATE, 0.1);
    assert.equal(DEPOSIT_RATE, 0.3);
    const quote = quoteTeam([
      { userId: 'a', priceCents: 90000 },
      { userId: 'b', priceCents: 120000 },
    ]);
    assert.equal(quote.subtotalCents, 210000);
    assert.equal(quote.customerFeeCents, 16800);
    assert.equal(quote.totalCents, 226800);
    assert.equal(quote.depositCents, 68040);
    assert.equal(quote.balanceCents, 158760);
    assert.equal(quote.creatorCommissionCents, 21000);
    assert.equal(quote.creatorPayoutCents, 189000);
  });

});

describe('service area', () => {
  it('lists only City of Los Angeles neighbourhoods', () => {
    assert.ok(isLaNeighborhood('Venice'));
    assert.ok(isLaNeighborhood('Pacific Palisades'));
    assert.equal(isLaNeighborhood('Santa Monica'), false);
    assert.equal(isLaNeighborhood('Culver City'), false);
    assert.equal(isLaNeighborhood(''), false);
    assert.equal(regionOf('Venice'), 'Westside');
    assert.ok(LA_NEIGHBORHOOD_NAMES.length >= 40);
  });
});

describe('matching', () => {
  it('excludes creators on service, location, budget, style and seeking status', () => {
    const base = { services: 'videography' as const, neighborhood: null, budgetCents: null, styles: [], dates: [], minRating: null };
    assert.equal(evaluateCreator(creator(), base).excludedFor, 'service');
    assert.equal(evaluateCreator(creator(), { ...base, services: 'photography', neighborhood: 'Hollywood' }).excludedFor, 'location');
    assert.equal(evaluateCreator(creator(), { ...base, services: 'photography', budgetCents: 50000 }).excludedFor, 'budget');
    assert.equal(evaluateCreator(creator(), { ...base, services: 'photography', styles: ['Gritty & raw'] }).excludedFor, 'style');
    assert.equal(evaluateCreator(creator({ seekingClients: false }), { ...base, services: 'photography' }).excludedFor, 'notSeeking');
  });

  it('a budget with no service still excludes creators whose cheapest package is over budget', () => {
    const outcome = evaluateCreator(creator(), { services: 'any', neighborhood: null, budgetCents: 50000, styles: [], dates: [], minRating: null });
    assert.equal(outcome.excludedFor, 'budget');
  });

  it('explains fit with coverage, budget, style and rating reasons', () => {
    const outcome = evaluateCreator(creator(), { services: 'photography', neighborhood: 'Venice', budgetCents: 150000, styles: ['Editorial'], dates: [], minRating: null });
    assert.equal(outcome.included, true);
    const reasons = outcome.fit!.reasons.join(' | ');
    assert.match(reasons, /Covers Venice/);
    assert.match(reasons, /Half day from \$800 fits your budget/);
    assert.match(reasons, /Shares your style: Editorial/);
    assert.match(reasons, /Rated 4\.9/);
  });

  it('suggests the best photographer and videographer and reports when no team fits the budget', () => {
    const photo = creator({ id: 'p', services: 'photography' });
    const video = creator({
      id: 'v',
      name: 'Video',
      services: 'videography',
      packages: [{ id: 'vp', service: 'videography', name: 'Film', hours: 6, priceCents: 150000, deliverables: '' }],
    });
    const criteria = { services: 'both' as const, neighborhood: 'Venice', budgetCents: 200000, styles: [], dates: [], minRating: null };
    const outcomes = [photo, video].map((c) => evaluateCreator(c, criteria));
    const team = suggestTeam(outcomes, [photo, video], criteria)!;
    assert.equal(team.members.length, 2);
    assert.equal(team.subtotalCents, 230000);
    assert.equal(team.withinBudget, false);
    assert.match(team.message, /above your \$2,000 budget/);
  });
});

describe('brief approvals and change summaries', () => {
  const brief = (overrides: Partial<BriefContent> = {}): BriefContent => ({
    title: 'Lookbook',
    goals: 'Show the spring collection.',
    creativeDirection: 'Bright',
    shootDate: '2030-03-10',
    shootStartTime: '09:00',
    durationHours: 4,
    neighborhood: 'Venice',
    locationDetail: '',
    photoCount: 40,
    video: { count: 0, lengthSeconds: 60 },
    otherDeliverables: '',
    editingRequirements: '',
    includedRevisions: 2,
    deliveryDeadline: '2030-03-24',
    usageRights: 'social-web-12m',
    members: [
      { userId: 'pa', creatorName: 'Ana', roleLabel: 'Photographer', service: 'photography', packageId: 'pk1', packageName: 'Half day', hours: 4, priceCents: 90000, responsibilities: 'Shoot' },
      { userId: 'pb', creatorName: 'Ben', roleLabel: 'Videographer', service: 'videography', packageId: 'pk2', packageName: 'Cut', hours: 3, priceCents: 120000, responsibilities: 'Edit' },
    ],
    ...overrides,
  });

  it('the first brief needs every team member and the customer to approve', () => {
    assert.deepEqual(requiredApproverIds(null, brief(), 'cust', ['pa', 'pb']).sort(), ['cust', 'pa', 'pb']);
  });

  it('a price change on one creator needs only that creator and the customer', () => {
    const prev = brief();
    const next = brief({
      members: [
        { ...prev.members[0] },
        { ...prev.members[1], priceCents: 130000, packageId: 'pk3', packageName: 'Feature cut' },
      ],
    });
    assert.deepEqual(requiredApproverIds(prev, next, 'cust', ['pa', 'pb']).sort(), ['cust', 'pb']);
    assert.ok(summarizeChanges(prev, next).some((line) => line.includes('price changed from $1,200 to $1,300')));
  });

  it('a deadline change affects the whole team', () => {
    const prev = brief();
    const next = brief({ deliveryDeadline: '2030-03-31' });
    assert.deepEqual(requiredApproverIds(prev, next, 'cust', ['pa', 'pb']).sort(), ['cust', 'pa', 'pb']);
    assert.ok(summarizeChanges(prev, next).includes('Delivery deadline changed'));
  });
});

describe('money formatting', () => {
  it('formats cents as US dollars', () => {
    assert.equal(formatUsd(85000), '$850');
    assert.equal(formatUsdExact(226800), '$2,268.00');
  });
});
