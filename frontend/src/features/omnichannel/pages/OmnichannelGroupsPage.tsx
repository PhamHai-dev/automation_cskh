import { useSearchParams } from 'react-router-dom';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { GroupDirectory } from '../components/GroupDirectory';

export function OmnichannelGroupsPage({ initialTab }: { initialTab?: 'UNIFIED' | 'ZALO' | 'LINE' }) {
  const [params] = useSearchParams();
  const requested = initialTab || params.get('channel');
  const platform = requested === 'ZALO' || requested === 'LINE' ? requested : 'ALL';
  return <PageContainer>
    <PageHeader title="Nhóm Lớp Đa kênh" description="Chỉ hiển thị nhóm Zalo và LINE đã liên kết với học viên có lớp học. Toàn bộ nhóm đồng bộ nằm trong Danh bạ đa kênh." />
    <GroupDirectory key={platform} scope="class-linked" initialPlatform={platform} />
  </PageContainer>;
}
