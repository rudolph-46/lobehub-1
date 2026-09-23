import type { BuiltinInspectorProps } from '@lobechat/types';
import type { ReactElement } from 'react';

import { ProspectingApiName } from '../../types';
import { GenericInspector } from './Generic';

const label = (apiName: string) => `builtins.lobe-prospecting.apiName.${apiName}`;
const inspector =
  (apiName: string) =>
  (props: BuiltinInspectorProps): ReactElement => (
    <GenericInspector {...props} labelKey={label(apiName)} />
  );

export const ProspectingInspectors = {
  [ProspectingApiName.enrichBusinessContacts]: inspector(ProspectingApiName.enrichBusinessContacts),
  [ProspectingApiName.findLocalBusinesses]: inspector(ProspectingApiName.findLocalBusinesses),
  [ProspectingApiName.getBusinessReviews]: inspector(ProspectingApiName.getBusinessReviews),
  [ProspectingApiName.readWebsite]: inspector(ProspectingApiName.readWebsite),
  [ProspectingApiName.runActor]: inspector(ProspectingApiName.runActor),
  [ProspectingApiName.searchWeb]: inspector(ProspectingApiName.searchWeb),
};
