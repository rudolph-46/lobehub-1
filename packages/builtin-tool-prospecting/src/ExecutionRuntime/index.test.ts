import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProspectingExecutionRuntime } from './index';

describe('ProspectingExecutionRuntime', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fails clearly when APIFY_API_TOKEN is missing', async () => {
    const runtime = new ProspectingExecutionRuntime();

    const result = await runtime.findLocalBusinesses({ query: 'hotels' });

    expect(result.success).toBe(false);
    expect(result.content).toContain('APIFY_API_TOKEN');
  });

  it('maps findLocalBusinesses to the Google Places actor', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify([{ title: 'Hotel A', website: 'https://a.example' }]), {
        status: 201,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const runtime = new ProspectingExecutionRuntime({ token: 'token-1' });
    const result = await runtime.findLocalBusinesses({
      limit: 5,
      location: 'Douala',
      query: 'independent hotels',
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('Hotel A');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toContain('compass~crawler-google-places');
    expect(init).toEqual(
      expect.objectContaining({
        body: JSON.stringify({
          maxCrawledPlacesPerSearch: 5,
          searchStringsArray: ['independent hotels Douala'],
        }),
        method: 'POST',
      }),
    );
  });

  it('normalizes slash actor ids for advanced runs', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify([{ ok: true }]), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const runtime = new ProspectingExecutionRuntime({ token: 'token-1' });
    await runtime.runActor({ actorId: 'apify/website-content-crawler', input: { url: 'x' } });

    const [url] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toContain('apify~website-content-crawler');
  });

  it('returns Apify errors as tool failures with state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ error: { message: 'Actor not found' } }), {
          status: 404,
        });
      }),
    );

    const runtime = new ProspectingExecutionRuntime({ token: 'token-1' });
    const result = await runtime.runActor({ actorId: 'missing/actor' });

    expect(result.success).toBe(false);
    expect(result.content).toBe('Actor not found');
    expect(result.state).toMatchObject({ actorId: 'missing/actor', itemCount: 0 });
  });
});
