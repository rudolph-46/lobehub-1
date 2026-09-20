// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { crmLeads, users } from '../../schemas';
import type { LobeChatDatabase } from '../../type';
import { buildDedupeKey, CrmLeadModel } from '../crmLead';

const serverDB: LobeChatDatabase = await getTestDB();

const userId = 'crm-lead-model-test-user';
const otherUserId = 'crm-lead-model-test-other';
const model = new CrmLeadModel(serverDB, userId);
const otherModel = new CrmLeadModel(serverDB, otherUserId);

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values([{ id: userId }, { id: otherUserId }]);
});

afterEach(async () => {
  await serverDB.delete(users);
});

describe('buildDedupeKey', () => {
  it('ignores case, accents and punctuation', () => {
    expect(buildDedupeKey('Hôtel de la Paix', 'Douala')).toBe('hotel-de-la-paix|douala');
    expect(buildDedupeKey('hotel  de la  paix!', 'douala')).toBe(buildDedupeKey('Hôtel de la Paix', 'Douala'));
  });
});

describe('CrmLeadModel', () => {
  describe('upsert', () => {
    it('creates a lead the first time and enriches it afterwards', async () => {
      const first = await model.upsert({ city: 'Douala', name: 'Hôtel de la Paix', score: 4 });
      expect(first.created).toBe(true);

      const second = await model.upsert({
        city: 'Douala',
        name: 'hotel de la paix',
        phone: '+237600000000',
      });

      expect(second.created).toBe(false);
      expect(second.lead.id).toBe(first.lead.id);
      // A later pass that knows less must not erase what the first one found.
      expect(second.lead.score).toBe(4);
      expect(second.lead.phone).toBe('+237600000000');

      const rows = await serverDB.select().from(crmLeads);
      expect(rows).toHaveLength(1);
    });

    it('merges custom fields and deduplicates sources by url', async () => {
      const created = await model.upsert({
        city: 'Douala',
        customFields: { visited: false },
        name: 'Résidence Akwa',
        sources: [{ capturedAt: '2026-09-01T00:00:00.000Z', url: 'https://example.cm/a' }],
      });

      const updated = await model.upsert({
        city: 'Douala',
        customFields: { rooms_seen: 12 },
        name: 'Résidence Akwa',
        sources: [
          { capturedAt: '2026-09-20T00:00:00.000Z', url: 'https://example.cm/a' },
          { capturedAt: '2026-09-20T00:00:00.000Z', url: 'https://example.cm/b' },
        ],
      });

      expect(updated.lead.id).toBe(created.lead.id);
      expect(updated.lead.customFields).toEqual({ rooms_seen: 12, visited: false });
      expect(updated.lead.sources).toHaveLength(2);
      expect(updated.lead.sources.find((s) => s.url === 'https://example.cm/a')?.capturedAt).toBe(
        '2026-09-20T00:00:00.000Z',
      );
    });
  });

  describe('sharing', () => {
    it('shows shared leads to every user and private ones only to their creator', async () => {
      const shared = await model.upsert({ city: 'Douala', name: 'Hôtel Partagé' });
      const priv = await model.upsert({ city: 'Yaoundé', name: 'Hôtel Privé', visibility: 'private' });

      const seenByOther = await otherModel.list();
      expect(seenByOther.items.map((l) => l.id)).toEqual([shared.lead.id]);

      expect(await otherModel.findById(priv.lead.id)).toBeUndefined();
      expect(await model.findById(priv.lead.id)).toBeDefined();
    });

    it("refuses to enrich someone else's private lead", async () => {
      await model.upsert({ city: 'Yaoundé', name: 'Hôtel Privé', visibility: 'private' });

      await expect(otherModel.upsert({ city: 'Yaoundé', name: 'Hôtel Privé' })).rejects.toThrow(
        /privé/,
      );
    });
  });

  describe('delete', () => {
    it('is refused to anyone but the creator', async () => {
      const { lead } = await model.upsert({ city: 'Douala', name: 'Hôtel Partagé' });

      await expect(otherModel.delete(lead.id)).rejects.toThrow(/créateur/);

      await model.delete(lead.id);
      const rows = await serverDB.select().from(crmLeads).where(eq(crmLeads.id, lead.id));
      expect(rows).toHaveLength(0);
    });
  });

  describe('list', () => {
    it('filters by status, score and free text', async () => {
      await model.upsert({ city: 'Douala', name: 'Hôtel Akwa', score: 5, status: 'qualified' });
      await model.upsert({ city: 'Yaoundé', name: 'Auberge Bastos', score: 2 });

      expect((await model.list({ statuses: ['qualified'] })).items).toHaveLength(1);
      expect((await model.list({ scoreMin: 4 })).items).toHaveLength(1);
      expect((await model.list({ q: 'bastos' })).items[0].name).toBe('Auberge Bastos');
      expect((await model.list({ city: 'douala' })).items[0].name).toBe('Hôtel Akwa');
      expect((await model.list()).total).toBe(2);
    });
  });

  describe('interactions', () => {
    it('records who wrote what on a lead', async () => {
      const { lead } = await model.upsert({ city: 'Douala', name: 'Hôtel Akwa' });

      await model.addInteraction({
        authorId: 'agt_prospector',
        authorType: 'agent',
        content: 'Brouillon WhatsApp prêt',
        leadId: lead.id,
        type: 'draft',
      });

      const interactions = await model.listInteractions(lead.id);
      expect(interactions).toHaveLength(1);
      expect(interactions[0]).toMatchObject({
        authorId: 'agt_prospector',
        authorType: 'agent',
        type: 'draft',
      });
    });
  });
});
