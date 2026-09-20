import type { CrmFieldType } from '@lobechat/types';
import { asc, eq } from 'drizzle-orm';

import type { CrmFieldDefItem } from '../schemas';
import { crmFieldDefs } from '../schemas';
import type { LobeChatDatabase } from '../type';

/** `Date de visite` → `date_de_visite`, usable as a JSON key. */
export const buildFieldKey = (label: string) =>
  label
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_|_$/g, '')
    .slice(0, 60);

/**
 * Definitions of the user-added lead fields. They are shared by everyone on the
 * instance: the pipeline has one shape, whoever filled a lead in.
 */
export class CrmFieldDefModel {
  private db: LobeChatDatabase;
  private userId: string;

  constructor(db: LobeChatDatabase, userId: string) {
    this.db = db;
    this.userId = userId;
  }

  list = async () =>
    this.db.query.crmFieldDefs.findMany({
      orderBy: [asc(crmFieldDefs.sortOrder), asc(crmFieldDefs.label)],
    });

  create = async (params: {
    key?: string;
    label: string;
    options?: string[];
    sortOrder?: number;
    type?: CrmFieldType;
  }) => {
    const key = params.key?.trim() || buildFieldKey(params.label);
    if (!key) throw new Error('Nom de champ invalide');

    const existing = await this.db.query.crmFieldDefs.findFirst({
      where: eq(crmFieldDefs.key, key),
    });
    if (existing) throw new Error(`Un champ « ${key} » existe déjà.`);

    const [created] = await this.db
      .insert(crmFieldDefs)
      .values({
        key,
        label: params.label,
        options: params.options ?? [],
        sortOrder: params.sortOrder ?? 0,
        type: params.type ?? 'text',
        userId: this.userId,
      })
      .returning();

    return created;
  };

  update = async (id: string, value: Partial<CrmFieldDefItem>) => {
    // The key is the JSON key already written on every lead: renaming it would
    // orphan those values, so only the presentation can change.
    const { key: _key, ...safe } = value;
    const [updated] = await this.db
      .update(crmFieldDefs)
      .set({ ...safe, updatedAt: new Date() })
      .where(eq(crmFieldDefs.id, id))
      .returning();

    return updated;
  };

  delete = async (id: string) => {
    const [deleted] = await this.db
      .delete(crmFieldDefs)
      .where(eq(crmFieldDefs.id, id))
      .returning();

    return deleted;
  };
}
