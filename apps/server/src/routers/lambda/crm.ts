import {
  CRM_FIELD_TYPES,
  CRM_INTERACTION_TYPES,
  CRM_LEAD_STATUSES,
  CRM_LEAD_VISIBILITIES,
} from '@lobechat/types';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { CrmFieldDefModel } from '@/database/models/crmFieldDef';
import { CrmLeadModel } from '@/database/models/crmLead';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

/**
 * Mini CRM. Leads are shared across the instance by default (see `CrmLeadModel`
 * for why this does not reuse the workspace visibility helper); a lead can be
 * made private to its creator, and only its creator may delete it.
 */
const crmProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;

  return opts.next({
    ctx: {
      crmFieldDefModel: new CrmFieldDefModel(ctx.serverDB, ctx.userId),
      crmLeadModel: new CrmLeadModel(ctx.serverDB, ctx.userId),
    },
  });
});

const listInput = z.object({
  city: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
  q: z.string().optional(),
  scoreMin: z.number().int().min(1).max(5).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'score']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  statuses: z.array(z.enum(CRM_LEAD_STATUSES)).max(6).optional(),
});

const sourceSchema = z.object({
  capturedAt: z.string(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  field: z.string().optional(),
  url: z.string().url(),
});

const upsertInput = z.object({
  category: z.string().nullish(),
  city: z.string().nullish(),
  createdByAgentId: z.string().optional(),
  customFields: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
  district: z.string().nullish(),
  email: z.string().nullish(),
  name: z.string().min(1).max(255),
  notes: z.string().nullish(),
  phone: z.string().nullish(),
  score: z.number().int().min(1).max(5).nullish(),
  size: z.number().int().min(0).nullish(),
  sources: z.array(sourceSchema).max(50).optional(),
  status: z.enum(CRM_LEAD_STATUSES).optional(),
  visibility: z.enum(CRM_LEAD_VISIBILITIES).optional(),
  website: z.string().nullish(),
  whatsapp: z.string().nullish(),
});

/** Model errors are already written for a human; surface them as-is. */
const asTrpcError = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const code = message.includes('introuvable')
    ? 'NOT_FOUND'
    : message.includes('Seul le créateur') || message.includes('privé')
      ? 'FORBIDDEN'
      : 'BAD_REQUEST';

  return new TRPCError({ cause: error, code, message });
};

export const crmRouter = router({
  addInteraction: crmProcedure
    .input(
      z.object({
        content: z.string().min(1).max(10_000),
        leadId: z.string(),
        type: z.enum(CRM_INTERACTION_TYPES).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.crmLeadModel.addInteraction(input);
      } catch (error) {
        throw asTrpcError(error, "Impossible d'ajouter l'interaction");
      }
    }),

  countByStatus: crmProcedure.query(async ({ ctx }) => ctx.crmLeadModel.countByStatus()),

  createFieldDef: crmProcedure
    .input(
      z.object({
        label: z.string().min(1).max(60),
        options: z.array(z.string().max(120)).max(50).optional(),
        sortOrder: z.number().int().optional(),
        type: z.enum(CRM_FIELD_TYPES).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.crmFieldDefModel.create(input);
      } catch (error) {
        throw asTrpcError(error, 'Impossible de créer le champ');
      }
    }),

  delete: crmProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    try {
      const lead = await ctx.crmLeadModel.delete(input.id);
      return { id: lead.id, name: lead.name };
    } catch (error) {
      throw asTrpcError(error, 'Impossible de supprimer le lead');
    }
  }),

  deleteFieldDef: crmProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => ctx.crmFieldDefModel.delete(input.id)),

  /** Everything the caller can read, for CSV / JSON download. */
  export: crmProcedure.input(listInput.partial()).query(async ({ ctx, input }) => {
    const [leads, fields] = await Promise.all([
      ctx.crmLeadModel.exportAll(input),
      ctx.crmFieldDefModel.list(),
    ]);

    return { fields, leads };
  }),

  get: crmProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const lead = await ctx.crmLeadModel.findById(input.id);
    if (!lead)
      throw new TRPCError({ code: 'NOT_FOUND', message: `Lead introuvable : ${input.id}` });

    const interactions = await ctx.crmLeadModel.listInteractions(input.id);
    return { ...lead, interactions };
  }),

  list: crmProcedure.input(listInput).query(async ({ ctx, input }) => ctx.crmLeadModel.list(input)),

  listFieldDefs: crmProcedure.query(async ({ ctx }) => ctx.crmFieldDefModel.list()),

  listInteractions: crmProcedure
    .input(z.object({ leadId: z.string(), limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      try {
        return await ctx.crmLeadModel.listInteractions(input.leadId, input.limit);
      } catch (error) {
        throw asTrpcError(error, 'Impossible de lire les interactions');
      }
    }),

  setVisibility: crmProcedure
    .input(z.object({ id: z.string(), visibility: z.enum(CRM_LEAD_VISIBILITIES) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.crmLeadModel.update(input.id, { visibility: input.visibility });
      } catch (error) {
        throw asTrpcError(error, 'Impossible de changer la visibilité');
      }
    }),

  update: crmProcedure
    .input(upsertInput.partial().extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...value } = input;
      try {
        return await ctx.crmLeadModel.update(id, value);
      } catch (error) {
        throw asTrpcError(error, 'Impossible de modifier le lead');
      }
    }),

  updateFieldDef: crmProcedure
    .input(
      z.object({
        id: z.string(),
        label: z.string().min(1).max(60).optional(),
        options: z.array(z.string().max(120)).max(50).optional(),
        sortOrder: z.number().int().optional(),
        type: z.enum(CRM_FIELD_TYPES).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...value } = input;
      return ctx.crmFieldDefModel.update(id, value);
    }),

  updateStatus: crmProcedure
    .input(z.object({ id: z.string(), status: z.enum(CRM_LEAD_STATUSES) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.crmLeadModel.update(input.id, { status: input.status });
      } catch (error) {
        throw asTrpcError(error, 'Impossible de changer le statut');
      }
    }),

  /** Create or enrich by `name|city`: re-qualifying never creates a duplicate. */
  upsert: crmProcedure.input(upsertInput).mutation(async ({ ctx, input }) => {
    try {
      return await ctx.crmLeadModel.upsert(input);
    } catch (error) {
      throw asTrpcError(error, "Impossible d'enregistrer le lead");
    }
  }),
});
