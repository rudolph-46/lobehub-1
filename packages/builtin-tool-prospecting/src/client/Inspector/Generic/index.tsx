'use client';

import type { BuiltinInspectorProps } from '@lobechat/types';
import { cx } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { highlightTextStyles, inspectorTextStyles, shinyTextStyles } from '@/styles';

interface GenericParams {
  actorId?: string;
  placeUrl?: string;
  query?: string;
  url?: string;
}

interface GenericInspectorProps extends BuiltinInspectorProps<GenericParams> {
  labelKey: string;
}

export const GenericInspector = memo<GenericInspectorProps>(
  ({ args, partialArgs, isArgumentsStreaming, isLoading, labelKey }) => {
    const { t } = useTranslation('plugin');
    const params = args || partialArgs || {};
    const value = params.query || params.url || params.placeUrl || params.actorId || '';

    return (
      <div className={inspectorTextStyles.root}>
        <span className={cx((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
          {t(labelKey as never)}:{'\u00A0'}
        </span>
        {value && <span className={highlightTextStyles.primary}>{value}</span>}
      </div>
    );
  },
);

GenericInspector.displayName = 'ProspectingGenericInspector';
