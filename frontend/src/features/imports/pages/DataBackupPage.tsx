import React from 'react';
import { PageContainer } from '../../../components/common/PageContainer';
import { CsSheetBackupPanel } from '../components/CsSheetBackupPanel';

export const DataBackupPage: React.FC = () => {
  return (
    <PageContainer>
      <CsSheetBackupPanel />
    </PageContainer>
  );
};

export default DataBackupPage;
