import type { BuiltinServerRuntimeOutput } from '@lobechat/types';

import {
  type EnrichBusinessContactsParams,
  type FindLocalBusinessesParams,
  type GetBusinessReviewsParams,
  ProspectingApiName,
  type ReadWebsiteParams,
  type RunActorParams,
  type SearchWebParams,
} from '../types';

const APIFY_API_BASE = 'https://api.apify.com/v2';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const CONTENT_LIMIT = 12_000;

export interface ProspectingRuntimeOptions {
  token?: string;
}

interface ActorRunOptions {
  actorId: string;
  input: Record<string, unknown>;
  limit?: number;
}

export class ProspectingExecutionRuntime {
  private token?: string;

  constructor(options: ProspectingRuntimeOptions = {}) {
    this.token = options.token;
  }

  findLocalBusinesses = async (
    args: FindLocalBusinessesParams,
  ): Promise<BuiltinServerRuntimeOutput> => {
    const searchStringsArray = [args.location ? `${args.query} ${args.location}` : args.query];

    return this.runMappedActor({
      actorId: 'compass/crawler-google-places',
      input: {
        maxCrawledPlacesPerSearch: this.limit(args.limit),
        searchStringsArray,
      },
      label: ProspectingApiName.findLocalBusinesses,
      limit: args.limit,
    });
  };

  getBusinessReviews = async (
    args: GetBusinessReviewsParams,
  ): Promise<BuiltinServerRuntimeOutput> => {
    return this.runMappedActor({
      actorId: 'compass/Google-Maps-Reviews-Scraper',
      input: {
        maxReviews: this.limit(args.limit, 30),
        startUrls: [{ url: args.placeUrl }],
      },
      label: ProspectingApiName.getBusinessReviews,
      limit: args.limit,
    });
  };

  enrichBusinessContacts = async (
    args: EnrichBusinessContactsParams,
  ): Promise<BuiltinServerRuntimeOutput> => {
    return this.runMappedActor({
      actorId: 'compass/enrich-google-maps-dataset-with-contacts',
      input: {
        datasetId: args.datasetId,
        maxItems: this.limit(args.limit),
        places: args.places,
      },
      label: ProspectingApiName.enrichBusinessContacts,
      limit: args.limit,
    });
  };

  readWebsite = async (args: ReadWebsiteParams): Promise<BuiltinServerRuntimeOutput> => {
    return this.runMappedActor({
      actorId: 'apify/website-content-crawler',
      input: {
        maxCrawlPages: this.limit(args.maxCrawlPages, 10, 50),
        startUrls: [{ url: args.url }],
      },
      label: ProspectingApiName.readWebsite,
      limit: args.maxCrawlPages,
    });
  };

  searchWeb = async (args: SearchWebParams): Promise<BuiltinServerRuntimeOutput> => {
    return this.runMappedActor({
      actorId: 'apify/google-search-scraper',
      input: {
        maxPagesPerQuery: 1,
        queries: args.query,
        resultsPerPage: this.limit(args.limit, 10, 50),
      },
      label: ProspectingApiName.searchWeb,
      limit: args.limit,
    });
  };

  runActor = async (args: RunActorParams): Promise<BuiltinServerRuntimeOutput> => {
    return this.runMappedActor({
      actorId: args.actorId,
      input: args.input ?? {},
      label: ProspectingApiName.runActor,
      limit: args.limit,
    });
  };

  private async runMappedActor({
    actorId,
    input,
    label,
    limit,
  }: ActorRunOptions & { label: string }): Promise<BuiltinServerRuntimeOutput> {
    if (!this.token) {
      return {
        content: 'APIFY_API_TOKEN is required to use Prospecting tools.',
        error: { message: 'APIFY_API_TOKEN is required' },
        success: false,
      };
    }

    try {
      const normalizedActorId = this.normalizeActorId(actorId);
      const url = new URL(
        `${APIFY_API_BASE}/acts/${encodeURIComponent(normalizedActorId)}/run-sync-get-dataset-items`,
      );
      url.searchParams.set('token', this.token);
      url.searchParams.set('clean', 'true');
      url.searchParams.set('format', 'json');

      const response = await fetch(url, {
        body: JSON.stringify(input),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      const text = await response.text();
      const parsed = text ? (JSON.parse(text) as unknown) : [];

      if (!response.ok) {
        const message =
          this.errorMessage(parsed) || `Apify actor failed with HTTP ${response.status}`;
        return {
          content: message,
          error: { body: parsed, message },
          state: { actorId, items: [], itemCount: 0 },
          success: false,
        };
      }

      const rawItems = Array.isArray(parsed) ? parsed : [parsed];
      const items = rawItems.slice(0, this.limit(limit));
      const content = this.formatItems({ actorId, items, label, total: rawItems.length });

      return {
        content,
        state: {
          actorId,
          itemCount: rawItems.length,
          items,
        },
        success: true,
      };
    } catch (error) {
      return {
        content: (error as Error).message,
        error,
        success: false,
      };
    }
  }

  private normalizeActorId(actorId: string) {
    return actorId.replaceAll('/', '~');
  }

  private limit(value: unknown, fallback = DEFAULT_LIMIT, max = MAX_LIMIT) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(1, Math.min(Math.floor(value), max));
  }

  private errorMessage(value: unknown) {
    if (typeof value !== 'object' || value === null) return undefined;
    const record = value as Record<string, unknown>;
    const error = record.error;
    if (typeof error === 'object' && error !== null) {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === 'string') return message;
    }
    if (typeof error === 'string') return error;
    return undefined;
  }

  private formatItems({
    actorId,
    items,
    label,
    total,
  }: {
    actorId: string;
    items: unknown[];
    label: string;
    total: number;
  }) {
    const body = JSON.stringify(items, null, 2).slice(0, CONTENT_LIMIT);
    const suffix =
      total > items.length ? `\n\nReturned first ${items.length} of ${total} items.` : '';
    return `<prospecting_result action="${label}" actor="${actorId}" count="${total}">\n${body}${suffix}\n</prospecting_result>`;
  }
}
