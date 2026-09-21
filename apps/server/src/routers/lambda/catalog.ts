import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { AgentCatalogModel } from '@/database/models/agentCatalog';
import { authedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

/**
 * Instance-wide, admin-curated agent catalog. The onboarding picker lists rows
 * from the `agent_catalog` table and installs them by cloning `config` —
 * `market.lobehub.com` is never contacted for this flow.
 */
const catalogProcedure = authedProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;

  return opts.next({
    ctx: { agentCatalogModel: new AgentCatalogModel(ctx.serverDB) },
  });
});

/** Light shape the picker renders; mirrors the marketplace response format. */
export interface CatalogTemplateSummary {
  avatar?: string;
  description?: string;
  identifier: string;
  name: string;
}

/** Everything the installer needs to materialise the agent. */
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

const nullToUndefined = (value: string | null): string | undefined => value ?? undefined;

export const catalogRouter = router({
  /**
   * Full curated catalog for the onboarding picker, grouped by category slug
   * exactly like the marketplace `onboarding-full` response it replaces.
   */
  getOnboardingFull: catalogProcedure.query(async ({ ctx }) => {
    const items = await ctx.agentCatalogModel.listEnabled();

    const grouped: Record<string, CatalogTemplateSummary[]> = {};
    for (const item of items) {
      (grouped[item.category] ??= []).push({
        avatar: nullToUndefined(item.avatar),
        description: nullToUndefined(item.description),
        identifier: item.identifier,
        name: item.title,
      });
    }

    return grouped;
  }),

  /**
   * Install payload for one catalog template. Falls back to `NOT_FOUND` so the
   * caller can warn and skip instead of failing the whole batch.
   */
  getTemplateDetail: catalogProcedure
    .input(z.object({ identifier: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const item = await ctx.agentCatalogModel.findDetailByIdentifier(input.identifier);
      if (!item) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Template introuvable dans le catalogue : ${input.identifier}`,
        });
      }

      const detail: CatalogTemplateDetail = {
        avatar: nullToUndefined(item.avatar),
        backgroundColor: nullToUndefined(item.backgroundColor),
        category: item.category,
        config: item.config ?? {},
        description: nullToUndefined(item.description),
        identifier: item.identifier,
        title: item.title,
      };

      return detail;
    }),
});
