import type { BuiltinToolManifest } from '@lobechat/types';

import { systemPrompt } from './systemRole';
import { ProspectingApiName, ProspectingIdentifier } from './types';

export const ProspectingManifest: BuiltinToolManifest = {
  api: [
    {
      description:
        'Find local business prospects from a search query and optional location. Use this for B2B local prospecting such as hotels, restaurants, clinics, agencies, stores, venues, or service businesses.',
      name: ProspectingApiName.findLocalBusinesses,
      parameters: {
        additionalProperties: false,
        properties: {
          limit: {
            description: 'Maximum number of businesses to return. Default 20, maximum 100.',
            type: 'number',
          },
          location: {
            description: 'Optional geography such as city, country, neighborhood, or region.',
            type: 'string',
          },
          query: {
            description:
              'Business category or search phrase, e.g. "independent hotels", "dental clinics", "premium restaurants".',
            type: 'string',
          },
        },
        required: ['query'],
        type: 'object',
      },
    },
    {
      description:
        'Retrieve public review and reputation signals for a known Google Maps place URL. Use this to qualify pain points, quality, recency, and customer sentiment.',
      name: ProspectingApiName.getBusinessReviews,
      parameters: {
        additionalProperties: false,
        properties: {
          limit: {
            description: 'Maximum number of reviews to return. Default 30, maximum 100.',
            type: 'number',
          },
          placeUrl: {
            description: 'Google Maps place URL for the business.',
            type: 'string',
          },
        },
        required: ['placeUrl'],
        type: 'object',
      },
    },
    {
      description:
        'Enrich business records with contact details such as emails, phone numbers, websites, and social links. Use after finding promising prospects, not before.',
      name: ProspectingApiName.enrichBusinessContacts,
      parameters: {
        additionalProperties: false,
        properties: {
          datasetId: {
            description:
              'Optional Apify dataset id from a previous local business search, if available.',
            type: 'string',
          },
          limit: {
            description: 'Maximum number of records to enrich. Default 20, maximum 100.',
            type: 'number',
          },
          places: {
            description:
              'Business records to enrich. Include at least names and websites/Google Maps URLs when available.',
            items: { type: 'object' },
            type: 'array',
          },
        },
        required: ['places'],
        type: 'object',
      },
    },
    {
      description:
        "Read a prospect's website as structured text/markdown. Use this to understand services, positioning, contact pages, prices, team pages, and qualification signals.",
      name: ProspectingApiName.readWebsite,
      parameters: {
        additionalProperties: false,
        properties: {
          maxCrawlPages: {
            description:
              'Maximum number of pages to crawl from the website. Default 10, maximum 50.',
            type: 'number',
          },
          url: {
            description: 'Absolute website URL to read.',
            type: 'string',
          },
        },
        required: ['url'],
        type: 'object',
      },
    },
    {
      description:
        'Search the web for public information, market intelligence, competitor discovery, or validation. Prefer findLocalBusinesses for local prospect lists.',
      name: ProspectingApiName.searchWeb,
      parameters: {
        additionalProperties: false,
        properties: {
          limit: {
            description: 'Maximum number of results to return. Default 10, maximum 50.',
            type: 'number',
          },
          query: {
            description: 'Search query.',
            type: 'string',
          },
        },
        required: ['query'],
        type: 'object',
      },
    },
    {
      description:
        'Advanced fallback: run a specific Apify actor by id with custom input. Use only when the business capability APIs are insufficient.',
      name: ProspectingApiName.runActor,
      parameters: {
        additionalProperties: false,
        properties: {
          actorId: {
            description:
              'Actor id in owner/actor-name or owner~actor-name form, e.g. apify/website-content-crawler.',
            type: 'string',
          },
          input: {
            additionalProperties: true,
            description: 'Actor input JSON.',
            type: 'object',
          },
          limit: {
            description: 'Maximum number of dataset items to return. Default 20, maximum 100.',
            type: 'number',
          },
        },
        required: ['actorId'],
        type: 'object',
      },
    },
  ],
  identifier: ProspectingIdentifier,
  meta: {
    avatar: '🎯',
    description:
      'Find prospects, qualify businesses, read websites, enrich contacts, and monitor markets using structured web data.',
    readme:
      'Prospecting gives agents business-oriented discovery and enrichment actions powered by Apify actors without exposing implementation details to end users.',
    title: 'Prospecting',
  },
  systemRole: systemPrompt,
  type: 'builtin',
};
