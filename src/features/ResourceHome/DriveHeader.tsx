'use client';

import { Flexbox } from '@lobehub/ui';
import { Button, type DropdownItem, DropdownMenu, Segmented, Text } from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';
import { ChevronDownIcon, Grid3x3Icon, ListIcon, SparklesIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import NavHeader from '@/features/NavHeader';
import { useViewMode } from '@/features/ResourceManager/components/Explorer/hooks/useViewMode';
import SortDropdown from '@/features/ResourceManager/components/Explorer/ToolBar/SortDropdown';
import SourceFilter from '@/features/ResourceManager/components/Explorer/ToolBar/SourceFilter';
import AddButton from '@/features/ResourceManager/components/Header/AddButton';
import { useResourceManagerStore } from '@/features/ResourceManager/store';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { FilesTabs } from '@/types/files';

/** Categories offered by the Drive "Type" chip. */
const TYPE_OPTIONS = [
  FilesTabs.All,
  FilesTabs.Documents,
  FilesTabs.Pages,
  FilesTabs.Images,
  FilesTabs.Videos,
  FilesTabs.Audios,
  FilesTabs.Files,
] as const;

/**
 * Google-Drive-style header for the resource home: a large title, a list/grid
 * segmented toggle, and a chip row (ask the agent, Type, Source, sort). It
 * replaces the Explorer's default toolbar on the bare `/resource` route only;
 * category and library routes keep the breadcrumb header.
 */
const DriveHeader = memo(() => {
  const { t } = useTranslation('file');
  const navigate = useWorkspaceAwareNavigate();
  const [viewMode, setViewMode] = useViewMode();
  const [category, setCategory] = useResourceManagerStore((s) => [s.category, s.setCategory]);

  const typeItems = useMemo<DropdownItem[]>(
    () =>
      TYPE_OPTIONS.map((option) => ({
        key: option,
        label: t(`tab.${option}` as never),
        onClick: () => setCategory(option),
      })),
    [setCategory, t],
  );

  return (
    <Flexbox>
      <NavHeader
        style={{ borderBottom: `1px solid ${cssVar.colorBorderSecondary}` }}
        left={
          <Flexbox horizontal align={'center'} style={{ marginLeft: 8 }}>
            <Text fontSize={18} weight={600}>
              {t('drive.title')}
            </Text>
          </Flexbox>
        }
        right={
          <>
            <Segmented<'list' | 'masonry'>
              size={'small'}
              value={viewMode}
              options={[
                { icon: <ListIcon size={16} />, value: 'list' },
                { icon: <Grid3x3Icon size={16} />, value: 'masonry' },
              ]}
              onChange={setViewMode}
            />
            <Flexbox style={{ marginLeft: 8 }}>
              <AddButton />
            </Flexbox>
          </>
        }
      />

      <Flexbox
        horizontal
        align={'center'}
        gap={8}
        paddingBlock={8}
        paddingInline={16}
        wrap={'wrap'}
      >
        <Button icon={SparklesIcon} size={'small'} onClick={() => navigate('/')}>
          {t('drive.askAgent')}
        </Button>
        <DropdownMenu items={typeItems} placement={'bottomLeft'}>
          <Button size={'small'}>
            {category === FilesTabs.All || category === FilesTabs.Home
              ? t('drive.filter.type')
              : t(`tab.${category}` as never)}
            <ChevronDownIcon size={14} />
          </Button>
        </DropdownMenu>
        {/* Grid view shows the source chips on its own count row; the list view
            has no such row, so the chips live here. */}
        {viewMode === 'list' && <SourceFilter />}
        <Flexbox flex={1} />
        <SortDropdown />
      </Flexbox>
    </Flexbox>
  );
});

DriveHeader.displayName = 'DriveHeader';

export default DriveHeader;
