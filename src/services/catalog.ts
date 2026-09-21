import { lambdaClient } from '@/libs/trpc/client';

export interface CatalogTemplateDetail {
  avatar?: string;
  backgroundColor?: string;
  category: string;
  config: {
    openingMessage?: string;
    openingQuestions?: string[];
    params?: Record<string, unknown>;
    plugins?: string[];
    systemRole?: string;
    tags?: string[];
  };
  description?: string;
  identifier: string;
  title: string;
}

/**
 * Client for the instance-wide agent catalog. The onboarding picker lists
 * catalog rows and installs them by cloning their config — no marketplace is
 * involved, so a self-hosted deployment never depends on `market.lobehub.com`.
 */
class CatalogService {
  /** Catalog grouped by category slug, shaped like the marketplace response. */
  getOnboardingFull = (options?: { signal?: AbortSignal }) =>
    lambdaClient.catalog.getOnboardingFull.query(undefined, { signal: options?.signal });

  /** Install payload for one template; `NOT_FOUND` when the id is unknown. */
  getTemplateDetail = (identifier: string) =>
    lambdaClient.catalog.getTemplateDetail.query({ identifier });
}

export const catalogService = new CatalogService();
