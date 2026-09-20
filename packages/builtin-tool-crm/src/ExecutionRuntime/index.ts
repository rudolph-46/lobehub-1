import type { BuiltinServerRuntimeOutput, CrmFieldType } from '@lobechat/types';

import type {
  AddInteractionArgs,
  GetLeadArgs,
  SearchLeadsArgs,
  SetLeadStatusArgs,
  UpsertLeadArgs,
} from '../types';

export interface CrmToolLead {
  category?: string | null;
  city?: string | null;
  district?: string | null;
  email?: string | null;
  id: string;
  name: string;
  notes?: string | null;
  phone?: string | null;
  score?: number | null;
  size?: number | null;
  status: string;
  updatedAt?: Date | string;
  website?: string | null;
  whatsapp?: string | null;
}

export interface CrmToolInteraction {
  authorType: string;
  content: string;
  createdAt: Date | string;
  type: string;
}

export interface CrmToolFieldDef {
  key: string;
  label: string;
  options: string[];
  type: CrmFieldType;
}

/** Implemented server-side against the database models. */
export interface CrmToolService {
  addInteraction: (args: AddInteractionArgs) => Promise<void>;
  getLead: (
    leadId: string,
  ) => Promise<(CrmToolLead & { interactions: CrmToolInteraction[] }) | undefined>;
  listFields: () => Promise<CrmToolFieldDef[]>;
  searchLeads: (args: SearchLeadsArgs) => Promise<{ items: CrmToolLead[]; total: number }>;
  setLeadStatus: (args: SetLeadStatusArgs) => Promise<CrmToolLead>;
  upsertLead: (args: UpsertLeadArgs) => Promise<{ created: boolean; lead: CrmToolLead }>;
}

/**
 * An agent loop can run for dozens of steps; without a ceiling one bad session
 * would fill the pipeline with hundreds of half-qualified rows. The quota is
 * per operation, and writing stops with an explicit message rather than an
 * error, so the agent can still wrap up and report.
 */
const DEFAULT_WRITE_QUOTA = 50;

const formatLead = (lead: CrmToolLead) =>
  [
    `- ${lead.name} (${lead.id})`,
    lead.city && `  ville : ${lead.city}${lead.district ? ` — ${lead.district}` : ''}`,
    lead.category && `  catégorie : ${lead.category}`,
    typeof lead.size === 'number' && `  taille : ${lead.size}`,
    `  statut : ${lead.status}${typeof lead.score === 'number' ? ` — score ${lead.score}/5` : ''}`,
    (lead.phone || lead.whatsapp || lead.email || lead.website) &&
      `  contacts : ${[lead.phone, lead.whatsapp, lead.email, lead.website].filter(Boolean).join(' · ')}`,
    lead.notes && `  notes : ${lead.notes}`,
  ]
    .filter(Boolean)
    .join('\n');

export class CrmExecutionRuntime {
  private service: CrmToolService;
  private writeQuota: number;
  private written = 0;

  constructor(service: CrmToolService, writeQuota = DEFAULT_WRITE_QUOTA) {
    this.service = service;
    this.writeQuota = writeQuota;
  }

  private ok = (content: string, state?: unknown): BuiltinServerRuntimeOutput => ({
    content,
    state,
    success: true,
  });

  private fail = (error: unknown): BuiltinServerRuntimeOutput => ({
    content: error instanceof Error ? error.message : String(error),
    error,
    success: false,
  });

  searchLeads = async (args: SearchLeadsArgs): Promise<BuiltinServerRuntimeOutput> => {
    try {
      const { items, total } = await this.service.searchLeads(args);
      if (items.length === 0) return this.ok('Aucun lead ne correspond.', { total: 0 });

      return this.ok(
        `${items.length} lead(s) sur ${total} :\n${items.map((lead) => formatLead(lead)).join('\n')}`,
        { total },
      );
    } catch (error) {
      return this.fail(error);
    }
  };

  getLead = async ({ leadId }: GetLeadArgs): Promise<BuiltinServerRuntimeOutput> => {
    try {
      const lead = await this.service.getLead(leadId);
      if (!lead) return this.fail(new Error(`Lead introuvable : ${leadId}`));

      const interactions = lead.interactions
        .slice(0, 10)
        .map((i) => `- [${i.type}] ${new Date(i.createdAt).toISOString()} — ${i.content}`)
        .join('\n');

      return this.ok(
        `${formatLead(lead)}\n\nInteractions :\n${interactions || '- aucune'}`,
        { leadId },
      );
    } catch (error) {
      return this.fail(error);
    }
  };

  upsertLead = async (args: UpsertLeadArgs): Promise<BuiltinServerRuntimeOutput> => {
    if (this.written >= this.writeQuota)
      return this.ok(
        `Quota d'écriture atteint pour cette exécution (${this.writeQuota} leads). Conclus avec ce que tu as déjà enregistré.`,
        { written: this.written },
      );

    // A contact nobody can check is worse than no contact at all.
    const hasContact = Boolean(args.phone || args.whatsapp || args.email);
    if (hasContact && !args.sources?.length)
      return this.fail(
        new Error(
          'Un contact doit être accompagné de sources (url + capturedAt). Ajoute la source ou retire le contact.',
        ),
      );

    try {
      const { created, lead } = await this.service.upsertLead(args);
      this.written += 1;

      return this.ok(
        `${created ? 'Lead créé' : 'Lead mis à jour'} : ${lead.name} (${lead.id})`,
        { leadId: lead.id, written: this.written },
      );
    } catch (error) {
      return this.fail(error);
    }
  };

  addInteraction = async (args: AddInteractionArgs): Promise<BuiltinServerRuntimeOutput> => {
    try {
      await this.service.addInteraction(args);
      return this.ok(`Interaction ajoutée au lead ${args.leadId}.`, { leadId: args.leadId });
    } catch (error) {
      return this.fail(error);
    }
  };

  setLeadStatus = async (args: SetLeadStatusArgs): Promise<BuiltinServerRuntimeOutput> => {
    try {
      const lead = await this.service.setLeadStatus(args);
      return this.ok(`Statut de ${lead.name} : ${lead.status}.`, { leadId: lead.id });
    } catch (error) {
      return this.fail(error);
    }
  };

  listFields = async (): Promise<BuiltinServerRuntimeOutput> => {
    try {
      const fields = await this.service.listFields();
      if (fields.length === 0)
        return this.ok("Aucun champ personnalisé n'est défini. Utilise les champs standard.");

      return this.ok(
        `Champs personnalisés disponibles :\n${fields
          .map(
            (f) =>
              `- ${f.key} (${f.type})${f.options.length > 0 ? ` — valeurs : ${f.options.join(', ')}` : ''} : ${f.label}`,
          )
          .join('\n')}`,
      );
    } catch (error) {
      return this.fail(error);
    }
  };
}
