import { CareGroupRulesButton } from './CareGroupRulesDialog';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Link2, MessageSquare, Pencil, RefreshCw, Search } from 'lucide-react';
import { omnichannelApi, type GroupDirectoryAccount, type GroupDirectoryItem } from '../api/omnichannel.api';
import { zaloApi } from '../../zalo/api/zalo.api';
import { lineApi } from '../../line/api/line.api';
import { DataTable, type Column } from '../../../components/common/DataTable';
import { FilterBar } from '../../../components/common/FilterBar';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { InboxAvatar } from './InboxWorkspace';
import { inboxError } from '../utils/inbox';

type Platform = 'ALL' | 'ZALO' | 'LINE';

export function GroupDirectory({ scope, initialPlatform = 'ALL' }: { scope: 'all' | 'class-linked'; initialPlatform?: Platform }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [program, setProgram] = useState<'ALL' | 'KAIWA' | 'JLPT'>('ALL');
  const [platform, setPlatform] = useState<Platform>(initialPlatform);
  const [accountKey, setAccountKey] = useState('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [groups, setGroups] = useState<GroupDirectoryItem[]>([]);
  const [accounts, setAccounts] = useState<GroupDirectoryAccount[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [renameTarget, setRenameTarget] = useState<GroupDirectoryItem | null>(null);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const controller = useRef<AbortController>();
  const isClassList = scope === 'class-linked';
  useEffect(() => { const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 250); return () => clearTimeout(timer); }, [searchInput]);
  const load = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setLoading(true); setError('');
    const [accountPlatform, id] = accountKey.split(':');
    try {
      const response = await omnichannelApi.listGroups({ scope, platform: accountKey === 'ALL' ? platform : accountPlatform as Platform,
        program, accountId: id ? Number(id) : undefined, search, page, pageSize }, request.signal);
      if (request.signal.aborted) return;
      setGroups(response.data); setAccounts(response.meta.accounts); setTotal(response.meta.total);
      if (response.meta.page !== page) setPage(response.meta.page);
    } catch (err) { if (!request.signal.aborted) { setGroups([]); setTotal(0); setError(inboxError(err, 'Không tải được danh sách nhóm.')); } }
    finally { if (!request.signal.aborted) setLoading(false); }
  }, [scope, program, platform, accountKey, search, page, pageSize]);
  useEffect(() => { void load(); return () => controller.current?.abort(); }, [load]);

  const visibleAccounts = accounts.filter((a) => platform === 'ALL' || a.platform === platform);
  const syncAccounts = visibleAccounts.filter((a) => accountKey === 'ALL' || `${a.platform}:${a.id}` === accountKey);
  const syncGroups = async () => {
    if (syncing || !syncAccounts.length) return;
    setSyncing(true);
    const results = await Promise.allSettled(syncAccounts.map((a) => a.platform === 'ZALO' ? zaloApi.refreshGroups(a.id) : lineApi.syncGroups(a.id)));
    const failures = results.filter((result) => result.status === 'rejected').length;
    if (failures) toast.error(`Không đồng bộ được ${failures}/${syncAccounts.length} tài khoản. Các tài khoản còn lại đã xử lý xong.`);
    else toast.success('Đã đồng bộ danh sách nhóm.');
    await load(); setSyncing(false);
  };
  const openChat = async (group: GroupDirectoryItem) => {
    try {
      if (group.platform === 'ZALO') await zaloApi.ensureGroupConversation(group.account.id, group.externalGroupId, {
        groupName: group.name, groupAvatarUrl: group.avatarUrl, ...(group.memberCount != null ? { memberCount: group.memberCount } : {}),
      });
      navigate(`/omnichannel/chat?channel=${group.platform}&accountId=${group.account.id}&threadId=${encodeURIComponent(group.externalGroupId)}`);
    } catch (err) { toast.error(inboxError(err, 'Không mở được hội thoại nhóm.')); }
  };
  const rename = async () => {
    if (!renameTarget || !newName.trim() || renaming) return;
    setRenaming(true);
    try {
      await zaloApi.renameGroup(renameTarget.account.id, renameTarget.externalGroupId, newName.trim());
      const accountId = renameTarget.account.id;
      setRenameTarget(null); toast.success('Đã đổi tên nhóm.');
      try { await zaloApi.refreshGroups(accountId); }
      catch { toast.error('Tên đã đổi trên Zalo, nhưng chưa tải được thông tin nhóm mới. Hãy đồng bộ lại trong danh bạ.'); }
      await load();
    } catch (err) { toast.error(inboxError(err, 'Không đổi được tên nhóm.')); }
    finally { setRenaming(false); }
  };
  const columns: Column<GroupDirectoryItem>[] = [
    { key: 'group', header: 'Nhóm và cộng đồng', align: 'left', wrap: true, width: '30%', className: '[&[data-align]]:!align-top', cell: (g) => <div className="flex w-full min-w-0 items-start gap-3">
      <InboxAvatar name={g.name} url={g.avatarUrl} group />
      <div className="min-w-0 flex-1 space-y-1"><p className="font-semibold leading-5 [overflow-wrap:anywhere]">{g.name}</p><p className="break-all text-xs leading-4 text-text-muted">{g.externalGroupId}</p>
        <div className="flex flex-wrap gap-1">{g.programType && <Badge size="sm">{g.programType === 'KAIWA' ? 'Kaiwa' : 'JLPT'}{g.levelNote ? ' · ' + g.levelNote : ''}</Badge>}{g.needsProgramReview && <Badge size="sm">Cần xác định chương trình</Badge>}</div>
        {g.lastSyncedAt && <p className="text-xs leading-4 text-text-muted">Đồng bộ: {new Date(g.lastSyncedAt).toLocaleString('vi-VN')}</p>}</div>
    </div> },
    { key: 'account', header: 'Tài khoản', align: 'left', wrap: true, width: '17%', className: '[&[data-align]]:!align-top', cell: (g) => <div className="min-w-0 space-y-1"><p className="font-medium leading-5 [overflow-wrap:anywhere]">{g.account.name}</p><Badge size="sm">{g.platform === 'ZALO' ? 'Zalo' : 'LINE'}</Badge></div> },
    { key: 'classes', header: 'Lớp và học viên liên kết', align: 'left', wrap: true, width: '29%', className: '[&[data-align]]:!align-top', cell: (g) => g.classLinks.length ? <div className="min-w-0 space-y-3">{g.classLinks.map((link) => <div className="min-w-0 space-y-1" key={`${link.studentId}:${link.programType}:${link.classId}`}>
      <button type="button" className="block w-full min-w-0 text-left text-sm font-medium leading-5 text-primary [overflow-wrap:anywhere] hover:underline focus-visible:outline-primary" onClick={() => navigate(`/classes/${link.classId}/sessions`)}>{link.programType === 'KAIWA' ? 'Kaiwa · ' : 'JLPT · '}{link.classCode ? `${link.classCode} · ` : ''}{link.className}</button>
      <p className="text-xs leading-4 text-text-secondary [overflow-wrap:anywhere]">{link.studentExternalId ? `${link.studentExternalId} · ` : ''}{link.studentName}</p>
    </div>)}</div> : <p className="text-xs leading-5 text-text-muted">Chưa liên kết lớp</p> },
    { key: 'members', header: 'Thành viên', align: 'right', wrap: false, width: '10%', cell: (g) => <span className="tabular-nums">{g.memberCount ?? '—'}</span> },
    { key: 'actions', header: 'Thao tác', align: 'center', wrap: false, width: '14%', cell: (g) => <div className="mx-auto inline-grid grid-cols-3 gap-1">
      <Button variant="ghost" size="icon-sm" title="Mở hộp thư nhóm" aria-label={`Mở hộp thư ${g.name}`} onClick={() => void openChat(g)}><MessageSquare className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon-sm" title="Quản lý liên kết học viên" aria-label={`Quản lý liên kết ${g.name}`} onClick={() => navigate(`/omnichannel/student-links?channel=${g.platform}&accountId=${g.account.id}`)}><Link2 className="h-4 w-4" /></Button>
      {g.platform === 'ZALO' && <Button variant="ghost" size="icon-sm" title="Đổi tên nhóm" aria-label={`Đổi tên ${g.name}`} onClick={() => { setRenameTarget(g); setNewName(g.name); }}><Pencil className="h-4 w-4" /></Button>}
    </div> },
  ];
  return <div className="space-y-4" data-group-scope={scope}>
    <FilterBar title={isClassList ? 'Nhóm đã liên kết lớp' : 'Nhóm và cộng đồng'} gridClassName="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5 items-end" hasActiveFilters={program !== 'ALL' || platform !== 'ALL' || accountKey !== 'ALL' || !!searchInput} onReset={() => { setProgram('ALL'); setPlatform('ALL'); setAccountKey('ALL'); setSearchInput(''); setPage(1); }}>
      <Input label="Tìm kiếm" aria-label="Tìm nhóm" placeholder="Tên nhóm, lớp, học viên..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} leftIcon={<Search className="h-4 w-4" />} />
      <Select label="Nền tảng" value={platform} onChange={(e) => { setPlatform(e.target.value as Platform); setAccountKey('ALL'); setPage(1); }} options={[{ value: 'ALL', label: 'Tất cả' }, { value: 'ZALO', label: 'Zalo' }, { value: 'LINE', label: 'LINE' }]} />
      <Select label="Chương trình" value={program} onChange={e => { setProgram(e.target.value as typeof program); setPage(1); }} options={[{ value: 'ALL', label: 'Tất cả chương trình' }, { value: 'KAIWA', label: 'Kaiwa' }, { value: 'JLPT', label: 'JLPT' }]} />
      <Select label="Tài khoản" value={accountKey} onChange={(e) => { setAccountKey(e.target.value); setPage(1); }} options={[{ value: 'ALL', label: 'Tất cả tài khoản' }, ...visibleAccounts.map((a) => ({ value: `${a.platform}:${a.id}`, label: `${a.platform === 'ZALO' ? 'Zalo' : 'LINE'} · ${a.name}` }))]} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" isLoading={loading} leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => void load()}>Làm mới</Button>
        {!isClassList && <Button variant="primary" size="sm" isLoading={syncing} disabled={!syncAccounts.length} onClick={() => void syncGroups()}>Đồng bộ nhóm</Button>}
      </div>
    </FilterBar>
    <div className="flex justify-end"><CareGroupRulesButton onSaved={() => void load()} /></div>
    {error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-surface p-4 text-sm text-danger"><p>{error}</p><Button variant="outline" size="sm" onClick={() => void load()}>Thử lại</Button></div>}
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-secondary">
      <p>{total} nhóm{isClassList ? ' đã liên kết lớp' : ' và cộng đồng đã đồng bộ'} · Cuộn ngang để xem đầy đủ trên màn hình nhỏ.</p>
      {isClassList && <Button variant="ghost" size="sm" leftIcon={<ExternalLink className="h-3.5 w-3.5" />} onClick={() => navigate('/omnichannel/contacts?view=groups')}>Xem tất cả nhóm trong danh bạ</Button>}
    </div>
    <DataTable columns={columns} data={groups} tableLayout="fixed" minTableWidth={1080} isLoading={loading} emptyMessage={error ? 'Chưa tải được dữ liệu nhóm.' : isClassList ? 'Chưa có nhóm liên kết lớp phù hợp. Quản lý liên kết tại Liên kết học viên đa kênh.' : 'Chưa có nhóm phù hợp. Chọn tài khoản và đồng bộ nhóm.'}
      serverPagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} pageSizeOptions={[10, 25, 50, 100]} />
    <Modal isOpen={!!renameTarget} onClose={() => setRenameTarget(null)} title="Đổi tên nhóm Zalo" size="sm" footer={<><Button variant="outline" disabled={renaming} onClick={() => setRenameTarget(null)}>Hủy</Button><Button variant="primary" isLoading={renaming} disabled={!newName.trim()} onClick={() => void rename()}>Lưu tên nhóm</Button></>}>
      <Input label="Tên nhóm" value={newName} onChange={(e) => setNewName(e.target.value)} />
    </Modal>
  </div>;
}
