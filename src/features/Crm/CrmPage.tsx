import type { CrmLeadStatus } from '@lobechat/types';
import { CRM_LEAD_STATUSES } from '@lobechat/types';
import { Flexbox, Input, Text } from '@lobehub/ui';
import { Button, Tag } from '@lobehub/ui/base-ui';
import { Pagination, Select, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Download, Search, Settings2 } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useQueryState } from '@/hooks/useQueryParam';
import { useClientDataSWR } from '@/libs/swr';
import { crmService } from '@/services/crm';

import CustomFieldsModal from './CustomFieldsModal';
import { downloadLeadsCsv, downloadLeadsJson } from './exportLeads';
import LeadDetail from './LeadDetail';

const PAGE_SIZE = 20;

type Lead = Awaited<ReturnType<typeof crmService.list>>['items'][number];

const CrmPage = memo(() => {
  const { t } = useTranslation('crm');

  // Filters live in the URL so a filtered pipeline can be shared or reopened.
  const [qRaw, setQ] = useQueryState('q', { clearOnDefault: true });
  const [statusRaw, setStatus] = useQueryState('status', { clearOnDefault: true });
  const [cityRaw, setCity] = useQueryState('city', { clearOnDefault: true });
  const [page, setPage] = useState(1);
  const [openFields, setOpenFields] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();

  const q = qRaw || '';
  const city = cityRaw || '';
  const statuses = statusRaw ? ([statusRaw] as CrmLeadStatus[]) : undefined;

  const params = {
    city: city || undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    q: q || undefined,
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

  const columns = useMemo<ColumnsType<Lead>>(
    () => [
      {
        dataIndex: 'name',
        render: (name: string, lead) => (
          <Flexbox gap={2}>
            <Text>{name}</Text>
            <Text type={'secondary'} style={{ fontSize: 11 }}>
              {[lead.city, lead.district].filter(Boolean).join(' — ')}
            </Text>
          </Flexbox>
        ),
        title: t('column.name'),
      },
      { dataIndex: 'category', title: t('column.category'), width: 130 },
      {
        dataIndex: 'score',
        render: (score: number | null) => (score ? `${score}/5` : '—'),
        sorter: (a, b) => (a.score ?? 0) - (b.score ?? 0),
        title: t('column.score'),
        width: 90,
      },
      {
        dataIndex: 'status',
        render: (status: CrmLeadStatus) => <Tag size={'small'}>{t(`status.${status}`)}</Tag>,
        title: t('column.status'),
        width: 130,
      },
      {
        dataIndex: 'phone',
        render: (_: unknown, lead) =>
          [lead.phone, lead.whatsapp, lead.email].filter(Boolean).join(' · ') || '—',
        title: t('column.contacts'),
      },
      {
        dataIndex: 'visibility',
        render: (visibility: string) =>
          visibility === 'private' ? <Tag size={'small'}>{t('visibility.private')}</Tag> : null,
        title: t('column.visibility'),
        width: 100,
      },
      {
        dataIndex: 'updatedAt',
        render: (value: Date) => new Date(value).toLocaleDateString(),
        sorter: (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
        title: t('column.updatedAt'),
        width: 120,
      },
    ],
    [t],
  );

  return (
    <Flexbox flex={1} height={'100%'}>
      <NavHeader
        left={<Text>{t('title')}</Text>}
        right={
          <Flexbox gap={8} horizontal>
            <Button icon={Settings2} onClick={() => setOpenFields(true)} size={'small'}>
              {t('fields.manage')}
            </Button>
            <Button icon={Download} onClick={() => handleExport('csv')} size={'small'}>
              CSV
            </Button>
            <Button icon={Download} onClick={() => handleExport('json')} size={'small'}>
              JSON
            </Button>
          </Flexbox>
        }
      />

      <Flexbox height={'100%'} style={{ overflowY: 'auto' }} width={'100%'}>
        <WideScreenContainer gap={16} paddingBlock={24}>
          <Flexbox gap={8} horizontal wrap={'wrap'}>
            <Input
              onChange={(event) => {
                setPage(1);
                setQ(event.target.value || null);
              }}
              placeholder={t('filter.search')}
              prefix={<Search size={14} />}
              style={{ maxWidth: 280 }}
              value={q}
            />
            <Input
              onChange={(event) => {
                setPage(1);
                setCity(event.target.value || null);
              }}
              placeholder={t('filter.city')}
              style={{ maxWidth: 180 }}
              value={city}
            />
            <Select
              allowClear
              onChange={(value) => {
                setPage(1);
                setStatus(value ?? null);
              }}
              options={CRM_LEAD_STATUSES.map((status) => ({
                label: t(`status.${status}`),
                value: status,
              }))}
              placeholder={t('filter.status')}
              style={{ minWidth: 160 }}
              value={statusRaw || undefined}
            />
            <Text type={'secondary'} style={{ alignSelf: 'center' }}>
              {t('filter.total', { count: data?.total ?? 0 })}
            </Text>
          </Flexbox>

          <Table<Lead>
            columns={columns}
            dataSource={data?.items ?? []}
            loading={isLoading}
            onRow={(lead) => ({ onClick: () => setSelectedId(lead.id) })}
            pagination={false}
            rowKey={'id'}
            size={'small'}
          />

          {(data?.total ?? 0) > PAGE_SIZE && (
            <Pagination
              current={page}
              onChange={setPage}
              pageSize={PAGE_SIZE}
              showSizeChanger={false}
              total={data?.total ?? 0}
            />
          )}
        </WideScreenContainer>
      </Flexbox>

      <LeadDetail
        leadId={selectedId}
        onChanged={() => void mutate()}
        onClose={() => setSelectedId(undefined)}
      />
      <CustomFieldsModal onClose={() => setOpenFields(false)} open={openFields} />
    </Flexbox>
  );
});

export default CrmPage;
