import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_BOARD_FILTERS,
  filterBoardItems,
  isDefaultBoardFilters,
  matchesBoardFilters,
  matchesBudget,
  matchesRole,
  rolesNeeded,
  type BoardFilters,
  type BoardListing,
} from '../project-board';

const photographerOnly: BoardListing = { neighborhood: 'Echo Park', needs: ['photographer'], budgetCents: 60_000 };
const videographerOnly: BoardListing = { neighborhood: 'North Hollywood', needs: ['videographer'], budgetCents: 120_000 };
const both: BoardListing = { neighborhood: 'Los Feliz', needs: ['photographer', 'videographer'], budgetCents: 160_000 };

function filters(overrides: Partial<BoardFilters>): BoardFilters {
  return { ...DEFAULT_BOARD_FILTERS, ...overrides };
}

describe('rolesNeeded', () => {
  it('maps the live service values to the roles they need', () => {
    assert.deepEqual(rolesNeeded('photography'), ['photographer']);
    assert.deepEqual(rolesNeeded('videography'), ['videographer']);
    assert.deepEqual(rolesNeeded('both'), ['photographer', 'videographer']);
    assert.deepEqual(rolesNeeded('unknown'), []);
  });
});

describe('matchesRole', () => {
  it('lets any role through', () => {
    assert.equal(matchesRole([], 'any'), true);
  });

  it('shows a project that needs both roles under either single role', () => {
    assert.equal(matchesRole(both.needs, 'photographer'), true);
    assert.equal(matchesRole(both.needs, 'videographer'), true);
  });

  it('only shows single-role projects under their own role', () => {
    assert.equal(matchesRole(photographerOnly.needs, 'photographer'), true);
    assert.equal(matchesRole(photographerOnly.needs, 'videographer'), false);
    assert.equal(matchesRole(photographerOnly.needs, 'both'), false);
  });

  it('shows only projects that need both roles under "both"', () => {
    assert.equal(matchesRole(both.needs, 'both'), true);
    assert.equal(matchesRole(videographerOnly.needs, 'both'), false);
  });
});

describe('matchesBudget', () => {
  it('places the band edges on the right side', () => {
    assert.equal(matchesBudget(0, 'under-1000'), true);
    assert.equal(matchesBudget(99_999, 'under-1000'), true);
    assert.equal(matchesBudget(100_000, 'under-1000'), false);
    assert.equal(matchesBudget(100_000, '1000-1500'), true);
    assert.equal(matchesBudget(150_000, '1000-1500'), true);
    assert.equal(matchesBudget(150_001, '1000-1500'), false);
    assert.equal(matchesBudget(150_001, 'over-1500'), true);
  });

  it('lets every budget through when no band is chosen', () => {
    assert.equal(matchesBudget(1, 'any'), true);
    assert.equal(matchesBudget(10_000_000, 'any'), true);
  });
});

describe('matchesBoardFilters and filterBoardItems', () => {
  it('returns every listing under the default filters', () => {
    assert.equal(isDefaultBoardFilters(DEFAULT_BOARD_FILTERS), true);
    const items = [photographerOnly, videographerOnly, both];
    assert.deepEqual(filterBoardItems(items, DEFAULT_BOARD_FILTERS, (item) => item), items);
  });

  it('requires the neighbourhood to match exactly', () => {
    assert.equal(matchesBoardFilters(both, filters({ neighborhood: 'Los Feliz' })), true);
    assert.equal(matchesBoardFilters(both, filters({ neighborhood: 'Echo Park' })), false);
  });

  it('combines role, neighbourhood and budget', () => {
    const items = [photographerOnly, videographerOnly, both];
    const result = filterBoardItems(items, filters({ role: 'photographer', budget: 'over-1500' }), (item) => item);
    assert.deepEqual(result, [both]);
    assert.equal(isDefaultBoardFilters(filters({ budget: 'over-1500' })), false);
  });

  it('maps items through the listing accessor', () => {
    const rows = [{ id: 'a', place: 'Echo Park', cents: 60_000 }];
    const result = filterBoardItems(rows, filters({ neighborhood: 'Echo Park' }), (row) => ({
      neighborhood: row.place,
      needs: ['photographer'],
      budgetCents: row.cents,
    }));
    assert.deepEqual(result, rows);
  });
});
