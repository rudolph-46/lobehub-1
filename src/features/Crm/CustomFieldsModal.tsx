import type { CrmFieldType } from '@lobechat/types';
import { CRM_FIELD_TYPES } from '@lobechat/types';
import { Flexbox, Text } from '@lobehub/ui';
import { ActionIcon, Button, Tag } from '@lobehub/ui/base-ui';
import { Input, Modal, Select, message } from 'antd';
import { Trash2 } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useClientDataSWR } from '@/libs/swr';
import { crmService } from '@/services/crm';

interface CustomFieldsModalProps {
  onClose: () => void;
  open: boolean;
}

/**
 * People define the extra lead fields here; agents can fill them but never
 * create them, so the pipeline keeps one predictable shape.
 */
const CustomFieldsModal = memo<CustomFieldsModalProps>(({ onClose, open }) => {
  const { t } = useTranslation('crm');
  const [label, setLabel] = useState('');
  const [type, setType] = useState<CrmFieldType>('text');
  const [options, setOptions] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: fields, mutate } = useClientDataSWR(open ? 'crm-field-defs' : null, () =>
    crmService.listFieldDefs(),
  );

  const handleCreate = async () => {
    if (!label.trim()) return;
    setSaving(true);
    try {
      await crmService.createFieldDef({
        label: label.trim(),
        options:
          type === 'select'
            ? options
                .split(',')
                .map((option) => option.trim())
                .filter(Boolean)
            : undefined,
        type,
      });
      setLabel('');
      setOptions('');
      await mutate();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await crmService.deleteFieldDef(id);
    await mutate();
  };

  return (
    <Modal footer={null} onCancel={onClose} open={open} title={t('fields.title')} width={560}>
      <Flexbox gap={16}>
        <Text type={'secondary'} style={{ fontSize: 12 }}>
          {t('fields.description')}
        </Text>

        <Flexbox gap={8}>
          {(fields ?? []).map((field) => (
            <Flexbox align={'center'} gap={8} horizontal key={field.id}>
              <Text style={{ flex: 1 }}>{field.label}</Text>
              <Tag size={'small'}>{field.type}</Tag>
              <Text type={'secondary'} style={{ fontSize: 11 }}>
                {field.key}
              </Text>
              <ActionIcon icon={Trash2} onClick={() => handleDelete(field.id)} size={'small'} />
            </Flexbox>
          ))}
          {(fields ?? []).length === 0 && (
            <Text type={'secondary'}>{t('fields.empty')}</Text>
          )}
        </Flexbox>

        <Flexbox gap={8} horizontal align={'center'}>
          <Input
            onChange={(event) => setLabel(event.target.value)}
            placeholder={t('fields.labelPlaceholder')}
            value={label}
          />
          <Select
            onChange={setType}
            options={CRM_FIELD_TYPES.map((value) => ({ label: t(`fields.type.${value}`), value }))}
            style={{ minWidth: 130 }}
            value={type}
          />
          <Button disabled={!label.trim()} loading={saving} onClick={handleCreate}>
            {t('fields.add')}
          </Button>
        </Flexbox>

        {type === 'select' && (
          <Input
            onChange={(event) => setOptions(event.target.value)}
            placeholder={t('fields.optionsPlaceholder')}
            value={options}
          />
        )}
      </Flexbox>
    </Modal>
  );
});

export default CustomFieldsModal;
