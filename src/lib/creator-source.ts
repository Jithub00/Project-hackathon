import { api, ApiError } from '@/lib/api';

/**
 * Creator pages normally read from the live Photo Shoot server. If that server does not answer this address (a static host,
 * a dev proxy with nothing behind it, or a network failure), they show the example creators bundled in public/demo-data
 * instead, and the page says so. A JSON error from the live server is never replaced.
 */

export interface CreatorSource<T> {
  data: T;
  /** True when the example creators were shown in place of the live server's answer. */
  sample: boolean;
  /** Why the live server did not answer, written for the notice. Null when the live server answered. */
  reason: string | null;
}

interface ExampleCreators {
  list: unknown;
  profiles: Record<string, unknown>;
}

let examples: Promise<ExampleCreators> | null = null;

function loadExamples(): Promise<ExampleCreators> {
  examples ??= fetch('/demo-data/creators.json').then(async (response) => {
    if (!response.ok) throw new Error('The example creators could not be loaded.');
    return (await response.json()) as ExampleCreators;
  });
  return examples;
}

/** True when the live server did not answer at all, rather than answering with an error of its own. */
export function serverUnavailable(error: unknown): error is ApiError {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 0) return true;
  return error.code === 'ERROR' && (error.status === 404 || error.status >= 500);
}

function reasonFor(error: ApiError): string {
  if (error.status === 0) return 'The live Photo Shoot server could not be reached';
  if (error.status === 404) return 'The live Photo Shoot server did not answer this address (404)';
  return `The live Photo Shoot server returned an error (${error.status})`;
}

/** The creators list. Filters cannot be applied to the example list, so it is returned unfiltered. */
export async function fetchCreatorList<T>(path: string): Promise<CreatorSource<T>> {
  try {
    return { data: await api.get<T>(path), sample: false, reason: null };
  } catch (error) {
    if (!serverUnavailable(error)) throw error;
    const bundled = await loadExamples();
    return { data: bundled.list as T, sample: true, reason: reasonFor(error) };
  }
}

/** One creator profile. Only the eight example creators have a bundled profile; any other id keeps the live error. */
export async function fetchCreatorProfile<T>(id: string, path: string): Promise<CreatorSource<T>> {
  try {
    return { data: await api.get<T>(path), sample: false, reason: null };
  } catch (error) {
    if (!serverUnavailable(error)) throw error;
    const bundled = await loadExamples();
    const profile = bundled.profiles[id];
    if (!profile) throw error;
    return { data: profile as T, sample: true, reason: reasonFor(error) };
  }
}
