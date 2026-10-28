import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, RotateCcw, Table2, Users } from 'lucide-react';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Button } from '../../../components/ui/Button';
import { HorizontalTabs } from '../../../components/ui/HorizontalTabs';
import { ColumnCheckboxList } from '../components/ColumnCheckboxList';
import { useColumnVisibility } from '../hooks/useColumnVisibility';
import { PreferenceScope } from '../columns';

interface ScopeSection {
  key: PreferenceScope;
  label: string;
}

const ENROLLMENT_SCOPES: ScopeSection[] = [
  { key: 'enrollments.quick',    label: 'Tab Nhanh' },
  { key: 'enrollments.detailed', label: 'Tab Chi tiết' },
  { key: 'enrollments.stats',    label: 'Tab Thống kê' },
];

const STUDENT_SCOPES: ScopeSection[] = [
  { key: 'students.tab1', label: 'Danh sách Học viên' },
  { key: 'students.tab2', label: 'Báo cáo & Chăm sóc' },
];

const PreferenceSection: React.FC<{ scopes: ScopeSection[]; title: string; description: string; icon: React.ReactNode }> = ({
  scopes,
  title,
  description,
  icon,
}) => {
  const [activeScope, setActiveScope] = useState<PreferenceScope>(scopes[0].key);
  const { loading, saving, draft, dirty, columns, setDraftValue, setAll, resetToDefault, save } =
    useColumnVisibility(activeScope);

  return (
    <div className="bg-surface rounded-2xl border border-border/80 shadow-soft overflow-hidden">
      {/* Section header */}
      <div className="flex items-start gap-3 px-4 sm:px-6 py-4 border-b border-border/70 bg-surface-muted/40">
        <div className="w-10 h-10 rounded-xl bg-primary-soft text-primary flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-text-primary">{title}</h2>
          <p className="text-xs text-text-muted mt-0.5">{description}</p>
        </div>
      </div>

      {/* Tabs */}
      {scopes.length > 1 && (
        <div className="px-4 sm:px-6 pt-4">
          <HorizontalTabs
            ariaLabel={`Tabs cho ${title}`}
            items={scopes.map((s) => ({ value: s.key, label: s.label }))}
            value={activeScope}
            onChange={(v) => setActiveScope(v as PreferenceScope)}
          />
        </div>
      )}

      {/* Column list */}
      <div className="p-4 sm:p-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 animate-pulse">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-10 rounded-xl bg-slate-200/70" />
            ))}
          </div>
        ) : (
          <ColumnCheckboxList
            columns={columns}
            draft={draft}
            onToggle={setDraftValue}
            onSelectAll={() => setAll(true)}
            onDeselectAll={() => setAll(false)}
          />
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2.5 mt-5 pt-4 border-t border-border/60">
          <Button
            variant="primary"
            size="sm"
            onClick={save}
            disabled={!dirty || saving}
            leftIcon={<Save className="w-4 h-4" />}
          >
            {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={resetToDefault}
            leftIcon={<RotateCcw className="w-4 h-4" />}
          >
            Khôi phục mặc định
          </Button>
          {dirty && (
            <span className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              Chưa lưu
            </span>
          )}
        </div>
      </div>
    </div>
  );
};


export const PreferencesPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <PageContainer>
      <PageHeader
        title="Cấu hình cá nhân"
        breadcrumbs={[{ label: 'Cá nhân', href: '/settings/preferences' }]}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            Về trang chủ
          </Button>
        }
      />

      <div className="space-y-6">
        <PreferenceSection
          title="Quản lí Ghi danh"
          description="Cấu hình cột hiển thị cho trang /enrollments (mỗi tab cấu hình riêng)"
          icon={<Table2 className="w-5 h-5" />}
          scopes={ENROLLMENT_SCOPES}
        />

        <PreferenceSection
          title="Danh sách Học viên"
          description="Cấu hình cột hiển thị cho trang /students (mỗi tab cấu hình riêng)"
          icon={<Users className="w-5 h-5" />}
          scopes={STUDENT_SCOPES}
        />
      </div>
    </PageContainer>
  );
};
