import type { CrmLeadStatus } from '@lobechat/types';
import { CRM_LEAD_STATUSES } from '@lobechat/types';
import { Flexbox, Input } from '@lobehub/ui';
import { Button, Select, Text } from '@lobehub/ui/base-ui';
import { Download, Search, Settings2 } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useQueryState } from '@/hooks/useQueryParam';
import { useClientDataSWR } from '@/libs/swr';
import { crmService } from '@/services/crm';

import CrmLeadTable, { type LeadSort } from './CrmLeadTable';
import CustomFieldsModal from './CustomFieldsModal';
import { downloadLeadsCsv, downloadLeadsJson } from './exportLeads';
import LeadDetail from './LeadDetail';

const PAGE_SIZE = 20;

const CrmPage = memo(() => {
  const { t } = useTranslation('crm');

  // Filters live in the URL so a filtered pipeline can be shared or reopened.
  const [qRaw, setQ] = useQueryState('q', { clearOnDefault: true });
  const [statusRaw, setStatus] = useQueryState('status', { clearOnDefault: true });
  const [cityRaw, setCity] = useQueryState('city', { clearOnDefault: true });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [sort, setSort] = useState<LeadSort | null>({ field: 'updatedAt', order: 'descend' });
  const [openFields, setOpenFields] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();

  const q = qRaw || '';
  const city = cityRaw || '';
  const statuses = statusRaw ? ([statusRaw] as CrmLeadStatus[]) : undefined;

  const params = {
    city: city || undefined,
    limit: pageSize,
    offset: (page - 1) * pageSize,
    q: q || undefined,
    sortBy: sort?.field,
    sortOrder: sort?.order === 'ascend' ? ('asc' as const) : ('desc' as const),
    statuses,
  };

  const { data, isLoading, mutate } = useClientDataSWR(['crm-leads', params], async () =>
    crmService.list(params),
  );

  const handleExport = async (format: 'csv' | 'json') => {
    // Export follows the current filters, not just the page on screen.
    const { fields: exportFields, leads } = await crmService.export({
      city: city || undefined,
      q: q || undefined,
      statuses,
    });

    const download = format === 'csv' ? downloadLeadsCsv : downloadLeadsJson;
    download(leads, exportFields);
  };

  return (
    <Flexbox flex={1} height={'100%'}>
      <NavHeader
        left={<Text>{t('title')}</Text>}
        right={
          <Flexbox horizontal gap={8}>
            <Button icon={Settings2} size={'small'} onClick={() => setOpenFields(true)}>
              {t('fields.manage')}
            </Button>
            <Button icon={Download} size={'small'} onClick={() => handleExport('csv')}>
              CSV
            </Button>
            <Button icon={Download} size={'small'} onClick={() => handleExport('json')}>
              JSON
            </Button>
          </Flexbox>
        }
      />

      <Flexbox height={'100%'} style={{ overflowY: 'auto' }} width={'100%'}>
        <WideScreenContainer fullWidth gap={16} paddingBlock={24} paddingInline={16}>
          <Flexbox horizontal gap={8} wrap={'wrap'}>
            <Input
              placeholder={t('filter.search')}
              prefix={<Search size={14} />}
              style={{ maxWidth: 280 }}
              value={q}
              onChange={(event) => {
                setPage(1);
                setQ(event.target.value || null);
              }}
            />
            <Input
              placeholder={t('filter.city')}
              style={{ maxWidth: 180 }}
              value={city}
              onChange={(event) => {
                setPage(1);
                setCity(event.target.value || null);
              }}
            />
            <Select
              allowClear
              placeholder={t('filter.status')}
              style={{ minWidth: 160 }}
              value={statusRaw || undefined}
              options={CRM_LEAD_STATUSES.map((status) => ({
                label: t(`status.${status}`),
                value: status,
              }))}
              onChange={(value) => {
                setPage(1);
                setStatus(value ?? null);
              }}
            />
          </Flexbox>

          <CrmLeadTable
            data={data?.items ?? []}
            isLoading={isLoading}
            page={page}
            pageSize={pageSize}
            sort={sort}
            total={data?.total ?? 0}
            onRowClick={(lead) => setSelectedId(lead.id)}
            onPageChange={(nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
            }}
            onSortChange={(nextSort) => {
              setSort(nextSort);
              setPage(1);
            }}
          />
        </WideScreenContainer>
      </Flexbox>

      <LeadDetail
        leadId={selectedId}
        onChanged={() => void mutate()}
        onClose={() => setSelectedId(undefined)}
      />
      <CustomFieldsModal open={openFields} onClose={() => setOpenFields(false)} />
    </Flexbox>
  );
});

export default CrmPage;
