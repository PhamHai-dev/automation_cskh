import { useState } from 'react';
import { Settings } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { omnichannelApi, type CareGroupRules } from '../api/omnichannel.api';
import { inboxError } from '../utils/inbox';

export function CareGroupRulesButton({ onSaved }: { onSaved: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<CareGroupRules | null>(null);
  const [notes, setNotes] = useState('');
  const [name, setName] = useState('01 - HV_001 Nguyễn Văn An N4');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  if (!user?.roles.some(role => role === 'ADMIN' || role === 'MANAGE')) return null;
  const load = async () => {
    setOpen(true); setLoading(true); setConfig(null); setError(''); setResult('');
    try { const data = await omnichannelApi.getCareGroupRules(); setConfig(data); setNotes(data.jlptNotes.join(', ')); }
    catch (e) { setError(inboxError(e, 'Không tải được cấu hình.')); }
    finally { setLoading(false); }
  };
  const rules = () => ({ enabled: config!.enabled, kaiwaTemplate: config!.kaiwaTemplate, jlptTemplate: config!.jlptTemplate,
    jlptNotes: notes.split(',').map(value => value.trim()).filter(Boolean) });
  const save = async () => {
    if (!config) return;
    setBusy(true); setError('');
    try { await omnichannelApi.saveCareGroupRules(rules(), config.updatedAt); setOpen(false); toast.success('Đã lưu quy tắc. Bấm Đồng bộ & Tự động gắn nhóm khi muốn áp dụng.'); onSaved(); }
    catch (e) { setError(inboxError(e, 'Không lưu được cấu hình.')); }
    finally { setBusy(false); }
  };
  const preview = async () => {
    if (!config) return;
    setBusy(true); setError(''); setResult('');
    try {
      const data = await omnichannelApi.previewCareGroupRules(rules(), name);
      setResult(data ? `${data.programType === 'KAIWA' ? 'Kaiwa' : 'JLPT'} · ${data.csCode} · ${data.studentId}${data.levelNote ? ' · Ghi chú: ' + data.levelNote : ''}` : 'Không khớp mẫu nào.');
    } catch (e) { setError(inboxError(e, 'Không kiểm tra được mẫu.')); }
    finally { setBusy(false); }
  };
  return <>
    <Button variant="outline" size="sm" leftIcon={<Settings className="h-4 w-4" />} onClick={() => void load()}>Quy tắc tên nhóm</Button>
    <Modal isOpen={open} onClose={() => { if (!busy) setOpen(false); }} title="Quy tắc tên nhóm chăm sóc" size="lg" closeOnOutsideClick={!busy}
      footer={<><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Hủy</Button><Button variant="primary" disabled={!config || loading} isLoading={busy} onClick={() => void save()}>Lưu cấu hình</Button></>}>
      <div className="space-y-4 text-sm">
        {loading && <p role="status">Đang tải cấu hình…</p>}
        {error && <div role="alert" className="space-y-2 text-danger"><p>{error}</p><Button variant="outline" size="sm" disabled={busy} onClick={() => void load()}>Tải lại cấu hình</Button></div>}
        {config && <>
          <label className="flex items-center gap-2"><input type="checkbox" checked={config.enabled} onChange={e => { setConfig({ ...config, enabled: e.target.checked }); setResult(''); }} />Tự động liên kết theo tên nhóm</label>
          <Input label="Mẫu tên nhóm Kaiwa" value={config.kaiwaTemplate} onChange={e => { setConfig({ ...config, kaiwaTemplate: e.target.value }); setResult(''); }} />
          <Input label="Mẫu tên nhóm JLPT" value={config.jlptTemplate} onChange={e => { setConfig({ ...config, jlptTemplate: e.target.value }); setResult(''); }} />
          <p className="text-xs leading-5 text-text-secondary">Dùng mỗi trường đúng một lần: {'{csNumber}'}, {'{studentId}'}, {'{studentName}'}. JLPT thêm {'{level}'} ở cuối. Các trường phải có dấu hoặc khoảng trắng phân cách.</p>
          <Input label="Ghi chú trình độ JLPT (phân cách bằng dấu phẩy)" value={notes} onChange={e => { setNotes(e.target.value); setResult(''); }} />
          <p className="text-xs leading-5 text-text-secondary">Các ghi chú trên dùng để nhận diện tên nhóm JLPT. Tên không có ghi chú khớp sẽ được xét theo mẫu Kaiwa. Trình độ không được dùng để chọn nhóm cho học viên. Nhiều nhóm cùng khớp sẽ yêu cầu chọn thủ công.</p>
          <div className="space-y-3 rounded-xl border border-border p-4">
            <Input label="Tên nhóm để kiểm tra" value={name} onChange={e => { setName(e.target.value); setResult(''); }} />
            <Button variant="outline" size="sm" disabled={busy || !name.trim()} onClick={() => void preview()}>Kiểm tra nhận diện</Button>
            {result && <p role="status" className="break-words text-text-primary">{result}</p>}
          </div>
          <p className="text-xs leading-5 text-text-muted">Cấu hình dùng chung toàn hệ thống. Lưu không đổi tên nhóm trên Zalo/LINE, không gửi tin và không tự chạy đồng bộ.</p>
        </>}
      </div>
    </Modal>
  </>;
}
