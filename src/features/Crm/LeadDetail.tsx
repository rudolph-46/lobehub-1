import type { CrmLeadStatus } from '@lobechat/types';
import { CRM_LEAD_STATUSES } from '@lobechat/types';
import { Flexbox, Text } from '@lobehub/ui';
import { Button, Tag } from '@lobehub/ui/base-ui';
import { Drawer, Input, Select, message } from 'antd';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useClientDataSWR } from '@/libs/swr';
import { crmService } from '@/services/crm';

interface LeadDetailProps {
  leadId?: string;
  onChanged: () => void;
  onClose: () => void;
}

const Row = memo<{ children?: React.ReactNode; label: string }>(({ children, label }) => {
  if (children === null || children === undefined || children === '') return null;

  return (
    <Flexbox gap={2}>
      <Text type={'secondary'} style={{ fontSize: 12 }}>
        {label}
      </Text>
      <Text>{children}</Text>
    </Flexbox>
  );
});

const LeadDetail = memo<LeadDetailProps>(({ leadId, onChanged, onClose }) => {
  const { t } = useTranslation('crm');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: lead, mutate } = useClientDataSWR(
    leadId ? ['crm-lead', leadId] : null,
    async ([, id]: [string, string]) => crmService.get(id),
  );

  const { data: fields } = useClientDataSWR('crm-field-defs', () => crmService.listFieldDefs());

  const refresh = async () => {
    await mutate();
    onChanged();
  };

  const handleStatus = async (status: CrmLeadStatus) => {
    if (!leadId) return;
    await crmService.updateStatus(leadId, status);
    await refresh();
  };

  const handleVisibility = async () => {
    if (!leadId || !lead) return;
    await crmService.setVisibility(leadId, lead.visibility === 'shared' ? 'private' : 'shared');
    await refresh();
  };

  const handleNote = async () => {
    if (!leadId || !note.trim()) return;
    setSaving(true);
    try {
      await crmService.addInteraction(leadId, note.trim());
      setNote('');
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!leadId) return;
    try {
      await crmService.delete(leadId);
      onClose();
      onChanged();
    } catch (error) {
      // Only the creator may delete; surface the server's reason as-is.
      message.error((error as Error).message);
    }
  };

  return (
    <Drawer
      destroyOnHidden
      onClose={onClose}
      open={!!leadId}
      title={lead?.name ?? t('detail.loading')}
      width={520}
    >
      {lead && (
        <Flexbox gap={20}>
          <Flexbox horizontal gap={8} align={'center'} wrap={'wrap'}>
            <Select
              onChange={handleStatus}
              options={CRM_LEAD_STATUSES.map((status) => ({
                label: t(`status.${status}`),
                value: status,
              }))}
              style={{ minWidth: 160 }}
              value={lead.status}
            />
            <Button onClick={handleVisibility} size={'small'}>
              {lead.visibility === 'shared' ? t('detail.makePrivate') : t('detail.makeShared')}
            </Button>
            <Button danger onClick={handleDelete} size={'small'}>
              {t('detail.delete')}
            </Button>
          </Flexbox>

          <Row label={t('field.category')}>{lead.category}</Row>
          <Row label={t('field.city')}>
            {[lead.city, lead.district].filter(Boolean).join(' — ')}
          </Row>
          <Row label={t('field.size')}>{lead.size}</Row>
          <Row label={t('field.score')}>{lead.score ? `${lead.score}/5` : null}</Row>
          <Row label={t('field.contacts')}>
            {[lead.phone, lead.whatsapp, lead.email, lead.website].filter(Boolean).join(' · ')}
          </Row>
          <Row label={t('field.notes')}>{lead.notes}</Row>

          {lead.sources.length > 0 && (
            <Flexbox gap={4}>
              <Text type={'secondary'} style={{ fontSize: 12 }}>
                {t('field.sources')}
              </Text>
              {lead.sources.map((source) => (
                <a href={source.url} key={source.url} rel={'noreferrer'} target={'_blank'}>
                  {source.url}
                </a>
              ))}
            </Flexbox>
          )}

          {(fields ?? []).length > 0 && (
            <Flexbox gap={6}>
              <Text type={'secondary'} style={{ fontSize: 12 }}>
                {t('field.custom')}
              </Text>
              {(fields ?? []).map((field) => (
                <Row key={field.key} label={field.label}>
                  {String(lead.customFields?.[field.key] ?? '')}
                </Row>
              ))}
            </Flexbox>
          )}

          <Flexbox gap={8}>
            <Text type={'secondary'} style={{ fontSize: 12 }}>
              {t('detail.interactions')}
            </Text>
            <Flexbox gap={6} horizontal>
              <Input.TextArea
                autoSize={{ maxRows: 4, minRows: 1 }}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t('detail.notePlaceholder')}
                value={note}
              />
              <Button disabled={!note.trim()} loading={saving} onClick={handleNote}>
                {t('detail.addNote')}
              </Button>
            </Flexbox>
            {lead.interactions.map((interaction) => (
              <Flexbox gap={4} horizontal key={interaction.id} align={'flex-start'}>
                <Tag size={'small'}>{t(`interaction.${interaction.type}`)}</Tag>
                <Flexbox gap={2}>
                  <Text>{interaction.content}</Text>
                  <Text type={'secondary'} style={{ fontSize: 11 }}>
                    {new Date(interaction.createdAt).toLocaleString()} ·{' '}
                    {interaction.authorType === 'agent' ? t('detail.byAgent') : t('detail.byUser')}
                  </Text>
                </Flexbox>
              </Flexbox>
            ))}
          </Flexbox>
        </Flexbox>
      )}
    </Drawer>
  );
});

export default LeadDetail;
