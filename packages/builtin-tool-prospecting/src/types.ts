export const ProspectingIdentifier = 'lobe-prospecting';

export const ProspectingApiName = {
  enrichBusinessContacts: 'enrichBusinessContacts',
  findLocalBusinesses: 'findLocalBusinesses',
  getBusinessReviews: 'getBusinessReviews',
  readWebsite: 'readWebsite',
  runActor: 'runActor',
  searchWeb: 'searchWeb',
} as const;

export type ProspectingApiNameType = (typeof ProspectingApiName)[keyof typeof ProspectingApiName];

export interface FindLocalBusinessesParams {
  limit?: number;
  location?: string;
  query: string;
}

export interface GetBusinessReviewsParams {
  limit?: number;
  placeUrl: string;
}

export interface EnrichBusinessContactsParams {
  datasetId?: string;
  limit?: number;
  places: Record<string, unknown>[];
}

export interface ReadWebsiteParams {
  maxCrawlPages?: number;
  url: string;
}

export interface SearchWebParams {
  limit?: number;
  query: string;
}

export interface RunActorParams {
  actorId: string;
  input?: Record<string, unknown>;
  limit?: number;
}

export interface ProspectingActorState {
  actorId: string;
  itemCount: number;
  items: unknown[];
}
