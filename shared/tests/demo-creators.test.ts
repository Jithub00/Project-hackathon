import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

// The example creators the site shows when the live server does not answer (public/demo-data/creators.json).
const publicDir = fileURLToPath(new URL('../../public', import.meta.url));
const snapshotText = readFileSync(path.join(publicDir, 'demo-data', 'creators.json'), 'utf8');
const snapshot = JSON.parse(snapshotText) as { list: { creators: Array<{ id: string; name: string }> }; profiles: Record<string, unknown> };

describe('bundled example creators', () => {
  it('lists creators and bundles a profile for each of them', () => {
    assert.ok(snapshot.list.creators.length > 0, 'the example list is empty');
    for (const creator of snapshot.list.creators) {
      assert.ok(snapshot.profiles[creator.id], `no profile bundled for ${creator.name}`);
    }
  });

  it('keeps every posting image inside the repository', () => {
    const images = new Set(snapshotText.match(/\/images\/samples\/[^"\\]+/g) ?? []);
    assert.ok(images.size > 0, 'the examples reference no posting images');
    for (const src of images) {
      assert.ok(existsSync(path.join(publicDir, src)), `missing posting image ${src}`);
    }
  });

  it('contains no email addresses', () => {
    assert.equal(snapshotText.includes('"email"'), false);
  });
});
