import type {
  CrmCustomFields,
  CrmInteractionType,
  CrmLeadSource,
  CrmLeadStatus,
} from '@lobechat/types';

/** Permanent — it is written into message history. */
export const CrmIdentifier = 'lobe-crm';

export const CrmApiName = {
  addInteraction: 'addInteraction',
  getLead: 'getLead',
  listFields: 'listFields',
  searchLeads: 'searchLeads',
  setLeadStatus: 'setLeadStatus',
  upsertLead: 'upsertLead',
} as const;

export interface SearchLeadsArgs {
  city?: string;
  limit?: number;
  query?: string;
  scoreMin?: number;
  statuses?: CrmLeadStatus[];
}

export interface GetLeadArgs {
  leadId: string;
}

export interface UpsertLeadArgs {
  category?: string;
  city?: string;
  customFields?: CrmCustomFields;
  district?: string;
  email?: string;
  name: string;
  notes?: string;
  phone?: string;
  score?: number;
  size?: number;
  /** Where each fact comes from. Required as soon as a contact is provided. */
  sources?: CrmLeadSource[];
  status?: CrmLeadStatus;
  website?: string;
  whatsapp?: string;
}

export interface AddInteractionArgs {
  content: string;
  leadId: string;
  type?: CrmInteractionType;
}

export interface SetLeadStatusArgs {
  leadId: string;
  status: CrmLeadStatus;
}

export interface LeadSummaryState {
  leadId?: string;
  /** How many leads the run has written so far, against its quota. */
  written?: number;
}
