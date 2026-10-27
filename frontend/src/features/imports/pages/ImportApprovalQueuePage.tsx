import React from 'react';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { ImportApprovalQueue } from '../components/ImportApprovalQueue';

export const ImportApprovalQueuePage: React.FC = () => {
  return (
    <PageContainer>
      <PageHeader
        title="Hàng đợi Phê duyệt Yêu cầu Tạo mới"
        description="Duyệt hoặc từ chối các yêu cầu tạo học viên phát sinh từ đối soát dữ liệu nhập."
        breadcrumbs={[
          { label: 'Nhập & Xuất Excel', href: '/imports' },
          { label: 'Hàng đợi Phê duyệt' },
        ]}
        backUrl="/imports"
      />
      <ImportApprovalQueue />
    </PageContainer>
  );
};
