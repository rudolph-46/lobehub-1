import {
  type AgentTemplate,
  type AgentTemplateFetcher,
  normalizeAgentTemplate,
  type RawAgentTemplate,
} from '@lobechat/builtin-tool-web-onboarding/agentMarketplace';

import { catalogService } from '@/services/catalog';

/**
 * Serves the onboarding picker from the instance's own agent catalog
 * (`agent_catalog` table) — the marketplace is never contacted.
 */
export const fetchOnboardingAgentTemplates: AgentTemplateFetcher = async (options) => {
  const data = await catalogService.getOnboardingFull({ signal: options?.signal });
  if (!data || typeof data !== 'object') return [];

  const templates: AgentTemplate[] = [];
  for (const [category, items] of Object.entries(data)) {
    if (!Array.isArray(items)) continue;
    for (const item of items as RawAgentTemplate[]) {
      const normalized = normalizeAgentTemplate(item, category);
      if (normalized) templates.push(normalized);
    }
  }
  return templates;
};
