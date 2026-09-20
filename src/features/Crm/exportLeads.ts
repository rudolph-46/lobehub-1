import { exportFile, exportJSONFile } from '@lobechat/utils/client';
import { dsvFormat } from 'd3-dsv';

interface ExportField {
  key: string;
  label: string;
}

interface ExportLead {
  category?: string | null;
  city?: string | null;
  createdAt: Date | string;
  customFields?: Record<string, unknown> | null;
  district?: string | null;
  email?: string | null;
  name: string;
  notes?: string | null;
  phone?: string | null;
  score?: number | null;
  size?: number | null;
  sources?: { url: string }[] | null;
  status: string;
  updatedAt: Date | string;
  visibility: string;
  website?: string | null;
  whatsapp?: string | null;
}

const BASE_COLUMNS = [
  'name',
  'category',
  'city',
  'district',
  'size',
  'phone',
  'whatsapp',
  'email',
  'website',
  'score',
  'status',
  'visibility',
  'notes',
  'sources',
  'createdAt',
  'updatedAt',
] as const;

const iso = (value: Date | string) => new Date(value).toISOString();

/**
 * One row per lead, custom fields appended as their own columns so the file
 * opens in a spreadsheet without any post-processing.
 */
export const leadsToCsv = (leads: ExportLead[], fields: ExportField[]) => {
  const rows = leads.map((lead) => {
    const row: Record<string, string> = {
      category: lead.category ?? '',
      city: lead.city ?? '',
      createdAt: iso(lead.createdAt),
      district: lead.district ?? '',
      email: lead.email ?? '',
      name: lead.name,
      notes: lead.notes ?? '',
      phone: lead.phone ?? '',
      score: lead.score == null ? '' : String(lead.score),
      size: lead.size == null ? '' : String(lead.size),
      sources: (lead.sources ?? []).map((source) => source.url).join(' | '),
      status: lead.status,
      updatedAt: iso(lead.updatedAt),
      visibility: lead.visibility,
      website: lead.website ?? '',
      whatsapp: lead.whatsapp ?? '',
    };

    for (const field of fields) {
      const value = lead.customFields?.[field.key];
      row[field.label] = value == null ? '' : String(value);
    }

    return row;
  });

  const columns = [...BASE_COLUMNS, ...fields.map((field) => field.label)];
  return dsvFormat(',').format(rows, columns);
};

const stamp = () => new Date().toISOString().slice(0, 10);

export const downloadLeadsCsv = (leads: ExportLead[], fields: ExportField[]) => {
  exportFile(leadsToCsv(leads, fields), `leads-${stamp()}.csv`);
};

export const downloadLeadsJson = (leads: ExportLead[], fields: ExportField[]) => {
  exportJSONFile({ exportedAt: new Date().toISOString(), fields, leads }, `leads-${stamp()}.json`);
};
