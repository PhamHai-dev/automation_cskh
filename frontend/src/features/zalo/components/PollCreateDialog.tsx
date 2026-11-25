import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';

interface PollCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: PollCreateData) => void | Promise<void>;
}

export interface PollCreateData {
  question: string;
  options: string[];
  allowMulti: boolean;
  anonymous: boolean;
  expireMs?: number;
}

export const PollCreateDialog: React.FC<PollCreateDialogProps> = ({ open, onClose, onSubmit }) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowMulti, setAllowMulti] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [expireMs, setExpireMs] = useState<number | undefined>();
  const [saving, setSaving] = useState(false);
  const handleSubmit = async () => {
    const trimmed = options.map((value) => value.trim()).filter(Boolean);
    if (saving || !question.trim() || trimmed.length < 2) return;
    setSaving(true);
    try {
      await onSubmit({ question: question.trim(), options: trimmed, allowMulti, anonymous, expireMs });
      setQuestion(''); setOptions(['', '']); setAllowMulti(false); setAnonymous(false); setExpireMs(undefined);
      onClose();
    } catch { /* The caller reports the API error. Keep the draft for retry. */ }
    finally { setSaving(false); }
  };
  return <Modal isOpen={open} onClose={() => { if (!saving) onClose(); }} title="Tạo bình chọn" size="sm" closeOnOutsideClick={!saving}
    footer={<><Button variant="outline" size="sm" disabled={saving} onClick={onClose}>Hủy</Button><Button variant="primary" size="sm" isLoading={saving}
      disabled={saving || !question.trim() || options.filter((option) => option.trim()).length < 2} onClick={() => void handleSubmit()}>Tạo bình chọn</Button></>}>
    <div className="space-y-4">
      <Input label="Câu hỏi" value={question} disabled={saving} onChange={(e) => setQuestion(e.target.value)} placeholder="Bạn muốn hỏi điều gì?" />
      <div className="space-y-2">
        {options.map((option, index) => <div key={index} className="flex min-w-0 items-end gap-2">
          <div className="min-w-0 flex-1"><Input label={`Lựa chọn ${index + 1}`} value={option} disabled={saving} onChange={(e) => setOptions((items) => items.map((item, i) => i === index ? e.target.value : item))} /></div>
          {options.length > 2 && <Button variant="ghost" size="icon" disabled={saving} aria-label={`Xóa lựa chọn ${index + 1}`} onClick={() => setOptions((items) => items.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>}
        </div>)}
        {options.length < 10 && <Button variant="ghost" size="sm" disabled={saving} leftIcon={<Plus className="h-4 w-4" />} onClick={() => setOptions((items) => [...items, ''])}>Thêm lựa chọn</Button>}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={allowMulti} disabled={saving} onChange={(e) => setAllowMulti(e.target.checked)} />Cho phép nhiều lựa chọn</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={anonymous} disabled={saving} onChange={(e) => setAnonymous(e.target.checked)} />Bình chọn ẩn danh</label>
      <Select label="Thời hạn" value={expireMs ?? ''} disabled={saving} onChange={(e) => setExpireMs(e.target.value ? Number(e.target.value) : undefined)} options={[
        { value: '', label: 'Không giới hạn' }, { value: 3600000, label: '1 giờ' }, { value: 21600000, label: '6 giờ' },
        { value: 43200000, label: '12 giờ' }, { value: 86400000, label: '1 ngày' }, { value: 259200000, label: '3 ngày' }, { value: 604800000, label: '7 ngày' },
      ]} />
    </div>
  </Modal>;
};
