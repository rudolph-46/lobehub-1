import { CrmIdentifier } from '@lobechat/builtin-tool-crm';
import {
  CrmExecutionRuntime,
  type CrmToolService,
} from '@lobechat/builtin-tool-crm/executionRuntime';

import { CrmFieldDefModel } from '@/database/models/crmFieldDef';
import { CrmLeadModel } from '@/database/models/crmLead';

import { type ServerRuntimeRegistration } from './types';

/**
 * Binds the CRM tool to the database. Writes are attributed to the agent that
 * made them (`createdByAgentId`, interaction author), so a person reviewing the
 * pipeline always knows where a row came from.
 */
export const crmRuntime: ServerRuntimeRegistration = {
  factory: (context) => {
    if (!context.userId || !context.serverDB)
      throw new Error('userId and serverDB are required for CRM execution');

    const leadModel = new CrmLeadModel(context.serverDB, context.userId);
    const fieldDefModel = new CrmFieldDefModel(context.serverDB, context.userId);
    const agentId = context.agentId ?? undefined;

    const service: CrmToolService = {
      addInteraction: async ({ content, leadId, type }) => {
        await leadModel.addInteraction({
          authorId: agentId,
          authorType: agentId ? 'agent' : 'user',
          content,
          leadId,
          type,
        });
      },
      getLead: async (leadId) => {
        const lead = await leadModel.findById(leadId);
        if (!lead) return undefined;

        const interactions = await leadModel.listInteractions(leadId, 10);
        return { ...lead, interactions };
      },
      listFields: async () => {
        const fields = await fieldDefModel.list();
        return fields.map(({ key, label, options, type }) => ({ key, label, options, type }));
      },
      searchLeads: async ({ city, limit, query, scoreMin, statuses }) =>
        leadModel.list({ city, limit: limit ?? 20, q: query, scoreMin, statuses }),
      setLeadStatus: async ({ leadId, status }) => leadModel.update(leadId, { status }),
      upsertLead: async (args) => leadModel.upsert({ ...args, createdByAgentId: agentId }),
    };

    return new CrmExecutionRuntime(service);
  },
  identifier: CrmIdentifier,
};
