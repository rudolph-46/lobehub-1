/**
 * Lightweight CRM shared by humans and agents: agents write leads they qualify,
 * people review, correct and export them from the app.
 */

/** Pipeline stages, ordered from first contact to outcome. */
export const CRM_LEAD_STATUSES = [
  'new',
  'qualified',
  'contacted',
  'negotiating',
  'won',
  'lost',
] as const;

export type CrmLeadStatus = (typeof CRM_LEAD_STATUSES)[number];

/**
 * Leads are shared with everyone on the instance by default — a sales pipeline
 * only works as a common one. `private` keeps a lead to its creator.
 *
 * This is deliberately *not* the workspace visibility of `agents` / `tasks`:
 * workspaces are a Cloud feature, so `buildWorkspaceWhere` would make every row
 * private to its creator in a self-hosted deployment. See `CrmLeadModel`.
 */
export const CRM_LEAD_VISIBILITIES = ['shared', 'private'] as const;

export type CrmLeadVisibility = (typeof CRM_LEAD_VISIBILITIES)[number];

/** Where a piece of information came from, so a claim can always be checked. */
export interface CrmLeadSource {
  /** ISO 8601 date the information was read. */
  capturedAt: string;
  /** 'high' when read on the lead's own site, 'low' when inferred. */
  confidence?: 'high' | 'medium' | 'low';
  /** Which lead field this source backs, e.g. `phone`. Omitted when general. */
  field?: string;
  url: string;
}

export const CRM_INTERACTION_TYPES = [
  'note',
  'call',
  'whatsapp',
  'email',
  'visit',
  'draft',
] as const;

export type CrmInteractionType = (typeof CRM_INTERACTION_TYPES)[number];

/** Custom field types a person can add from the CRM page; agents only fill them. */
export const CRM_FIELD_TYPES = ['text', 'number', 'select', 'date', 'boolean', 'url'] as const;

export type CrmFieldType = (typeof CRM_FIELD_TYPES)[number];

/** Values of user-defined fields, keyed by `crm_field_defs.key`. */
export type CrmCustomFields = Record<string, boolean | number | string | null>;
