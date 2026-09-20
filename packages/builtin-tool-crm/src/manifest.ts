import { CRM_INTERACTION_TYPES, CRM_LEAD_STATUSES, type BuiltinToolManifest } from '@lobechat/types';

import { systemPrompt } from './systemRole';
import { CrmApiName, CrmIdentifier } from './types';

const sourceSchema = {
  items: {
    additionalProperties: false,
    properties: {
      capturedAt: { description: 'ISO 8601 date the page was read', type: 'string' },
      confidence: { enum: ['high', 'medium', 'low'], type: 'string' },
      field: { description: 'Which lead field this source backs, e.g. "phone"', type: 'string' },
      url: { type: 'string' },
    },
    required: ['url', 'capturedAt'],
    type: 'object',
  },
  type: 'array',
} as const;

export const CrmManifest: BuiltinToolManifest = {
  api: [
    {
      description:
        'Search the shared CRM before writing anything, to enrich an existing lead instead of creating a duplicate.',
      name: CrmApiName.searchLeads,
      parameters: {
        additionalProperties: false,
        properties: {
          city: { description: 'Filter by city', type: 'string' },
          limit: { default: 20, maximum: 100, minimum: 1, type: 'number' },
          query: { description: 'Free text over name, city, district and notes', type: 'string' },
          scoreMin: { maximum: 5, minimum: 1, type: 'number' },
          statuses: { items: { enum: [...CRM_LEAD_STATUSES], type: 'string' }, type: 'array' },
        },
        required: [],
        type: 'object',
      },
    },
    {
      description: 'Read one lead in full, with its latest interactions.',
      name: CrmApiName.getLead,
      parameters: {
        additionalProperties: false,
        properties: { leadId: { type: 'string' } },
        required: ['leadId'],
        type: 'object',
      },
    },
    {
      description:
        'Create a lead, or enrich the existing one with the same name and city. Only the fields provided are written. Any contact detail requires a matching entry in sources.',
      name: CrmApiName.upsertLead,
      parameters: {
        additionalProperties: false,
        properties: {
          category: { description: 'e.g. hotel, guesthouse, serviced apartments', type: 'string' },
          city: { type: 'string' },
          customFields: {
            description: 'Values of the custom fields returned by listFields, keyed by field key',
            type: 'object',
          },
          district: { type: 'string' },
          email: { type: 'string' },
          name: { type: 'string' },
          notes: { description: 'Why this lead scores what it scores, and the angle', type: 'string' },
          phone: { type: 'string' },
          score: { description: '1 weak fit … 5 ideal customer', maximum: 5, minimum: 1, type: 'number' },
          size: { description: 'Size of the business, e.g. number of rooms', type: 'number' },
          sources: sourceSchema,
          status: { enum: [...CRM_LEAD_STATUSES], type: 'string' },
          website: { type: 'string' },
          whatsapp: { type: 'string' },
        },
        required: ['name'],
        type: 'object',
      },
    },
    {
      description:
        'Record something that happened with a lead: a note, a call, a visit, or a draft message awaiting human sending.',
      name: CrmApiName.addInteraction,
      parameters: {
        additionalProperties: false,
        properties: {
          content: { type: 'string' },
          leadId: { type: 'string' },
          type: { enum: [...CRM_INTERACTION_TYPES], type: 'string' },
        },
        required: ['leadId', 'content'],
        type: 'object',
      },
    },
    {
      description: 'Move a lead along the pipeline. Only with evidence for the new status.',
      name: CrmApiName.setLeadStatus,
      parameters: {
        additionalProperties: false,
        properties: {
          leadId: { type: 'string' },
          status: { enum: [...CRM_LEAD_STATUSES], type: 'string' },
        },
        required: ['leadId', 'status'],
        type: 'object',
      },
    },
    {
      description:
        'List the custom lead fields defined by the team, so they can be filled through upsertLead.customFields.',
      name: CrmApiName.listFields,
      parameters: { additionalProperties: false, properties: {}, required: [], type: 'object' },
    },
  ],
  identifier: CrmIdentifier,
  meta: {
    avatar: '📇',
    description: 'Shared CRM of leads: search, create, enrich and follow up',
    title: 'CRM',
  },
  systemRole: systemPrompt,
  type: 'builtin',
};
