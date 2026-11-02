import React from 'react';
import { PageContainer } from '../../../components/common/PageContainer';
import { GoogleSheetSyncPanel } from '../components/GoogleSheetSyncPanel';

export const DataSyncPage: React.FC = () => {
  return (
    <PageContainer>
      <GoogleSheetSyncPanel />
    </PageContainer>
  );
};
