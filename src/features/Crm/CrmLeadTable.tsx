'use client';

import type { CrmLeadStatus } from '@lobechat/types';
import { Flexbox } from '@lobehub/ui';
import { Button, type DropdownItem, DropdownMenu, Tag, Text } from '@lobehub/ui/base-ui';
import type { TableColumnType } from 'antd';
import { Columns3Icon } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import InlineTable from '@/components/InlineTable';
import TablePagination from '@/components/TablePagination';
import type { crmService } from '@/services/crm';

type Lead = Awaited<ReturnType<typeof crmService.list>>['items'][number];

export type LeadSortField = 'score' | 'updatedAt';

export interface LeadSort {
  field: LeadSortField;
  order: 'ascend' | 'descend';
}

/** Columns a reader can hide; the lead name always stays, it is the row label. */
const TOGGLEABLE_COLUMNS = [
  'category',
  'score',
  'status',
  'contacts',
  'visibility',
  'updatedAt',
] as const;

type ColumnKey = (typeof TOGGLEABLE_COLUMNS)[number];

const COLUMN_LABEL_KEYS = {
  category: 'column.category',
  contacts: 'column.contacts',
  score: 'column.score',
  status: 'column.status',
  updatedAt: 'column.updatedAt',
  visibility: 'column.visibility',
} as const satisfies Record<ColumnKey, string>;

const isSortField = (key: unknown): key is LeadSortField => key === 'score' || key === 'updatedAt';

interface CrmLeadTableProps {
  data: Lead[];
  isLoading?: boolean;
  onPageChange: (page: number, pageSize: number) => void;
  onRowClick: (lead: Lead) => void;
  onSortChange: (sort: LeadSort | null) => void;
  page: number;
  pageSize: number;
  sort: LeadSort | null;
  total: number;
}

const CrmLeadTable = memo<CrmLeadTableProps>(
  ({ data, isLoading, onPageChange, onRowClick, onSortChange, page, pageSize, sort, total }) => {
    const { t } = useTranslation('crm');
    const [hidden, setHidden] = useState<ColumnKey[]>([]);

    const columns = useMemo<TableColumnType<any>[]>(
      () => [
        {
          dataIndex: 'name',
          key: 'name',
          render: (name: string, lead) => (
            <Flexbox gap={2}>
              <Text>{name}</Text>
              <Text fontSize={11} type={'secondary'}>
                {[lead.city, lead.district].filter(Boolean).join(' — ')}
              </Text>
            </Flexbox>
          ),
          title: t('column.name'),
        },
        { dataIndex: 'category', key: 'category', title: t('column.category'), width: 130 },
        {
          dataIndex: 'score',
          key: 'score',
          render: (score: number | null) => (score ? `${score}/5` : '—'),
          sorter: true,
          sortOrder: sort?.field === 'score' ? sort.order : null,
          title: t('column.score'),
          width: 90,
        },
        {
          dataIndex: 'status',
          key: 'status',
          render: (status: CrmLeadStatus) => <Tag size={'small'}>{t(`status.${status}`)}</Tag>,
          title: t('column.status'),
          width: 130,
        },
        {
          dataIndex: 'phone',
          key: 'contacts',
          render: (_: unknown, lead) =>
            [lead.phone, lead.whatsapp, lead.email].filter(Boolean).join(' · ') || '—',
          title: t('column.contacts'),
        },
        {
          dataIndex: 'visibility',
          key: 'visibility',
          render: (visibility: string) =>
            visibility === 'private' ? <Tag size={'small'}>{t('visibility.private')}</Tag> : null,
          title: t('column.visibility'),
          width: 100,
        },
        {
          dataIndex: 'updatedAt',
          key: 'updatedAt',
          render: (value: Date) => new Date(value).toLocaleDateString(),
          sorter: true,
          sortOrder: sort?.field === 'updatedAt' ? sort.order : null,
          title: t('column.updatedAt'),
          width: 120,
        },
      ],
      [sort, t],
    );

    const visibleColumns = useMemo(
      () => columns.filter((column) => !hidden.includes(column.key as ColumnKey)),
      [columns, hidden],
    );

    const columnItems = useMemo<DropdownItem[]>(
      () =>
        TOGGLEABLE_COLUMNS.map((key) => ({
          checked: !hidden.includes(key),
          closeOnClick: false,
          key,
          label: t(COLUMN_LABEL_KEYS[key]),
          onCheckedChange: (checked: boolean) =>
            setHidden((prev) => (checked ? prev.filter((item) => item !== key) : [...prev, key])),
          type: 'checkbox' as const,
        })),
      [hidden, t],
    );

    return (
      <Flexbox gap={12}>
        <Flexbox horizontal align={'center'} justify={'space-between'}>
          <Text type={'secondary'}>{t('filter.total', { count: total })}</Text>
          <DropdownMenu items={columnItems} placement={'bottomRight'}>
            <Button icon={Columns3Icon} size={'small'}>
              {t('table.columns')}
            </Button>
          </DropdownMenu>
        </Flexbox>

        <InlineTable
          columns={visibleColumns}
          dataSource={data}
          loading={isLoading}
          locale={{ emptyText: <Text type={'secondary'}>{t('table.empty')}</Text> }}
          pagination={false}
          rowKey={'id'}
          size={'small'}
          onRow={(lead) => ({ onClick: () => onRowClick(lead as Lead) })}
          onChange={(_pagination, _filters, sorter) => {
            const next = Array.isArray(sorter) ? sorter[0] : sorter;
            if (!next?.order || !isSortField(next.columnKey)) {
              onSortChange(null);
              return;
            }
            onSortChange({ field: next.columnKey, order: next.order });
          }}
        />

        {total > 0 && (
          <TablePagination
            current={page}
            pageSize={pageSize}
            total={total}
            onChange={onPageChange}
          />
        )}
      </Flexbox>
    );
  },
);

CrmLeadTable.displayName = 'CrmLeadTable';

export default CrmLeadTable;
