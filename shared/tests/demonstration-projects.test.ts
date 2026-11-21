import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  DEMONSTRATION_PROJECTS,
  demonstrationListing,
  estimatedHours,
  findDemonstrationProject,
  formatDeadline,
  formatShootDate,
  formatShootTimes,
  shootSchedule,
} from '../demonstration-projects';
import { filterBoardItems, DEFAULT_BOARD_FILTERS, type BoardFilters } from '../project-board';
import { LA_NEIGHBORHOOD_NAMES } from '../service-area';

const publicDir = fileURLToPath(new URL('../../public', import.meta.url));

function slugsFor(filters: Partial<BoardFilters>): string[] {
  const applied: BoardFilters = { ...DEFAULT_BOARD_FILTERS, ...filters };
  return filterBoardItems(DEMONSTRATION_PROJECTS, applied, demonstrationListing).map((project) => project.slug);
}

const bySlug = (slug: string) => {
  const project = findDemonstrationProject(slug);
  assert.ok(project, `missing project ${slug}`);
  return project;
};

describe('demonstration project data', () => {
  it('contains the four sample briefs with unique slugs', () => {
    assert.equal(DEMONSTRATION_PROJECTS.length, 4);
    assert.equal(new Set(DEMONSTRATION_PROJECTS.map((project) => project.slug)).size, 4);
  });

  it('places every project in a Los Angeles neighbourhood from the service area', () => {
    for (const project of DEMONSTRATION_PROJECTS) {
      assert.ok(LA_NEIGHBORHOOD_NAMES.includes(project.neighborhood), `${project.title} is outside the service area`);
    }
  });

  it('gives every overview exactly two sentences', () => {
    for (const project of DEMONSTRATION_PROJECTS) {
      const sentences = project.overview.split(/(?<=[.!?])\s+/).filter(Boolean);
      assert.equal(sentences.length, 2, `${project.title} overview has ${sentences.length} sentences`);
    }
  });

  it('adds up role pay to the total budget wherever each role has its own pay', () => {
    for (const project of DEMONSTRATION_PROJECTS) {
      if (project.roles.every((role) => role.payCents !== undefined)) {
        const pay = project.roles.reduce((sum, role) => sum + (role.payCents ?? 0), 0);
        assert.equal(pay, project.budgetCents, `${project.title} role pay does not match the total`);
      }
    }
  });

  it('keeps the delivery deadline after the shoot and the shoot window in order', () => {
    for (const project of DEMONSTRATION_PROJECTS) {
      assert.ok(Date.parse(project.shootStart) < Date.parse(project.shootEnd), `${project.title} ends before it starts`);
      assert.ok(Date.parse(project.deliveryDeadline) > Date.parse(project.shootEnd), `${project.title} deadline is before the shoot`);
    }
  });

  it('points every image at a file that exists in public/', () => {
    for (const project of DEMONSTRATION_PROJECTS) {
      assert.ok(existsSync(path.join(publicDir, project.image.src)), `missing image ${project.image.src}`);
      assert.ok(project.image.alt.length > 0);
    }
  });

  it('gives the four projects the figures agreed in the brief', () => {
    const clothing = bySlug('independent-clothing-brand-launch');
    assert.equal(clothing.budgetCents, 140_000);
    assert.deepEqual(clothing.roles.map((role) => role.payCents), [65_000, 75_000]);
    assert.equal(clothing.deliveryDeadline.slice(0, 10), '2026-12-12');

    const cafe = bySlug('neighborhood-cafe-content-refresh');
    assert.equal(cafe.budgetCents, 60_000);
    assert.equal(cafe.roles.length, 1);
    assert.equal(cafe.roles[0].payCents, undefined);

    const music = bySlug('independent-music-performance-video');
    assert.equal(music.budgetCents, 120_000);
    assert.deepEqual(music.roles.map((role) => role.role), ['videographer']);

    const architecture = bySlug('architecture-and-interiors-showcase');
    assert.equal(architecture.budgetCents, 160_000);
    assert.deepEqual(architecture.roles.map((role) => role.payCents), [85_000, 75_000]);
  });
});

describe('Los Angeles time formatting', () => {
  it('shows the shoot date and times in Pacific time, whatever zone the viewer is in', () => {
    const clothing = bySlug('independent-clothing-brand-launch');
    assert.equal(formatShootDate(clothing.shootStart), 'Saturday, December 5, 2026');
    assert.equal(formatShootTimes(clothing.shootStart, clothing.shootEnd), '10:00 AM – 2:00 PM PST');
    assert.equal(formatDeadline(clothing.deliveryDeadline), 'December 12, 2026');
  });

  it('shows noon as 12:00 PM', () => {
    const music = bySlug('independent-music-performance-video');
    assert.equal(formatShootTimes(music.shootStart, music.shootEnd), '12:00 PM – 5:00 PM PST');
  });

  it('gives the estimated duration of each shoot', () => {
    assert.equal(shootSchedule(bySlug('independent-clothing-brand-launch')).duration, '4 hours');
    assert.equal(shootSchedule(bySlug('neighborhood-cafe-content-refresh')).duration, '3 hours');
    assert.equal(shootSchedule(bySlug('independent-music-performance-video')).duration, '5 hours');
    assert.equal(shootSchedule(bySlug('architecture-and-interiors-showcase')).duration, '4 hours');
    assert.equal(estimatedHours('2026-12-06T08:00:00-08:00', '2026-12-06T11:00:00-08:00'), 3);
  });
});

describe('board filters applied to the demonstration projects', () => {
  it('shows every project under the default filters', () => {
    assert.equal(slugsFor({}).length, 4);
  });

  it('filters by neighbourhood', () => {
    assert.deepEqual(slugsFor({ neighborhood: 'Echo Park' }), ['neighborhood-cafe-content-refresh']);
    assert.deepEqual(slugsFor({ neighborhood: 'Arts District' }), ['independent-clothing-brand-launch']);
  });

  it('filters by the role needed, counting projects that need both roles for either role', () => {
    assert.deepEqual(slugsFor({ role: 'photographer' }), [
      'independent-clothing-brand-launch',
      'neighborhood-cafe-content-refresh',
      'architecture-and-interiors-showcase',
    ]);
    assert.deepEqual(slugsFor({ role: 'videographer' }), [
      'independent-clothing-brand-launch',
      'independent-music-performance-video',
      'architecture-and-interiors-showcase',
    ]);
    assert.deepEqual(slugsFor({ role: 'both' }), [
      'independent-clothing-brand-launch',
      'architecture-and-interiors-showcase',
    ]);
  });

  it('filters by total budget band', () => {
    assert.deepEqual(slugsFor({ budget: 'under-1000' }), ['neighborhood-cafe-content-refresh']);
    assert.deepEqual(slugsFor({ budget: '1000-1500' }), [
      'independent-clothing-brand-launch',
      'independent-music-performance-video',
    ]);
    assert.deepEqual(slugsFor({ budget: 'over-1500' }), ['architecture-and-interiors-showcase']);
  });

  it('combines the filters, and can leave no matches', () => {
    assert.deepEqual(slugsFor({ neighborhood: 'Los Feliz', role: 'both', budget: 'over-1500' }), [
      'architecture-and-interiors-showcase',
    ]);
    assert.deepEqual(slugsFor({ neighborhood: 'Echo Park', budget: 'over-1500' }), []);
  });
});
