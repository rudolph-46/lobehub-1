import type {
  CrmCustomFields,
  CrmInteractionType,
  CrmLeadSource,
  CrmLeadStatus,
  CrmLeadVisibility,
} from '@lobechat/types';
import { and, asc, count, desc, eq, gte, inArray, or, type SQL } from 'drizzle-orm';

import type { CrmLeadItem, NewCrmLead } from '../schemas';
import { crmInteractions, crmLeads } from '../schemas';
import type { LobeChatDatabase } from '../type';
import { ilikeContains } from '../utils/like';

export interface CrmLeadListParams {
  city?: string;
  limit?: number;
  offset?: number;
  /** Free-text search over name, city, district, notes. */
  q?: string;
  scoreMin?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'score';
  statuses?: CrmLeadStatus[];
}

export interface CrmLeadUpsertParams {
  category?: string | null;
  city?: string | null;
  createdByAgentId?: string;
  customFields?: CrmCustomFields;
  district?: string | null;
  email?: string | null;
  name: string;
  notes?: string | null;
  phone?: string | null;
  score?: number | null;
  size?: number | null;
  sources?: CrmLeadSource[];
  status?: CrmLeadStatus;
  visibility?: CrmLeadVisibility;
  website?: string | null;
  whatsapp?: string | null;
}

/** `Hôtel de la Paix` + `Douala` → `hotel-de-la-paix|douala`. */
export const buildDedupeKey = (name: string, city?: string | null) => {
  const slug = (value: string) =>
    value
      .normalize('NFD')
      .replaceAll(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-|-$/g, '');

  return `${slug(name)}|${slug(city ?? '')}`;
};

export class CrmLeadModel {
  private db: LobeChatDatabase;
  private userId: string;

  constructor(db: LobeChatDatabase, userId: string) {
    this.db = db;
    this.userId = userId;
  }

  /**
   * A sales pipeline is a shared one: every signed-in user reads and edits the
   * shared leads, and only the creator sees their private ones. This replaces
   * `buildWorkspaceWhere`, which is workspace-based and therefore reduces to
   * "creator only" on a self-hosted instance.
   */
  private readable = (): SQL =>
    or(eq(crmLeads.visibility, 'shared'), eq(crmLeads.userId, this.userId))!;

  private async assertReadable(id: string) {
    const lead = await this.findById(id);
    if (!lead) throw new Error(`Lead introuvable : ${id}`);
    return lead;
  }

  findById = async (id: string) =>
    this.db.query.crmLeads.findFirst({ where: and(eq(crmLeads.id, id), this.readable()) });

  findByDedupeKey = async (dedupeKey: string) =>
    this.db.query.crmLeads.findFirst({
      where: and(eq(crmLeads.dedupeKey, dedupeKey), this.readable()),
    });

  list = async (params: CrmLeadListParams = {}) => {
    const { city, limit = 50, offset = 0, q, scoreMin, sortBy = 'updatedAt', statuses } = params;

    const conditions: SQL[] = [this.readable()];
    if (statuses?.length) conditions.push(inArray(crmLeads.status, statuses));
    if (city) conditions.push(ilikeContains(crmLeads.city, city));
    if (typeof scoreMin === 'number') conditions.push(gte(crmLeads.score, scoreMin));
    if (q?.trim()) {
      const needle = q.trim();
      conditions.push(
        or(
          ilikeContains(crmLeads.name, needle),
          ilikeContains(crmLeads.city, needle),
          ilikeContains(crmLeads.district, needle),
          ilikeContains(crmLeads.notes, needle),
        )!,
      );
    }

    const where = and(...conditions);
    const orderBy =
      sortBy === 'score'
        ? [desc(crmLeads.score), desc(crmLeads.updatedAt)]
        : sortBy === 'createdAt'
          ? [desc(crmLeads.createdAt)]
          : [desc(crmLeads.updatedAt)];

    const [items, [total]] = await Promise.all([
      this.db.query.crmLeads.findMany({ limit, offset, orderBy, where }),
      this.db.select({ value: count() }).from(crmLeads).where(where),
    ]);

    return { items, total: total?.value ?? 0 };
  };

  /**
   * Creates the lead, or enriches the existing one with the same
   * `name|city`. Only the fields provided are written, so a later pass that
   * knows less never erases what an earlier one found.
   */
  upsert = async (params: CrmLeadUpsertParams) => {
    const dedupeKey = buildDedupeKey(params.name, params.city);
    const existing = await this.db.query.crmLeads.findFirst({
      where: eq(crmLeads.dedupeKey, dedupeKey),
    });

    const { createdByAgentId, customFields, sources, ...rest } = params;
    const defined = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined),
    ) as Partial<NewCrmLead>;

    if (!existing) {
      const [created] = await this.db
        .insert(crmLeads)
        .values({
          ...defined,
          createdByAgentId,
          customFields: customFields ?? {},
          dedupeKey,
          name: params.name,
          sources: sources ?? [],
          userId: this.userId,
        })
        .returning();

      return { created: true, lead: created };
    }

    // A private lead owned by someone else must stay invisible, including to an
    // upsert that guessed its dedupe key.
    if (existing.visibility === 'private' && existing.userId !== this.userId)
      throw new Error('Ce lead appartient à un autre utilisateur et est privé.');

    const [updated] = await this.db
      .update(crmLeads)
      .set({
        ...defined,
        customFields: customFields
          ? { ...existing.customFields, ...customFields }
          : existing.customFields,
        sources: sources?.length ? mergeSources(existing.sources, sources) : existing.sources,
        updatedAt: new Date(),
      })
      .where(eq(crmLeads.id, existing.id))
      .returning();

    return { created: false, lead: updated };
  };

  update = async (id: string, value: Partial<CrmLeadItem>) => {
    await this.assertReadable(id);
    const [updated] = await this.db
      .update(crmLeads)
      .set({ ...value, updatedAt: new Date() })
      .where(eq(crmLeads.id, id))
      .returning();

    return updated;
  };

  /** Deletion stays with the creator; everyone else can only edit. */
  delete = async (id: string) => {
    const lead = await this.assertReadable(id);
    if (lead.userId !== this.userId)
      throw new Error('Seul le créateur du lead peut le supprimer.');

    await this.db.delete(crmLeads).where(eq(crmLeads.id, id));
    return lead;
  };

  addInteraction = async (params: {
    authorId?: string;
    authorType?: 'agent' | 'user';
    content: string;
    leadId: string;
    type?: CrmInteractionType;
  }) => {
    await this.assertReadable(params.leadId);
    const [created] = await this.db
      .insert(crmInteractions)
      .values({
        authorId: params.authorId,
        authorType: params.authorType ?? 'user',
        content: params.content,
        leadId: params.leadId,
        type: params.type ?? 'note',
        userId: this.userId,
      })
      .returning();

    return created;
  };

  listInteractions = async (leadId: string, limit = 50) => {
    await this.assertReadable(leadId);
    return this.db.query.crmInteractions.findMany({
      limit,
      orderBy: [desc(crmInteractions.createdAt)],
      where: eq(crmInteractions.leadId, leadId),
    });
  };

  /** Everything readable, oldest first — used by CSV / JSON export. */
  exportAll = async (params: CrmLeadListParams = {}) => {
    const { items } = await this.list({ ...params, limit: 5000, offset: 0 });
    return items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  };

  countByStatus = async () =>
    this.db
      .select({ status: crmLeads.status, value: count() })
      .from(crmLeads)
      .where(this.readable())
      .groupBy(crmLeads.status)
      .orderBy(asc(crmLeads.status));
}

/** Keeps one source per URL, newest wins. */
const mergeSources = (existing: CrmLeadSource[], incoming: CrmLeadSource[]): CrmLeadSource[] => {
  const byUrl = new Map(existing.map((source) => [source.url, source]));
  for (const source of incoming) byUrl.set(source.url, source);
  return [...byUrl.values()];
};
