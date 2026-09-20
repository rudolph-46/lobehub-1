import type {
  CrmCustomFields,
  CrmFieldType,
  CrmInteractionType,
  CrmLeadSource,
  CrmLeadStatus,
  CrmLeadVisibility,
} from '@lobechat/types';
import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { idGenerator } from '../utils/idGenerator';
import { createdAt, timestamps, varchar255 } from './_helpers';
import { agents } from './agent';
import { users } from './user';
import { workspaces } from './workspace';

/**
 * Sales leads written by agents and reviewed by people.
 *
 * Scope is CRM-specific on purpose: workspaces are a Cloud feature, so the
 * shared `buildWorkspaceWhere` helper would make every row private to its
 * creator on a self-hosted instance. `visibility` drives sharing instead —
 * `shared` (the default) means every signed-in user of the instance, `private`
 * means the creator only. `workspaceId` is kept so the rows can be scoped to a
 * workspace later without a migration.
 */
export const crmLeads = pgTable(
  'crm_leads',
  {
    id: text('id')
      .$defaultFn(() => idGenerator('crmLeads'))
      .primaryKey()
      .notNull(),

    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Which agent created the lead, when it was not a person. */
    createdByAgentId: text('created_by_agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),

    name: varchar255('name').notNull(),
    category: varchar255('category'),
    city: varchar255('city'),
    district: varchar255('district'),
    /** Size of the business, e.g. number of rooms for a hotel. */
    size: integer('size'),

    phone: varchar255('phone'),
    whatsapp: varchar255('whatsapp'),
    email: varchar255('email'),
    website: text('website'),

    /** 1 (weak fit) to 5 (ideal customer). */
    score: integer('score'),
    status: text('status').$type<CrmLeadStatus>().default('new').notNull(),
    notes: text('notes'),

    /** Where each claim comes from; a contact without a source is not trusted. */
    sources: jsonb('sources').$type<CrmLeadSource[]>().default([]).notNull(),
    /** Values of user-defined fields, keyed by `crm_field_defs.key`. */
    customFields: jsonb('custom_fields').$type<CrmCustomFields>().default({}).notNull(),

    /**
     * Normalized `name|city`, unique per owner scope: re-qualifying the same
     * business updates the lead instead of creating a duplicate.
     */
    dedupeKey: text('dedupe_key').notNull(),

    visibility: text('visibility').$type<CrmLeadVisibility>().default('shared').notNull(),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('crm_leads_dedupe_key_idx').on(t.dedupeKey),
    index('crm_leads_status_score_idx').on(t.status, t.score),
    index('crm_leads_city_idx').on(t.city),
    index('crm_leads_visibility_user_idx').on(t.visibility, t.userId),
    index('crm_leads_custom_fields_idx').using('gin', t.customFields),
    check('crm_leads_name_not_empty', sql`length(btrim(${t.name})) > 0`),
    check('crm_leads_score_range', sql`${t.score} IS NULL OR (${t.score} >= 1 AND ${t.score} <= 5)`),
    check('crm_leads_custom_fields_object', sql`jsonb_typeof(${t.customFields}) = 'object'`),
  ],
);

export type NewCrmLead = typeof crmLeads.$inferInsert;
export type CrmLeadItem = typeof crmLeads.$inferSelect;

/** Anything that happened with a lead: notes, calls, and drafts awaiting sending. */
export const crmInteractions = pgTable(
  'crm_interactions',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),

    leadId: text('lead_id')
      .references(() => crmLeads.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    type: text('type').$type<CrmInteractionType>().default('note').notNull(),
    content: text('content').notNull(),
    /** `agent` when written by an agent run, `user` when written by a person. */
    authorType: text('author_type').$type<'agent' | 'user'>().default('user').notNull(),
    authorId: text('author_id'),

    createdAt: createdAt(),
  },
  (t) => [index('crm_interactions_lead_id_idx').on(t.leadId, t.createdAt)],
);

export type NewCrmInteraction = typeof crmInteractions.$inferInsert;
export type CrmInteractionItem = typeof crmInteractions.$inferSelect;

/**
 * User-defined lead fields. People add them from the CRM page; agents can read
 * the definitions and fill values, but never create a field — that keeps the
 * shape of the pipeline predictable.
 */
export const crmFieldDefs = pgTable(
  'crm_field_defs',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),

    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    /** Slug used as the key inside `crm_leads.custom_fields`. */
    key: varchar255('key').notNull(),
    label: varchar255('label').notNull(),
    type: text('type').$type<CrmFieldType>().default('text').notNull(),
    /** Allowed values for `select` fields. */
    options: jsonb('options').$type<string[]>().default([]).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('crm_field_defs_key_idx').on(t.key),
    check('crm_field_defs_key_not_empty', sql`length(btrim(${t.key})) > 0`),
  ],
);

export type NewCrmFieldDef = typeof crmFieldDefs.$inferInsert;
export type CrmFieldDefItem = typeof crmFieldDefs.$inferSelect;
