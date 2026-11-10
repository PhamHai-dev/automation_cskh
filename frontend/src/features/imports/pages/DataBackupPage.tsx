import React from 'react';
import { PageContainer } from '../../../components/common/PageContainer';
import { CsSheetBackupPanel } from '../components/CsSheetBackupPanel';

export interface DataBackupPageProps {
  initialTab?: 'configs' | 'history' | 'connection';
}

export const DataBackupPage: React.FC<DataBackupPageProps> = ({ initialTab }) => {
  return (
    <PageContainer>
      <CsSheetBackupPanel initialTab={initialTab} />
    </PageContainer>
  );
};

export default DataBackupPage;
