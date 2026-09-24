import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { zaloApi } from '../api/zalo.api';
import type { ZaloAccount } from '../types/zalo.types';
import { FriendAvatar } from '../components/FriendAvatar';
import { Button } from '../../../components/ui/Button';
import {
  Search, Users, MessageSquare, RefreshCw, Shield, ShieldOff,
  UserMinus, Settings, Link, Link2Off, LogOut, Trash2,
  Crown, ChevronRight, Plus, UserX, Clock, AlertTriangle,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface GroupRow {
  id: number;
  zalo_group_id: string;
  name: string | null;
  avatar_url: string | null;
  member_count: number | null;
  owner_zalo_uid: string | null;
  zalo_account_id: number;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

interface GroupDetail {
  gridInfoMap?: Record<string, any>;
  [key: string]: any;
}

interface Member {
  uid: string;
  displayName: string;
  avatar?: string | null;
  isOwner?: boolean;
  isDeputy?: boolean;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export const ZaloGroupsPage: React.FC = () => {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<ZaloAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number>(0);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');

  // Detail panel data
  const [selectedGroup, setSelectedGroup] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [blocked, setBlocked] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Dialogs
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showInviteLinkDialog, setShowInviteLinkDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  // Toast helper
  const notify = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ─── Fetch accounts ─────────────────────────────────────────────────────
  useEffect(() => {
    zaloApi.listAccounts().then((accs) => {
      setAccounts(accs);
      if (accs.length > 0) setSelectedAccountId(accs[0].id);
    }).catch(() => {});
  }, []);

  // ─── Fetch groups ──────────────────────────────────────────────────────
  const fetchGroups = useCallback(async () => {
    if (!selectedAccountId) return;
    setLoading(true);
    try {
      const data: GroupRow[] = await zaloApi.getGroupsDb(selectedAccountId);
      setGroups(Array.isArray(data) ? data : []);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  // ─── Sync groups ───────────────────────────────────────────────────────
  const handleRefresh = async () => {
    if (!selectedAccountId) return;
    setSyncing(true);
    try {
      const res = await zaloApi.refreshGroups(selectedAccountId);
      notify(`Đã đồng bộ ${res.synced}/${res.total} nhóm`);
      fetchGroups();
    } catch (err: any) {
      notify(err.response?.data?.error?.message || 'Đồng bộ nhóm thất bại', 'err');
    } finally {
      setSyncing(false);
    }
  };

  // ─── Select group → load detail ────────────────────────────────────────
  const onSelectGroup = useCallback(async (groupId: string) => {
    if (!selectedAccountId || !groupId) return;
    setSelectedGroupId(groupId);
    setLoadingDetail(true);
    try {
      const [detail, memb, blkd, pend] = await Promise.all([
        zaloApi.getGroupDetail(selectedAccountId, groupId).catch(() => null),
        zaloApi.getGroupMembers(selectedAccountId, groupId).catch(() => []),
        zaloApi.getGroupBlocked(selectedAccountId, groupId).catch(() => []),
        zaloApi.getGroupPending(selectedAccountId, groupId).catch(() => []),
      ]);
      setSelectedGroup(detail);
      setMembers(Array.isArray(memb) ? memb : []);
      setBlocked(Array.isArray(blkd) ? blkd : []);
      setPending(Array.isArray(pend) ? pend : []);
    } catch {
      setSelectedGroup(null);
    } finally {
      setLoadingDetail(false);
    }
  }, [selectedAccountId]);

  // ─── Open group chat ──────────────────────────────────────────────────
  const handleOpenChat = async (groupId: string) => {
    if (!selectedAccountId) return;
    try {
      const res = await zaloApi.ensureGroupConversation(selectedAccountId, groupId);
      if (res.conversationId) {
        navigate(`/zalo/chat`);
      }
    } catch {
      notify('Không mở được hội thoại nhóm', 'err');
    }
  };

  // ─── Group actions ────────────────────────────────────────────────────
  const runAction = async (fn: () => Promise<any>) => {
    try {
      const result = await fn();
      if (result !== null) {
        notify('Thành công');
        if (selectedGroupId) onSelectGroup(selectedGroupId);
      } else {
        notify('Thao tác thất bại', 'err');
      }
    } catch {
      notify('Thao tác thất bại', 'err');
    }
  };

  const handleAddDeputy = (m: Member) => runAction(() => zaloApi.addGroupDeputy(selectedAccountId, selectedGroupId, m.uid));
  const handleRemoveDeputy = (m: Member) => runAction(() => zaloApi.removeGroupDeputy(selectedAccountId, selectedGroupId, m.uid));
  const handleRemoveMember = (m: Member) => runAction(() => zaloApi.removeGroupMembers(selectedAccountId, selectedGroupId, [m.uid]));
  const handleBlockMember = (m: Member) => runAction(() => zaloApi.blockGroupMember(selectedAccountId, selectedGroupId, m.uid));
  const handleTransferOwnership = (m: Member) => runAction(() => zaloApi.transferGroupOwnership(selectedAccountId, selectedGroupId, m.uid));
  const handleUnblockMember = (m: any) => runAction(() => zaloApi.unblockGroupMember(selectedAccountId, selectedGroupId, m.id || m.uid));

  // ─── Filtered groups ──────────────────────────────────────────────────
  const filtered = groups.filter((g) => {
    if (!searchInput.trim()) return true;
    const q = searchInput.toLowerCase();
    return (g.name || '').toLowerCase().includes(q) || g.zalo_group_id.includes(q);
  });

  // ─── Group info from detail ────────────────────────────────────────────
  const groupInfo = selectedGroup?.gridInfoMap?.[selectedGroupId]
    ?? Object.values(selectedGroup?.gridInfoMap ?? {})[0] as any ?? null;

  // ─── Account change ───────────────────────────────────────────────────
  const handleAccountChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = parseInt(e.target.value) || 0;
    setSelectedAccountId(id);
    setSelectedGroupId('');
    setSelectedGroup(null);
    setMembers([]);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-gray-50 overflow-hidden">
      {/* ─── Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
        <h1 className="text-base font-bold text-gray-900 whitespace-nowrap">Nhóm Zalo</h1>

        <select
          value={selectedAccountId || ''}
          onChange={handleAccountChange}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 focus:ring-1 focus:ring-blue-500 max-w-[200px]"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.display_name || `Nick #${a.id}`} — {(a.liveStatus || a.status) === 'ACTIVE' ? '🟢' : '⚪'}
            </option>
          ))}
        </select>

        <Button
          onClick={handleRefresh}
          variant="outline"
          size="sm"
          disabled={syncing}
          className="flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Đồng bộ</span>
        </Button>

        <div className="ml-auto text-[11px] text-gray-400">
          {groups.length} nhóm
        </div>
      </div>

      {/* ─── Two-panel layout ────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ─── LEFT: Group List (280px) ──────────────────────────────── */}
        <div className="w-[280px] min-w-[240px] bg-white border-r border-gray-200 flex flex-col shrink-0">
          {/* Search + Create */}
          <div className="px-3 py-2 border-b border-gray-100 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm nhóm..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <Button
              onClick={() => setShowCreateDialog(true)}
              variant="primary"
              size="sm"
              className="w-full flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Tạo nhóm mới
            </Button>
          </div>

          {/* Group list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center">
                <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-400">
                  {groups.length === 0 ? 'Chưa có nhóm — hãy đồng bộ.' : 'Không tìm thấy nhóm'}
                </p>
              </div>
            ) : (
              filtered.map((g) => (
                <button
                  key={g.zalo_group_id}
                  onClick={() => onSelectGroup(g.zalo_group_id)}
                  className={'w-full text-left px-3 py-2.5 border-b border-gray-50 hover:bg-blue-50/50 transition-colors flex items-center gap-2.5 ' +
                    (selectedGroupId === g.zalo_group_id ? 'bg-blue-50 border-l-2 border-l-blue-500' : '')}
                >
                  <FriendAvatar
                    url={g.avatar_url}
                    name={g.name || g.zalo_group_id}
                    size={36}
                    rounded="rounded-xl"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900 truncate">
                      {g.name || `Nhóm ${g.zalo_group_id.slice(0, 8)}`}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
                      <span className="flex items-center gap-0.5">
                        <Users className="w-3 h-3" />
                        {g.member_count ?? '?'}
                      </span>
                      {g.last_synced_at && (
                        <span>{new Date(g.last_synced_at).toLocaleDateString('vi-VN')}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleOpenChat(g.zalo_group_id); }}
                      className="p-1 rounded-lg hover:bg-blue-100 text-blue-500 transition-colors"
                      title="Nhắn tin nhóm"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ─── RIGHT: Group Detail Panel ─────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          {!selectedGroupId ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Users className="w-16 h-16 text-gray-200 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-gray-400">Chọn một nhóm</h3>
                <p className="text-xs text-gray-400 mt-1">Chọn nhóm bên trái để xem chi tiết</p>
              </div>
            </div>
          ) : loadingDetail ? (
            <div className="flex-1 flex items-center justify-center">
              <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : (
            <GroupDetailPanel
              groupInfo={groupInfo}
              groupId={selectedGroupId}
              members={members}
              blocked={blocked}
              pending={pending}
              onOpenSettings={() => setShowSettingsDialog(true)}
              onOpenInviteLink={() => setShowInviteLinkDialog(true)}
              onOpenChat={() => handleOpenChat(selectedGroupId)}
              onAddDeputy={handleAddDeputy}
              onRemoveDeputy={handleRemoveDeputy}
              onRemoveMember={handleRemoveMember}
              onBlockMember={handleBlockMember}
              onTransferOwnership={handleTransferOwnership}
              onUnblockMember={handleUnblockMember}
              onApprovePending={(m: any) => runAction(() => zaloApi.addGroupMembers(selectedAccountId, selectedGroupId, [m.id || m.uid]))}
              onRejectPending={(m: any) => runAction(() => zaloApi.removeGroupMembers(selectedAccountId, selectedGroupId, [m.id || m.uid]))}
            />
          )}
        </div>
      </div>

      {/* ─── Toast ───────────────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium text-white transition-all ${
          toast.type === 'ok' ? 'bg-emerald-500' : 'bg-red-500'
        }`}>
          {toast.type === 'ok' ? '✅ ' : '❌ '}{toast.msg}
        </div>
      )}

      {/* ─── Settings Dialog ─────────────────────────────────────────── */}
      {showSettingsDialog && selectedGroupId && (
        <SettingsDialog
          groupName={groupInfo?.name || groupInfo?.groupName || ''}
          onClose={() => setShowSettingsDialog(false)}
          onLeave={async () => {
            await runAction(() => zaloApi.leaveGroup(selectedAccountId, selectedGroupId));
            setShowSettingsDialog(false);
            setSelectedGroupId('');
            setSelectedGroup(null);
          }}
          onDisperse={async () => {
            await runAction(() => zaloApi.disperseGroup(selectedAccountId, selectedGroupId));
            setShowSettingsDialog(false);
            setSelectedGroupId('');
            setSelectedGroup(null);
          }}
          onRename={async (newName: string) => {
            await runAction(() => zaloApi.renameGroup(selectedAccountId, selectedGroupId, newName));
            setShowSettingsDialog(false);
          }}
        />
      )}

      {/* ─── Invite Link Dialog ──────────────────────────────────────── */}
      {showInviteLinkDialog && selectedGroupId && (
        <InviteLinkDialog
          accountId={selectedAccountId}
          groupId={selectedGroupId}
          onClose={() => setShowInviteLinkDialog(false)}
        />
      )}

      {/* ─── Create Group Dialog ─────────────────────────────────────── */}
      {showCreateDialog && (
        <CreateGroupDialog
          accountId={selectedAccountId}
          onClose={() => setShowCreateDialog(false)}
          onCreated={() => { setShowCreateDialog(false); fetchGroups(); }}
        />
      )}
    </div>
  );
};

// ─── GroupDetailPanel ────────────────────────────────────────────────────────

const GroupDetailPanel: React.FC<{
  groupInfo: any;
  groupId: string;
  members: Member[];
  blocked: any[];
  pending: any[];
  onOpenSettings: () => void;
  onOpenInviteLink: () => void;
  onOpenChat: () => void;
  onAddDeputy: (m: Member) => void;
  onRemoveDeputy: (m: Member) => void;
  onRemoveMember: (m: Member) => void;
  onBlockMember: (m: Member) => void;
  onTransferOwnership: (m: Member) => void;
  onUnblockMember: (m: any) => void;
  onApprovePending: (m: any) => void;
  onRejectPending: (m: any) => void;
}> = ({
  groupInfo, groupId, members, blocked, pending,
  onOpenSettings, onOpenInviteLink, onOpenChat,
  onAddDeputy, onRemoveDeputy, onRemoveMember,
  onBlockMember, onTransferOwnership, onUnblockMember,
  onApprovePending, onRejectPending,
}) => {
  const [tab, setTab] = useState<'members' | 'pending' | 'blocked'>('members');
  const [showMemberMenu, setShowMemberMenu] = useState<string | null>(null);

  const groupName = groupInfo?.name || groupInfo?.groupName || 'Nhóm không tên';
  const totalMember = groupInfo?.totalMember ?? groupInfo?.memberCount ?? members.length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 shrink-0">
        <FriendAvatar
          url={groupInfo?.avatar}
          name={groupName}
          size={40}
          rounded="rounded-xl"
        />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-gray-900 truncate">{groupName}</div>
          <div className="text-[11px] text-gray-400">
            {totalMember} thành viên · ID: {groupId.slice(0, 12)}…
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onOpenChat} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition-colors" title="Nhắn tin nhóm">
            <MessageSquare className="w-4 h-4" />
          </button>
          <button onClick={onOpenInviteLink} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition-colors" title="Quản lý link mời">
            <Link className="w-4 h-4" />
          </button>
          <button onClick={onOpenSettings} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors" title="Cài đặt nhóm">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 shrink-0">
        {([
          { key: 'members' as const, label: 'Thành viên', icon: Users, count: members.length },
          { key: 'pending' as const, label: 'Chờ duyệt', icon: Clock, count: pending.length },
          { key: 'blocked' as const, label: 'Bị chặn', icon: UserX, count: blocked.length },
        ]).map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {count > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                key === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'members' && (
          <div className="p-2">
            {members.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-400">Chưa có thành viên</div>
            ) : (
              members.map((m) => (
                <div
                  key={m.uid}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors group relative"
                >
                  <FriendAvatar
                    url={m.avatar}
                    name={m.displayName || m.uid}
                    size={36}
                    rounded="rounded-full"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{m.displayName || m.uid}</div>
                    {m.isOwner && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full mt-0.5">
                        <Crown className="w-2.5 h-2.5" /> Trưởng nhóm
                      </span>
                    )}
                    {m.isDeputy && !m.isOwner && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full mt-0.5">
                        <Shield className="w-2.5 h-2.5" /> Phó nhóm
                      </span>
                    )}
                  </div>
                  <div className="shrink-0 relative">
                    <button
                      onClick={() => setShowMemberMenu(showMemberMenu === m.uid ? null : m.uid)}
                      className="p-1 rounded-lg hover:bg-gray-200 text-gray-400 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                    {showMemberMenu === m.uid && (
                      <div className="absolute right-0 top-8 z-20 bg-white rounded-xl shadow-lg border border-gray-100 py-1 w-48">
                        {!m.isOwner && !m.isDeputy && (
                          <button onClick={() => { onAddDeputy(m); setShowMemberMenu(null); }}
                            className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 flex items-center gap-2">
                            <Shield className="w-3.5 h-3.5 text-blue-500" /> Bổ nhiệm phó nhóm
                          </button>
                        )}
                        {!m.isOwner && m.isDeputy && (
                          <button onClick={() => { onRemoveDeputy(m); setShowMemberMenu(null); }}
                            className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-amber-50 flex items-center gap-2">
                            <ShieldOff className="w-3.5 h-3.5 text-amber-500" /> Thu hồi phó nhóm
                          </button>
                        )}
                        {!m.isOwner && (
                          <>
                            <button onClick={() => { onBlockMember(m); setShowMemberMenu(null); }}
                              className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2">
                              <UserX className="w-3.5 h-3.5" /> Chặn thành viên
                            </button>
                            <button onClick={() => { onRemoveMember(m); setShowMemberMenu(null); }}
                              className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2">
                              <UserMinus className="w-3.5 h-3.5" /> Xóa khỏi nhóm
                            </button>
                            <div className="border-t border-gray-100 my-1" />
                            <button onClick={() => { onTransferOwnership(m); setShowMemberMenu(null); }}
                              className="w-full text-left px-3 py-2 text-xs text-amber-600 hover:bg-amber-50 flex items-center gap-2">
                              <Crown className="w-3.5 h-3.5" /> Chuyển quyền trưởng nhóm
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'pending' && (
          <div className="p-2">
            {pending.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-400">Không có yêu cầu chờ duyệt</div>
            ) : (
              pending.map((p: any) => (
                <div key={p.id || p.uid} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50">
                  <FriendAvatar url={p.avatar} name={p.displayName || p.name || p.uid} size={36} rounded="rounded-full" />
                  <div className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">
                    {p.displayName || p.name || p.uid}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => onApprovePending(p)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-medium hover:bg-emerald-100 transition-colors">
                      Duyệt
                    </button>
                    <button onClick={() => onRejectPending(p)}
                      className="px-2.5 py-1 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors">
                      Từ chối
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'blocked' && (
          <div className="p-2">
            {blocked.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-400">Không có thành viên bị chặn</div>
            ) : (
              blocked.map((b: any) => (
                <div key={b.id || b.uid} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50">
                  <FriendAvatar url={b.avatar} name={b.displayName || b.name || b.uid} size={36} rounded="rounded-full" />
                  <div className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">
                    {b.displayName || b.name || b.uid}
                  </div>
                  <button onClick={() => onUnblockMember(b)}
                    className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200 transition-colors">
                    Bỏ chặn
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── SettingsDialog ──────────────────────────────────────────────────────────

const SettingsDialog: React.FC<{
  groupName: string;
  onClose: () => void;
  onLeave: () => void;
  onDisperse: () => void;
  onRename: (name: string) => void;
}> = ({ groupName: initialName, onClose, onLeave, onDisperse, onRename }) => {
  const [name, setName] = useState(initialName);
  const [confirmAction, setConfirmAction] = useState<'leave' | 'disperse' | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-4 h-4" /> Cài đặt nhóm
          </h3>
        </div>
        <div className="p-5 space-y-4">
          {/* Rename */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tên nhóm</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <Button
                variant="primary"
                size="sm"
                disabled={!name.trim() || name === initialName}
                onClick={() => onRename(name.trim())}
              >
                Đổi tên
              </Button>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-2">
            {!confirmAction ? (
              <>
                <button
                  onClick={() => onLeave()}
                  className="w-full text-left px-3 py-2.5 text-sm text-amber-600 hover:bg-amber-50 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <LogOut className="w-4 h-4" /> Rời nhóm
                </button>
                <button
                  onClick={() => setConfirmAction('disperse')}
                  className="w-full text-left px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <Trash2 className="w-4 h-4" /> Giải tán nhóm
                </button>
              </>
            ) : (
              <div className="bg-red-50 rounded-lg p-3">
                <p className="text-sm text-red-700 flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4" /> Xác nhận giải tán nhóm?
                </p>
                <p className="text-xs text-red-500 mt-1">Hành động này không thể hoàn tác.</p>
                <div className="flex justify-end gap-2 mt-3">
                  <Button variant="outline" size="sm" onClick={() => setConfirmAction(null)}>Hủy</Button>
                  <Button variant="danger" size="sm" onClick={onDisperse}>Giải tán</Button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
          <Button variant="outline" onClick={onClose}>Đóng</Button>
        </div>
      </div>
    </div>
  );
};

// ─── InviteLinkDialog ────────────────────────────────────────────────────────

const InviteLinkDialog: React.FC<{
  accountId: number;
  groupId: string;
  onClose: () => void;
}> = ({ accountId, groupId, onClose }) => {
  const [linkData, setLinkData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  const notify = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchLink = useCallback(async () => {
    setLoading(true);
    try {
      const data = await zaloApi.getGroupLinkDetail(accountId, groupId);
      setLinkData(data);
    } catch {
      setLinkData(null);
    } finally {
      setLoading(false);
    }
  }, [accountId, groupId]);

  useEffect(() => { fetchLink(); }, [fetchLink]);

  const toggleLink = async (enable: boolean) => {
    setToggling(true);
    try {
      if (enable) {
        await zaloApi.enableGroupLink(accountId, groupId);
        notify('Đã bật link mời');
      } else {
        await zaloApi.disableGroupLink(accountId, groupId);
        notify('Đã tắt link mời');
      }
      fetchLink();
    } catch {
      notify('Thao tác thất bại', 'err');
    } finally {
      setToggling(false);
    }
  };

  const linkUrl = linkData?.linkUrl || linkData?.token || '';
  const isEnabled = linkData?.isEnabled ?? linkData?.enabled ?? false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Link className="w-4 h-4" /> Quản lý link mời
          </h3>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="flex justify-center py-6">
              <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Trạng thái:</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  isEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {isEnabled ? 'Đang bật' : 'Đang tắt'}
                </span>
              </div>

              {isEnabled && linkUrl && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Link mời:</label>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={linkUrl}
                      className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-gray-50 font-mono"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { navigator.clipboard.writeText(linkUrl); notify('Đã copy link'); }}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  variant={isEnabled ? 'outline' : 'primary'}
                  size="sm"
                  disabled={toggling}
                  onClick={() => toggleLink(!isEnabled)}
                  className="flex items-center gap-1.5"
                >
                  {isEnabled ? <Link2Off className="w-3.5 h-3.5" /> : <Link className="w-3.5 h-3.5" />}
                  {toggling ? 'Đang xử lý...' : isEnabled ? 'Tắt link mời' : 'Bật link mời'}
                </Button>
              </div>
            </div>
          )}
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
          <Button variant="outline" onClick={onClose}>Đóng</Button>
        </div>
      </div>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium text-white ${
          toast.type === 'ok' ? 'bg-emerald-500' : 'bg-red-500'
        }`}>
          {toast.type === 'ok' ? '✅ ' : '❌ '}{toast.msg}
        </div>
      )}
    </div>
  );
};

// ─── CreateGroupDialog ───────────────────────────────────────────────────────

const CreateGroupDialog: React.FC<{
  accountId: number;
  onClose: () => void;
  onCreated: () => void;
}> = ({ accountId, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [memberIds, setMemberIds] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    const ids = memberIds.split(',').map((s) => s.trim()).filter(Boolean);
    setCreating(true);
    try {
      await zaloApi.createGroup(accountId, { name: name.trim(), memberIds: ids });
      onCreated();
    } catch {
      alert('Tạo nhóm thất bại');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Tạo nhóm mới
          </h3>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tên nhóm *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nhập tên nhóm..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Thành viên (Zalo UIDs, phân cách dấu phẩy)</label>
            <input
              type="text"
              value={memberIds}
              onChange={(e) => setMemberIds(e.target.value)}
              placeholder="uid1, uid2, uid3..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button variant="primary" onClick={handleCreate} disabled={creating || !name.trim()}>
            {creating ? 'Đang tạo...' : 'Tạo nhóm'}
          </Button>
        </div>
      </div>
    </div>
  );
};
