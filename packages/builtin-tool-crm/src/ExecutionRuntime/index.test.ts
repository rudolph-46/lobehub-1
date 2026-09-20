import { describe, expect, it, vi } from 'vitest';

import { CrmExecutionRuntime, type CrmToolService } from './index';

const lead = { id: 'lead_1', name: 'Hôtel de la Paix', status: 'new' as const };

const createService = (overrides: Partial<CrmToolService> = {}): CrmToolService => ({
  addInteraction: vi.fn().mockResolvedValue(undefined),
  getLead: vi.fn().mockResolvedValue({ ...lead, interactions: [] }),
  listFields: vi.fn().mockResolvedValue([]),
  searchLeads: vi.fn().mockResolvedValue({ items: [lead], total: 1 }),
  setLeadStatus: vi.fn().mockResolvedValue({ ...lead, status: 'qualified' }),
  upsertLead: vi.fn().mockResolvedValue({ created: true, lead }),
  ...overrides,
});

describe('CrmExecutionRuntime', () => {
  it('refuses a contact that comes without a source', async () => {
    const service = createService();
    const runtime = new CrmExecutionRuntime(service);

    const result = await runtime.upsertLead({ name: 'Hôtel Test', phone: '+237600000000' });

    expect(result.success).toBe(false);
    expect(result.content).toContain('sources');
    expect(service.upsertLead).not.toHaveBeenCalled();
  });

  it('accepts a contact backed by a source', async () => {
    const service = createService();
    const runtime = new CrmExecutionRuntime(service);

    const result = await runtime.upsertLead({
      name: 'Hôtel de la Paix',
      phone: '+237600000000',
      sources: [{ capturedAt: '2026-09-20T08:00:00.000Z', url: 'https://example.cm/hotel' }],
    });

    expect(result.success).toBe(true);
    expect(service.upsertLead).toHaveBeenCalledTimes(1);
  });

  it('stops writing once the per-run quota is reached, without failing the run', async () => {
    const service = createService();
    const runtime = new CrmExecutionRuntime(service, 2);

    await runtime.upsertLead({ name: 'A' });
    await runtime.upsertLead({ name: 'B' });
    const third = await runtime.upsertLead({ name: 'C' });

    // The agent must be able to finish its report, so this is a message, not an error.
    expect(third.success).toBe(true);
    expect(third.content).toContain("Quota d'écriture atteint");
    expect(service.upsertLead).toHaveBeenCalledTimes(2);
  });

  it('reports a missing lead as a failure', async () => {
    const runtime = new CrmExecutionRuntime(
      createService({ getLead: vi.fn().mockResolvedValue(undefined) }),
    );

    const result = await runtime.getLead({ leadId: 'lead_unknown' });

    expect(result.success).toBe(false);
    expect(result.content).toContain('lead_unknown');
  });

  it('tells the agent when no custom field is defined', async () => {
    const runtime = new CrmExecutionRuntime(createService());

    const result = await runtime.listFields();

    expect(result.success).toBe(true);
    expect(result.content).toContain('Aucun champ personnalisé');
  });
});
