import type { InstallMarketplaceAgentSummary } from '@lobechat/builtin-tool-web-onboarding/agentMarketplace';

import { getActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { agentService } from '@/services/agent';
import { catalogService, type CatalogTemplateDetail } from '@/services/catalog';
import { useAgentStore } from '@/store/agent';
import { useHomeStore } from '@/store/home';

export type { InstallMarketplaceAgentSummary };

export interface InstallMarketplaceAgentsResult {
  installedAgentIds: string[];
  skippedAgentIds: string[];
  summaries: InstallMarketplaceAgentSummary[];
}

export interface InstallMarketplaceAgentsOptions {
  /**
   * Override the visibility used when inserting into a workspace. Defaults to
   * `'public'` (shared with the workspace) — callers can opt into `'private'`
   * when the user explicitly wants the agent kept to themselves.
   *
   * Ignored in personal mode (the column is meaningless without a workspace).
   */
  visibility?: 'private' | 'public';
}

/**
 * Install curated-catalog agents by cloning their stored config directly.
 *
 * There is no marketplace round-trip here: the template list, the full config
 * and the dedupe key (`params.catalogIdentifier`) all come from the instance's
 * own `agent_catalog` table, so onboarding works without market credentials.
 */
export const installMarketplaceAgents = async (
  sourceAgentIds: string[],
  options?: InstallMarketplaceAgentsOptions,
): Promise<InstallMarketplaceAgentsResult> => {
  if (sourceAgentIds.length === 0) {
    return { installedAgentIds: [], skippedAgentIds: [], summaries: [] };
  }

  const createAgent = useAgentStore.getState().createAgent;
  const refreshAgentList = useHomeStore.getState().refreshAgentList;

  const workspaceId = getActiveWorkspaceId();
  const visibility = workspaceId ? (options?.visibility ?? 'public') : undefined;

  // 1. Parallel dedupe — find which templates are already installed
  const existing = await Promise.all(
    sourceAgentIds.map((id) => agentService.getAgentByCatalogIdentifier(id)),
  );
  const skippedAgentIds: string[] = [];
  const pendingSourceIds: string[] = [];
  sourceAgentIds.forEach((id, i) => {
    if (existing[i]) skippedAgentIds.push(id);
    else pendingSourceIds.push(id);
  });

  // 2. Parallel fetch catalog detail for pending ids (best-effort per item)
  const detailResults = await Promise.allSettled(
    pendingSourceIds.map((id) => catalogService.getTemplateDetail(id)),
  );

  // 3. Build install input only for items with valid detail
  const prepared: { detail: CatalogTemplateDetail; sourceId: string }[] = [];
  detailResults.forEach((result, i) => {
    const sourceId = pendingSourceIds[i];
    if (result.status !== 'fulfilled') {
      console.warn('Failed to fetch catalog agent detail:', sourceId, result.reason);
      return;
    }
    prepared.push({ detail: result.value, sourceId });
  });

  // 4. Parallel createAgent from the catalog config
  const installResults = await Promise.allSettled(
    prepared.map(async ({ detail, sourceId }) => {
      const result = await createAgent({
        config: {
          avatar: detail.avatar,
          backgroundColor: detail.backgroundColor,
          description: detail.description,
          openingMessage: detail.config.openingMessage,
          openingQuestions: detail.config.openingQuestions,
          params: { ...detail.config.params, catalogIdentifier: sourceId },
          plugins: detail.config.plugins,
          systemRole: detail.config.systemRole,
          tags: detail.config.tags,
          title: detail.title,
        },
        visibility,
      });

      return { agentId: result.agentId, sourceId };
    }),
  );

  // 5. Build summaries — preserve the original per-source ordering
  const installedBySource = new Map<string, string>();
  installResults.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      installedBySource.set(r.value.sourceId, r.value.agentId);
    } else {
      console.warn('Failed to install catalog agent:', prepared[i]?.sourceId, r.reason);
    }
  });

  const detailBySource = new Map<string, CatalogTemplateDetail>();
  prepared.forEach((p) => detailBySource.set(p.sourceId, p.detail));

  const summaries: InstallMarketplaceAgentSummary[] = sourceAgentIds.map((sourceId) => {
    if (skippedAgentIds.includes(sourceId)) {
      return { skipped: true, templateId: sourceId };
    }
    const detail = detailBySource.get(sourceId);
    return {
      avatar: detail?.avatar,
      category: detail?.category,
      description: detail?.description,
      installedAgentId: installedBySource.get(sourceId),
      skipped: false,
      templateId: sourceId,
      title: detail?.title,
    };
  });

  const installedAgentIds = Array.from(installedBySource.values());

  if (installedAgentIds.length > 0) {
    await refreshAgentList();
  }

  return { installedAgentIds, skippedAgentIds, summaries };
};
