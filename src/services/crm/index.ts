import type {
  CrmFieldType,
  CrmInteractionType,
  CrmLeadStatus,
  CrmLeadVisibility,
} from '@lobechat/types';

import { lambdaClient } from '@/libs/trpc/client';

export interface LeadListParams {
  city?: string;
  limit?: number;
  offset?: number;
  q?: string;
  scoreMin?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'score';
  sortOrder?: 'asc' | 'desc';
  statuses?: CrmLeadStatus[];
}

class CrmService {
  list = (params: LeadListParams = {}) => lambdaClient.crm.list.query(params);

  get = (id: string) => lambdaClient.crm.get.query({ id });

  countByStatus = () => lambdaClient.crm.countByStatus.query();

  /** Everything the caller can read, plus the custom field definitions. */
  export = (params: LeadListParams = {}) => lambdaClient.crm.export.query(params);

  update = (id: string, value: Record<string, unknown>) =>
    lambdaClient.crm.update.mutate({ id, ...value });

  updateStatus = (id: string, status: CrmLeadStatus) =>
    lambdaClient.crm.updateStatus.mutate({ id, status });

  setVisibility = (id: string, visibility: CrmLeadVisibility) =>
    lambdaClient.crm.setVisibility.mutate({ id, visibility });

  delete = (id: string) => lambdaClient.crm.delete.mutate({ id });

  addInteraction = (leadId: string, content: string, type?: CrmInteractionType) =>
    lambdaClient.crm.addInteraction.mutate({ content, leadId, type });

  listFieldDefs = () => lambdaClient.crm.listFieldDefs.query();

  createFieldDef = (params: { label: string; options?: string[]; type?: CrmFieldType }) =>
    lambdaClient.crm.createFieldDef.mutate(params);

  deleteFieldDef = (id: string) => lambdaClient.crm.deleteFieldDef.mutate({ id });
}

export const crmService = new CrmService();
