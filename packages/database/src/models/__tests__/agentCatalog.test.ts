// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { agentCatalog } from '../../schemas';
import type { LobeChatDatabase } from '../../type';
import { AgentCatalogModel } from '../agentCatalog';

const serverDB: LobeChatDatabase = await getTestDB();

const model = new AgentCatalogModel(serverDB);

const seedRows = [
  {
    category: 'sales-customer',
    config: { plugins: ['lobe-crm'], systemRole: 'qualify leads' },
    description: 'Qualify local leads',
    identifier: 'prospecteur-test',
    sortOrder: 0,
    title: 'Prospecteur Test',
  },
  {
    category: 'sales-customer',
    config: { systemRole: 'follow up' },
    identifier: 'relanceur-test',
    sortOrder: 1,
    title: 'Relanceur Test',
  },
  {
    category: 'content-creation',
    config: {},
    enabled: false,
    identifier: 'redacteur-cache-test',
    sortOrder: 5,
    title: 'Rédacteur Caché',
  },
];

beforeEach(async () => {
  await serverDB.delete(agentCatalog);
  await serverDB.insert(agentCatalog).values(seedRows);
});

afterEach(async () => {
  await serverDB.delete(agentCatalog);
});

describe('AgentCatalogModel', () => {
  describe('listEnabled', () => {
    it('hides disabled templates and orders by category then sortOrder', async () => {
      const items = await model.listEnabled();

      expect(items.map((item) => item.identifier)).toEqual(['prospecteur-test', 'relanceur-test']);
    });
  });

  describe('findDetailByIdentifier', () => {
    it('returns the full config for an enabled template', async () => {
      const item = await model.findDetailByIdentifier('prospecteur-test');

      expect(item?.title).toBe('Prospecteur Test');
      expect(item?.config.plugins).toEqual(['lobe-crm']);
    });

    it('never returns a disabled template', async () => {
      expect(await model.findDetailByIdentifier('redacteur-cache-test')).toBeUndefined();
    });

    it('returns undefined for an unknown identifier', async () => {
      expect(await model.findDetailByIdentifier('does-not-exist')).toBeUndefined();
    });
  });

  describe('schema constraints', () => {
    it('rejects an empty identifier', async () => {
      await expect(
        serverDB
          .insert(agentCatalog)
          .values({ category: 'operations', identifier: '   ', title: 'x' }),
      ).rejects.toThrow();
    });

    it('rejects a duplicate identifier', async () => {
      await expect(
        serverDB
          .insert(agentCatalog)
          .values({ category: 'operations', identifier: 'prospecteur-test', title: 'dup' }),
      ).rejects.toThrow();
    });

    it('rejects a non-object config', async () => {
      await expect(
        serverDB.insert(agentCatalog).values({
          // @ts-expect-error probing the CHECK constraint with a wrong shape
          config: [1, 2],
          identifier: 'bad-config-test',
          title: 'Bad Config',
        }),
      ).rejects.toThrow();
    });
  });
});
