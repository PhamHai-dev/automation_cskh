import React, { useState, useRef, useMemo } from 'react';
import { automationApi } from '../api/automation.api';
import type {
  RichAttachmentItem,
  RichLinkItem,
  RichMessageMetadata,
} from '../types/automation.types';
import { BROADCAST_TEMPLATE_VARIABLES } from '../types/automation.types';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useToast } from '../../../components/ui/Toast';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Paperclip,
  Image as ImageIcon,
  Link2,
  Sparkles,
  AlertTriangle,
  AlertCircle,
  X,
  FileText,
  Film,
  FileArchive,
  ExternalLink,
  Plus,
  Type,
  Palette,
  MessageSquare,
  CheckCircle2,
  Download,
  Globe,
} from 'lucide-react';

// ─── Constants & Color Definitions ──────────────────────────────────────────

export const ZALO_LINE_COLORS = [
  {
    tag: 'red',
    label: 'Đỏ nổi bật',
    hex: '#db342e',
    zaloCode: 'c_db342e',
    bgClass: 'bg-[#db342e]',
    borderClass: 'border-[#db342e]',
  },
  {
    tag: 'orange',
    label: 'Cam cảnh báo',
    hex: '#f27806',
    zaloCode: 'c_f27806',
    bgClass: 'bg-[#f27806]',
    borderClass: 'border-[#f27806]',
  },
  {
    tag: 'yellow',
    label: 'Vàng tiêu điểm',
    hex: '#f7b503',
    zaloCode: 'c_f7b503',
    bgClass: 'bg-[#f7b503]',
    borderClass: 'border-[#f7b503]',
  },
  {
    tag: 'green',
    label: 'Xanh lá tích cực',
    hex: '#15a85f',
    zaloCode: 'c_15a85f',
    bgClass: 'bg-[#15a85f]',
    borderClass: 'border-[#15a85f]',
  },
] as const;

export const URGENCY_OPTIONS: Array<{
  value: 0 | 1 | 2;
  label: string;
  shortLabel: string;
  badgeClass: string;
}> = [
  {
    value: 0,
    label: 'Bình thường',
    shortLabel: 'Bình thường',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  {
    value: 1,
    label: '! Quan trọng',
    shortLabel: '! QUAN TRỌNG',
    badgeClass: 'bg-amber-50 text-[#f27806] border-amber-300',
  },
  {
    value: 2,
    label: '!! Khẩn cấp',
    shortLabel: '!! KHẨN CẤP',
    badgeClass: 'bg-rose-50 text-[#db342e] border-rose-300',
  },
];

// ─── Rich Tag Parser for Visual Preview ─────────────────────────────────────

interface StyleState {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  size?: 'big' | 'small';
}

const TAG_REGEX =
  /(\[\/?(?:b|i|u|s|red|orange|yellow|green|big|small)\]|\*\*[\s\S]+?\*\*)/gi;

/**
 * Strips rich formatting tags (`[b]`, `[red]`, etc.) for plain-text snippets.
 */
export function stripRichFormattingTags(input: string): string {
  if (!input) return '';
  return input
    .replace(/\[\/?(?:b|i|u|s|red|orange|yellow|green|big|small)\]/gi, '')
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1');
}

/**
 * Parses a text line with `[b]`, `[i]`, `[u]`, `[s]`, `[red]`, `[orange]`, `[yellow]`, `[green]`,
 * `[big]`, `[small]`, and `**bold**` into styled React spans.
 */
export function renderFormattedRichText(text: string): React.ReactNode {
  if (!text) return null;

  const tokens = text.split(TAG_REGEX).filter((t) => t !== '');
  const styleStack: StyleState[] = [{}];
  const elements: React.ReactNode[] = [];

  const currentStyle = (): StyleState => styleStack[styleStack.length - 1] || {};

  const pushMod = (mod: Partial<StyleState>) => {
    styleStack.push({ ...currentStyle(), ...mod });
  };

  const popMod = () => {
    if (styleStack.length > 1) {
      styleStack.pop();
    }
  };

  tokens.forEach((token, idx) => {
    const lower = token.toLowerCase();

    if (lower === '[b]') {
      pushMod({ bold: true });
      return;
    }
    if (lower === '[/b]') {
      popMod();
      return;
    }
    if (lower === '[i]') {
      pushMod({ italic: true });
      return;
    }
    if (lower === '[/i]') {
      popMod();
      return;
    }
    if (lower === '[u]') {
      pushMod({ underline: true });
      return;
    }
    if (lower === '[/u]') {
      popMod();
      return;
    }
    if (lower === '[s]') {
      pushMod({ strike: true });
      return;
    }
    if (lower === '[/s]') {
      popMod();
      return;
    }
    if (lower === '[red]') {
      pushMod({ color: '#db342e' });
      return;
    }
    if (lower === '[orange]') {
      pushMod({ color: '#f27806' });
      return;
    }
    if (lower === '[yellow]') {
      pushMod({ color: '#d99b00' });
      return;
    }
    if (lower === '[green]') {
      pushMod({ color: '#15a85f' });
      return;
    }
    if (
      lower === '[/red]' ||
      lower === '[/orange]' ||
      lower === '[/yellow]' ||
      lower === '[/green]'
    ) {
      popMod();
      return;
    }
    if (lower === '[big]') {
      pushMod({ size: 'big' });
      return;
    }
    if (lower === '[/big]') {
      popMod();
      return;
    }
    if (lower === '[small]') {
      pushMod({ size: 'small' });
      return;
    }
    if (lower === '[/small]') {
      popMod();
      return;
    }

    // Handle **bold** shorthand
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      const inner = token.slice(2, -2);
      const st = { ...currentStyle(), bold: true };
      elements.push(renderStyledSpan(inner, st, idx));
      return;
    }

    elements.push(renderStyledSpan(token, currentStyle(), idx));
  });

  return elements;
}

function renderStyledSpan(
  content: string,
  st: StyleState,
  key: number
): React.ReactNode {
  const classes: string[] = [];
  if (st.bold) classes.push('font-bold');
  if (st.italic) classes.push('italic');
  if (st.underline && st.strike) {
    classes.push('underline line-through');
  } else if (st.underline) {
    classes.push('underline underline-offset-2');
  } else if (st.strike) {
    classes.push('line-through');
  }

  if (st.size === 'big') {
    classes.push('text-[16px] leading-snug font-semibold');
  } else if (st.size === 'small') {
    classes.push('text-[11.5px] opacity-85');
  }

  const inlineStyle: React.CSSProperties = {};
  if (st.color) {
    inlineStyle.color = st.color;
  }

  if (classes.length === 0 && !st.color) {
    return <React.Fragment key={key}>{content}</React.Fragment>;
  }

  return (
    <span key={key} className={classes.join(' ')} style={inlineStyle}>
      {content}
    </span>
  );
}

// ─── File & Format Helpers ──────────────────────────────────────────────────

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function isImageAttachment(att: RichAttachmentItem): boolean {
  if (att.mimeType && att.mimeType.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(att.filename || att.url || '');
}

export function isVideoAttachment(att: RichAttachmentItem): boolean {
  if (att.mimeType && att.mimeType.startsWith('video/')) return true;
  return /\.(mp4|mov|webm|avi)$/i.test(att.filename || att.url || '');
}

async function detectImageDimensions(
  file: File
): Promise<{ width?: number; height?: number; objectUrl: string }> {
  const objectUrl = URL.createObjectURL(file);
  if (!file.type.startsWith('image/')) {
    return { objectUrl };
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth || undefined,
        height: img.naturalHeight || undefined,
        objectUrl,
      });
    };
    img.onerror = () => resolve({ objectUrl });
    img.src = objectUrl;
  });
}

function extractHostname(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch {
    return 'edura.vn';
  }
}

// ─── Component Props ────────────────────────────────────────────────────────

export interface SampleStudentPreviewData {
  fullName?: string;
  phone?: string;
  className?: string;
  packageName?: string;
  remainingSessions?: string;
  csName?: string;
  teacherName?: string;
}

export interface RichChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  metadata: RichMessageMetadata;
  onMetadataChange: (metadata: RichMessageMetadata) => void;
  sampleStudent?: SampleStudentPreviewData | null;
  placeholder?: string;
  rows?: number;
}

// ─── Main RichChatComposer Component ────────────────────────────────────────

export const RichChatComposer: React.FC<RichChatComposerProps> = ({
  value,
  onChange,
  metadata,
  onMetadataChange,
  sampleStudent,
  placeholder = 'Nhập nội dung tin nhắn gửi tới Phụ huynh / Học viên / Nhóm lớp... (Hỗ trợ Ctrl+V dán ảnh trực tiếp hoặc kéo thả file vào khung soạn thảo)',
  rows = 7,
}) => {
  const toast = useToast();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [previewPlatform, setPreviewPlatform] = useState<'ZALO' | 'LINE'>('ZALO');
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Inline builders state
  const [showLinkBuilder, setShowLinkBuilder] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkDescription, setLinkDescription] = useState('');
  const [linkButtonLabel, setLinkButtonLabel] = useState('Mở xem ngay');
  const [linkThumbnailUrl, setLinkThumbnailUrl] = useState('');

  const [showUrlAttachmentForm, setShowUrlAttachmentForm] = useState(false);
  const [attachmentUrlInput, setAttachmentUrlInput] = useState('');
  const [attachmentFilenameInput, setAttachmentFilenameInput] = useState('');
  const [attachmentTypeInput, setAttachmentTypeInput] = useState<
    'image/png' | 'application/pdf' | 'video/mp4'
  >('image/png');

  const urgency = metadata.urgency ?? 0;
  const attachments = metadata.attachments ?? [];
  const links = metadata.links ?? [];

  // ─── Update Metadata Helpers ────────────────────────────────────────────

  const setUrgency = (nextUrgency: 0 | 1 | 2) => {
    onMetadataChange({
      ...metadata,
      urgency: nextUrgency,
    });
  };

  const addAttachments = (newItems: RichAttachmentItem[]) => {
    onMetadataChange({
      ...metadata,
      attachments: [...attachments, ...newItems],
    });
  };

  const removeAttachment = (index: number) => {
    onMetadataChange({
      ...metadata,
      attachments: attachments.filter((_, idx) => idx !== index),
    });
  };

  const addLinkCard = () => {
    const trimmedUrl = linkUrl.trim();
    if (!trimmedUrl) {
      toast.warning('Vui lòng nhập URL liên kết (VD: https://edura.vn/lich-hoc)');
      return;
    }
    const normalizedUrl = /^https?:\/\//i.test(trimmedUrl)
      ? trimmedUrl
      : `https://${trimmedUrl}`;

    const newLink: RichLinkItem = {
      url: normalizedUrl,
      title: linkTitle.trim() || 'Thông tin từ Hệ thống Giáo dục Edura',
      description: linkDescription.trim() || undefined,
      buttonLabel: linkButtonLabel.trim() || 'Mở xem ngay',
      thumbnailUrl: linkThumbnailUrl.trim() || undefined,
    };

    onMetadataChange({
      ...metadata,
      links: [...links, newLink],
    });

    setLinkUrl('');
    setLinkTitle('');
    setLinkDescription('');
    setLinkButtonLabel('Mở xem ngay');
    setLinkThumbnailUrl('');
    setShowLinkBuilder(false);
    toast.success('Đã gắn thẻ Link / Nút bấm CTA vào tin nhắn');
  };

  const removeLinkCard = (index: number) => {
    onMetadataChange({
      ...metadata,
      links: links.filter((_, idx) => idx !== index),
    });
  };

  const handleAddAttachmentByUrl = () => {
    const trimmed = attachmentUrlInput.trim();
    if (!trimmed) {
      toast.warning('Vui lòng nhập đường dẫn URL của Ảnh hoặc File');
      return;
    }
    const normalizedUrl = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;

    const guessedName =
      attachmentFilenameInput.trim() ||
      normalizedUrl.split('/').pop()?.split('?')[0] ||
      (attachmentTypeInput === 'image/png'
        ? 'hinh-anh-dinh-kem.png'
        : attachmentTypeInput === 'video/mp4'
        ? 'video-bai-giang.mp4'
        : 'tai-lieu-hoc-tap.pdf');

    const item: RichAttachmentItem = {
      url: normalizedUrl,
      filename: guessedName,
      mimeType: attachmentTypeInput,
      size: 0,
    };

    addAttachments([item]);
    setAttachmentUrlInput('');
    setAttachmentFilenameInput('');
    setShowUrlAttachmentForm(false);
    toast.success(`Đã đính kèm "${guessedName}" vào tin nhắn`);
  };

  // ─── Text Formatting Toolbar Actions ────────────────────────────────────

  const wrapSelectionWithTag = (
    openTag: string,
    closeTag: string,
    defaultPlaceholder: string
  ) => {
    const el = textareaRef.current;
    if (!el) {
      onChange(`${value}${openTag}${defaultPlaceholder}${closeTag}`);
      return;
    }

    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selectedText = value.substring(start, end);
    const innerText = selectedText || defaultPlaceholder;

    const nextValue =
      value.substring(0, start) +
      openTag +
      innerText +
      closeTag +
      value.substring(end);

    onChange(nextValue);

    setTimeout(() => {
      el.focus();
      const newSelectionStart = start + openTag.length;
      const newSelectionEnd = newSelectionStart + innerText.length;
      el.setSelectionRange(newSelectionStart, newSelectionEnd);
    }, 0);
  };

  const insertListPrefix = (ordered: boolean) => {
    const el = textareaRef.current;
    if (!el) {
      const prefix = ordered ? '\n1. ' : '\n• ';
      onChange(`${value}${prefix}`);
      return;
    }

    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selected = value.substring(start, end);

    if (selected.trim().length > 0) {
      const lines = selected.split('\n');
      const formatted = lines
        .map((line, i) => {
          const clean = line.replace(/^(\s*(?:•|-|\*|\d+\.)\s+)/, '');
          return ordered ? `${i + 1}. ${clean}` : `• ${clean}`;
        })
        .join('\n');

      const nextValue =
        value.substring(0, start) + formatted + value.substring(end);
      onChange(nextValue);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start, start + formatted.length);
      }, 0);
    } else {
      const needsNewline = start > 0 && value[start - 1] !== '\n';
      const prefix = `${needsNewline ? '\n' : ''}${ordered ? '1. ' : '• '}`;
      const nextValue =
        value.substring(0, start) + prefix + value.substring(end);
      onChange(nextValue);
      setTimeout(() => {
        el.focus();
        const cursor = start + prefix.length;
        el.setSelectionRange(cursor, cursor);
      }, 0);
    }
  };

  const insertVariableAtCursor = (varKey: string) => {
    const token = `{{${varKey}}}`;
    const el = textareaRef.current;
    if (!el) {
      onChange(`${value}${token}`);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.substring(0, start) + token + value.substring(end);
    onChange(next);
    setTimeout(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    }, 0);
  };

  // ─── File Upload, Drag & Drop, and Clipboard Paste ──────────────────────

  const handleFilesSelected = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setUploadingFiles(true);
    try {
      // Pre-calculate image dimensions & local preview URLs
      const localDimensions = await Promise.all(
        files.map((file) => detectImageDimensions(file))
      );

      try {
        const res = await automationApi.uploadBroadcastAttachments(files);
        const uploadedItems: RichAttachmentItem[] = (res.files ?? []).map(
          (item, idx) => ({
            ...item,
            width: item.width ?? localDimensions[idx]?.width,
            height: item.height ?? localDimensions[idx]?.height,
          })
        );

        if (uploadedItems.length > 0) {
          addAttachments(uploadedItems);
          toast.success(`Đã tải lên ${uploadedItems.length} tệp đính kèm`);
          return;
        }
      } catch {
        // Fallback to local preview URL if backend upload route is unreachable
      }

      const fallbackItems: RichAttachmentItem[] = files.map((file, idx) => ({
        url: localDimensions[idx]?.objectUrl || URL.createObjectURL(file),
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        width: localDimensions[idx]?.width,
        height: localDimensions[idx]?.height,
      }));

      addAttachments(fallbackItems);
      toast.success(`Đã đính kèm ${fallbackItems.length} tệp vào tin nhắn`);
    } finally {
      setUploadingFiles(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          pastedFiles.push(file);
        }
      }
    }

    if (pastedFiles.length > 0) {
      e.preventDefault();
      handleFilesSelected(pastedFiles);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();
      if (key === 'b') {
        e.preventDefault();
        wrapSelectionWithTag('[b]', '[/b]', 'Chữ in đậm');
      } else if (key === 'i') {
        e.preventDefault();
        wrapSelectionWithTag('[i]', '[/i]', 'Chữ in nghiêng');
      } else if (key === 'u') {
        e.preventDefault();
        wrapSelectionWithTag('[u]', '[/u]', 'Chữ gạch chân');
      }
    }
  };

  // ─── Rendered Sample Text for Live Preview ──────────────────────────────

  const renderedWithVariables = useMemo(() => {
    const sampleMap: Record<string, string> = {
      student_name: sampleStudent?.fullName || 'Nguyễn Văn An',
      student_phone: sampleStudent?.phone || '0912345678',
      class_name:
        sampleStudent?.className && sampleStudent.className !== 'Chưa xếp lớp'
          ? sampleStudent.className
          : 'Lớp N5 - K01',
      enrollment_package:
        sampleStudent?.packageName || 'Khóa Tiếng Nhật N5 Cam Kết',
      remaining_sessions: sampleStudent?.remainingSessions || '12',
      cs_name:
        sampleStudent?.csName && sampleStudent.csName !== 'Chưa phân công'
          ? sampleStudent.csName
          : 'Trần Thị Hải Yến - CVHT01',
      teacher_name: sampleStudent?.teacherName || 'Sensei Minh Tâm',
    };

    return value.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return sampleMap[key] !== undefined ? sampleMap[key] : match;
    });
  }, [value, sampleStudent]);

  const imageAttachments = useMemo(
    () => attachments.filter(isImageAttachment),
    [attachments]
  );

  const fileAttachments = useMemo(
    () => attachments.filter((att) => !isImageAttachment(att)),
    [attachments]
  );

  return (
    <div className="space-y-4">
      {/* ─── Personalization Variable Chips ─────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between flex-wrap gap-1">
          <span className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            Chèn biến cá nhân hóa tự động theo từng Học viên:
          </span>
          <span className="text-[11px] text-text-muted">
            Bấm vào thẻ biến để chèn tại vị trí con trỏ
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {BROADCAST_TEMPLATE_VARIABLES.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => insertVariableAtCursor(v.key)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface border border-border hover:border-primary hover:bg-primary-soft/40 text-xs font-medium text-text-primary transition-colors shadow-2xs"
              title={`Chèn biến {{${v.key}}} (${v.label})`}
            >
              <Sparkles className="w-3 h-3 text-primary" />
              <span>{v.label}</span>
              <code className="text-[10px] text-primary font-mono bg-primary/10 px-1 rounded">
                {`{{${v.key}}}`}
              </code>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Side-by-Side Editor & Dual-Platform Live Preview ───────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* ─── Left Column: Real-Chat Rich Editor (7 cols) ──────────────── */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingOver(true);
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={handleDrop}
          className={`xl:col-span-7 rounded-2xl bg-surface border transition-all overflow-hidden shadow-xs ${
            isDraggingOver
              ? 'border-primary ring-2 ring-primary/20 bg-primary-soft/10'
              : 'border-border'
          }`}
        >
          {/* Row 1: Rich Formatting Toolbar (Zalo PC Style) */}
          <div className="px-3 py-2 bg-surface-muted/80 border-b border-border flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {/* Text Style Buttons: B / I / U / S */}
              <button
                type="button"
                onClick={() =>
                  wrapSelectionWithTag('[b]', '[/b]', 'Chữ in đậm')
                }
                className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface border border-transparent hover:border-border transition-colors"
                title="In đậm (Ctrl+B) — [b]...[/b]"
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  wrapSelectionWithTag('[i]', '[/i]', 'Chữ in nghiêng')
                }
                className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface border border-transparent hover:border-border transition-colors"
                title="In nghiêng (Ctrl+I) — [i]...[/i]"
              >
                <Italic className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  wrapSelectionWithTag('[u]', '[/u]', 'Chữ gạch chân')
                }
                className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface border border-transparent hover:border-border transition-colors"
                title="Gạch chân (Ctrl+U) — [u]...[/u]"
              >
                <Underline className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  wrapSelectionWithTag('[s]', '[/s]', 'Chữ gạch ngang')
                }
                className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface border border-transparent hover:border-border transition-colors"
                title="Gạch ngang — [s]...[/s]"
              >
                <Strikethrough className="w-4 h-4" />
              </button>

              <span className="h-4 w-px bg-border mx-1" />

              {/* 4 Standard Zalo & LINE Colors */}
              <div className="flex items-center gap-1 px-1" title="Màu chữ chuẩn Zalo PC & LINE Flex">
                <Palette className="w-3.5 h-3.5 text-text-muted mr-0.5" />
                {ZALO_LINE_COLORS.map((c) => (
                  <button
                    key={c.tag}
                    type="button"
                    onClick={() =>
                      wrapSelectionWithTag(
                        `[${c.tag}]`,
                        `[/${c.tag}]`,
                        c.label
                      )
                    }
                    className="w-5 h-5 rounded-full border border-white shadow-xs hover:scale-110 transition-transform flex items-center justify-center"
                    style={{ backgroundColor: c.hex }}
                    title={`Màu ${c.label} ([${c.tag}]...[/${c.tag}])`}
                  />
                ))}
              </div>

              <span className="h-4 w-px bg-border mx-1" />

              {/* Font Sizes: Big / Small */}
              <button
                type="button"
                onClick={() =>
                  wrapSelectionWithTag('[big]', '[/big]', 'TIÊU ĐỀ LỚN')
                }
                className="px-2 py-1 rounded-lg text-[11px] font-bold text-text-secondary hover:text-text-primary hover:bg-surface border border-transparent hover:border-border transition-colors inline-flex items-center gap-1"
                title="Chữ lớn tiêu đề — [big]...[/big]"
              >
                <Type className="w-3.5 h-3.5" />
                <span>Chữ lớn</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  wrapSelectionWithTag('[small]', '[/small]', 'Ghi chú nhỏ')
                }
                className="px-2 py-1 rounded-lg text-[11px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface border border-transparent hover:border-border transition-colors"
                title="Chữ nhỏ chú thích — [small]...[/small]"
              >
                Chữ nhỏ
              </button>

              <span className="h-4 w-px bg-border mx-1" />

              {/* Bullet & Numbered Lists */}
              <button
                type="button"
                onClick={() => insertListPrefix(false)}
                className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface border border-transparent hover:border-border transition-colors"
                title="Danh sách chấm tròn (• )"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertListPrefix(true)}
                className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface border border-transparent hover:border-border transition-colors"
                title="Danh sách đánh số (1. )"
              >
                <ListOrdered className="w-4 h-4" />
              </button>
            </div>

            {/* Urgency Selector (Bình thường / ! Quan trọng / !! Khẩn cấp) */}
            <div className="flex items-center gap-1 bg-surface px-1.5 py-1 rounded-xl border border-border/80">
              {URGENCY_OPTIONS.map((opt) => {
                const active = urgency === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setUrgency(opt.value)}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all ${
                      active
                        ? opt.value === 2
                          ? 'bg-[#db342e] text-white shadow-2xs'
                          : opt.value === 1
                          ? 'bg-[#f27806] text-white shadow-2xs'
                          : 'bg-slate-800 text-white shadow-2xs'
                        : 'text-text-secondary hover:bg-surface-muted'
                    }`}
                    title={`Mức độ ưu tiên tin nhắn: ${opt.label}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Urgency Active Banner inside Composer */}
          {urgency > 0 && (
            <div
              className={`px-3.5 py-1.5 text-xs font-bold flex items-center justify-between border-b ${
                urgency === 2
                  ? 'bg-rose-50 text-[#db342e] border-rose-200'
                  : 'bg-amber-50 text-[#f27806] border-amber-200'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {urgency === 2 ? (
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>
                  {urgency === 2
                    ? '!! TIN NHẮN KHẨN CẤP — Hiển thị nhãn đỏ Khẩn cấp trên khung chat Zalo & thẻ LINE Flex'
                    : '! TIN NHẮN QUAN TRỌNG — Hiển thị nhãn cam Quan trọng trên khung chat Zalo & thẻ LINE Flex'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setUrgency(0)}
                className="text-[11px] underline opacity-80 hover:opacity-100"
              >
                Bỏ đánh dấu
              </button>
            </div>
          )}

          {/* Main Textarea */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              rows={rows}
              placeholder={placeholder}
              className="w-full px-3.5 py-3 text-sm bg-surface text-text-primary focus:outline-none leading-relaxed resize-y border-0"
              required
            />
            {isDraggingOver && (
              <div className="absolute inset-0 bg-primary/10 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                <div className="px-4 py-2.5 rounded-xl bg-surface border-2 border-dashed border-primary text-primary font-bold text-xs flex items-center gap-2 shadow-md">
                  <Paperclip className="w-4 h-4" />
                  <span>Thả Hình ảnh / Tài liệu vào đây để đính kèm ngay</span>
                </div>
              </div>
            )}
          </div>

          {/* Attachment & Link Builder Action Bar */}
          <div className="px-3.5 py-2.5 bg-surface-muted/60 border-t border-border flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.zip,.mp4"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    handleFilesSelected(e.target.files);
                  }
                }}
              />

              <Button
                type="button"
                variant="outline"
                size="sm"
                isLoading={uploadingFiles}
                leftIcon={<Paperclip className="w-3.5 h-3.5 text-primary" />}
                onClick={() => fileInputRef.current?.click()}
              >
                + Đính kèm Ảnh / File
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                leftIcon={<ImageIcon className="w-3.5 h-3.5 text-indigo-600" />}
                onClick={() => {
                  setShowUrlAttachmentForm((prev) => !prev);
                  setShowLinkBuilder(false);
                }}
              >
                + Thêm URL Ảnh/File
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                leftIcon={<Link2 className="w-3.5 h-3.5 text-emerald-600" />}
                onClick={() => {
                  setShowLinkBuilder((prev) => !prev);
                  setShowUrlAttachmentForm(false);
                }}
              >
                + Gắn Link / Nút bấm
              </Button>
            </div>

            <div className="text-[11px] text-text-muted flex items-center gap-2">
              <span>Hỗ trợ kéo thả & Ctrl+V dán ảnh</span>
              <span>·</span>
              <span>{value.length} ký tự</span>
            </div>
          </div>

          {/* ─── Inline Form: Add Attachment by URL ───────────────────────── */}
          {showUrlAttachmentForm && (
            <div className="p-3.5 bg-indigo-50/50 border-t border-indigo-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                  Đính kèm Hình ảnh / Tài liệu qua URL trực tiếp
                </span>
                <button
                  type="button"
                  onClick={() => setShowUrlAttachmentForm(false)}
                  className="text-text-muted hover:text-text-primary"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-2">
                  <Input
                    placeholder="URL Ảnh hoặc File (VD: https://edura.vn/files/lich-hoc.png) *"
                    value={attachmentUrlInput}
                    onChange={(e) => setAttachmentUrlInput(e.target.value)}
                  />
                </div>
                <select
                  value={attachmentTypeInput}
                  onChange={(e) =>
                    setAttachmentTypeInput(e.target.value as any)
                  }
                  className="h-10 px-3 rounded-xl border border-border bg-white text-xs font-semibold text-text-primary"
                >
                  <option value="image/png">Hình ảnh (.png, .jpg, .webp)</option>
                  <option value="application/pdf">Tài liệu (.pdf, .docx, .xlsx)</option>
                  <option value="video/mp4">Video (.mp4)</option>
                </select>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Tên tệp hiển thị (tùy chọn, VD: Lich-hoc-tuan-moi.pdf)"
                    value={attachmentFilenameInput}
                    onChange={(e) => setAttachmentFilenameInput(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                  onClick={handleAddAttachmentByUrl}
                >
                  Thêm tệp
                </Button>
              </div>
            </div>
          )}

          {/* ─── Inline Form: Link Card / CTA Button Builder ──────────────── */}
          {showLinkBuilder && (
            <div className="p-3.5 bg-emerald-50/50 border-t border-emerald-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-emerald-600" />
                  Tạo Thẻ Link Preview (Zalo) & Nút bấm CTA (LINE Flex)
                </span>
                <button
                  type="button"
                  onClick={() => setShowLinkBuilder(false)}
                  className="text-text-muted hover:text-text-primary"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <Input
                  label="URL liên kết *"
                  placeholder="https://edura.vn/lich-hoc"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                />
                <Input
                  label="Tiêu đề Link"
                  placeholder="VD: Lịch học & Tài liệu tuần mới"
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-2">
                  <Input
                    label="Mô tả ngắn (Tùy chọn)"
                    placeholder="VD: Bấm vào để xem chi tiết lịch học và tải bài tập về nhà..."
                    value={linkDescription}
                    onChange={(e) => setLinkDescription(e.target.value)}
                  />
                </div>
                <Input
                  label="Nhãn nút bấm (LINE Flex CTA)"
                  placeholder="Mở xem ngay"
                  value={linkButtonLabel}
                  onChange={(e) => setLinkButtonLabel(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-emerald-800">
                  Zalo sẽ hiển thị thẻ Link Card kèm tiêu đề; LINE sẽ tạo nút bấm CTA màu xanh lá.
                </span>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                  onClick={addLinkCard}
                >
                  Gắn Link / Nút bấm
                </Button>
              </div>
            </div>
          )}

          {/* ─── Attached Files / Images Gallery Strip ────────────────────── */}
          {(attachments.length > 0 || links.length > 0) && (
            <div className="p-3.5 bg-surface border-t border-border space-y-3">
              {attachments.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-primary" />
                    <span>Tệp & Hình ảnh đính kèm ({attachments.length})</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {attachments.map((att, idx) => {
                      const isImg = isImageAttachment(att);
                      const isVid = isVideoAttachment(att);
                      return (
                        <div
                          key={`${att.filename}-${idx}`}
                          className="flex items-center justify-between gap-2.5 p-2 rounded-xl border border-border bg-surface-muted/50 hover:bg-surface-muted transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {isImg ? (
                              <img
                                src={att.url}
                                alt={att.filename}
                                className="w-11 h-11 rounded-lg object-cover border border-border shrink-0 bg-white"
                              />
                            ) : (
                              <div className="w-11 h-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                {isVid ? (
                                  <Film className="w-5 h-5" />
                                ) : /\.(zip|rar|7z)$/i.test(att.filename) ? (
                                  <FileArchive className="w-5 h-5" />
                                ) : (
                                  <FileText className="w-5 h-5" />
                                )}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-text-primary truncate">
                                {att.filename}
                              </div>
                              <div className="text-[10px] text-text-muted flex items-center gap-1.5">
                                <span>{isImg ? 'Hình ảnh' : isVid ? 'Video' : 'Tài liệu'}</span>
                                {att.size > 0 && <span>• {formatBytes(att.size)}</span>}
                                {att.width && att.height && (
                                  <span>
                                    • {att.width}×{att.height}px
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeAttachment(idx)}
                            className="p-1 rounded-lg text-text-muted hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
                            title="Gỡ tệp đính kèm này"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {links.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Thẻ Link & Nút bấm CTA ({links.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {links.map((lnk, idx) => (
                      <div
                        key={`${lnk.url}-${idx}`}
                        className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/40"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                            <ExternalLink className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-text-primary truncate">
                                {lnk.title || lnk.url}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
                                CTA: {lnk.buttonLabel || 'Mở xem ngay'}
                              </span>
                            </div>
                            <div className="text-[11px] text-emerald-800 truncate">
                              {lnk.url}
                              {lnk.description ? ` — ${lnk.description}` : ''}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLinkCard(idx)}
                          className="p-1 rounded-lg text-text-muted hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
                          title="Xóa thẻ Link này"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Right Column: Dual-Platform Live Preview (5 cols) ────────── */}
        <div className="xl:col-span-5 rounded-2xl border border-border bg-surface overflow-hidden shadow-xs flex flex-col">
          {/* Platform Switcher Header */}
          <div className="px-3.5 py-2.5 bg-surface-muted/80 border-b border-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPreviewPlatform('ZALO')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  previewPlatform === 'ZALO'
                    ? 'bg-[#0068FF] text-white shadow-xs'
                    : 'bg-surface text-text-secondary border border-border hover:bg-surface-muted'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Xem trước Zalo</span>
              </button>

              <button
                type="button"
                onClick={() => setPreviewPlatform('LINE')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  previewPlatform === 'LINE'
                    ? 'bg-[#06C755] text-white shadow-xs'
                    : 'bg-surface text-text-secondary border border-border hover:bg-surface-muted'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Xem trước LINE</span>
              </button>
            </div>

            <span className="text-[11px] text-text-muted truncate">
              Mẫu: <strong>{sampleStudent?.fullName || 'Nguyễn Văn An'}</strong>
            </span>
          </div>

          {/* ─── Tab 1: Zalo PC Real Chat Preview ─────────────────────────── */}
          {previewPlatform === 'ZALO' && (
            <div className="p-4 bg-[#e4e8f0] min-h-[290px] max-h-[420px] overflow-y-auto space-y-2.5">
              {/* Simulated Zalo Header Bar */}
              <div className="flex items-center justify-between text-[11px] text-slate-600 pb-1 border-b border-slate-300/80">
                <span className="font-bold text-[#0068FF] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#0068FF]" />
                  Khung chat Zalo PC — Nhóm Chăm sóc Học viên
                </span>
                <span>Hôm nay</span>
              </div>

              {/* Image Attachments Bubble (Zalo sends images as photo bubbles) */}
              {imageAttachments.length > 0 && (
                <div className="grid grid-cols-2 gap-1.5 max-w-[88%]">
                  {imageAttachments.map((img, i) => (
                    <div
                      key={i}
                      className="rounded-xl overflow-hidden border border-white/80 bg-white shadow-xs"
                    >
                      <img
                        src={img.url}
                        alt={img.filename}
                        className="w-full h-28 object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Main Zalo Rich Text Bubble */}
              <div className="max-w-[92%] rounded-2xl rounded-tl-sm bg-white p-3.5 shadow-xs border border-slate-200/90 space-y-2">
                {/* Urgency Badge on Zalo */}
                {urgency === 2 && (
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#db342e] text-white text-[10px] font-extrabold uppercase tracking-wide">
                    <AlertCircle className="w-3 h-3" />
                    <span>!! KHẨN CẤP</span>
                  </div>
                )}
                {urgency === 1 && (
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#f27806] text-white text-[10px] font-extrabold uppercase tracking-wide">
                    <AlertTriangle className="w-3 h-3" />
                    <span>! QUAN TRỌNG</span>
                  </div>
                )}

                <div className="text-[13.5px] text-slate-900 whitespace-pre-wrap leading-relaxed break-words">
                  {renderedWithVariables.trim() ? (
                    renderFormattedRichText(renderedWithVariables)
                  ) : (
                    <span className="text-slate-400 italic">
                      Nội dung tin nhắn Zalo sẽ hiển thị trực tiếp tại đây...
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 pt-0.5">
                  <span>Vừa xong</span>
                  <CheckCircle2 className="w-3 h-3 text-[#0068FF]" />
                </div>
              </div>

              {/* Non-Image File Cards on Zalo */}
              {fileAttachments.map((att, idx) => (
                <div
                  key={idx}
                  className="max-w-[88%] rounded-xl bg-white p-2.5 shadow-xs border border-slate-200 flex items-center justify-between gap-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#0068FF] flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 truncate">
                        {att.filename}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {att.size > 0 ? formatBytes(att.size) : 'Tệp đính kèm Zalo'}
                      </div>
                    </div>
                  </div>
                  <Download className="w-4 h-4 text-slate-400 shrink-0" />
                </div>
              ))}

              {/* Native Zalo Link Preview Card (`sendLink`) */}
              {links.map((lnk, idx) => (
                <div
                  key={idx}
                  className="max-w-[88%] rounded-xl bg-white overflow-hidden shadow-xs border border-slate-200"
                >
                  <div className="p-3 bg-slate-50 border-b border-slate-100 flex items-start gap-2.5">
                    <div className="w-10 h-10 rounded-lg bg-[#0068FF]/10 text-[#0068FF] flex items-center justify-center shrink-0">
                      <Globe className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-semibold text-[#0068FF] uppercase tracking-wider truncate">
                        {extractHostname(lnk.url)}
                      </div>
                      <div className="text-xs font-bold text-slate-900 line-clamp-1 mt-0.5">
                        {lnk.title || lnk.url}
                      </div>
                      {lnk.description && (
                        <div className="text-[11px] text-slate-600 line-clamp-2 mt-0.5">
                          {lnk.description}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-[#0068FF] flex items-center justify-between bg-white">
                    <span className="truncate">{lnk.url}</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0 ml-1" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ─── Tab 2: LINE OA / Group Flex Message Card Preview ─────────── */}
          {previewPlatform === 'LINE' && (
            <div className="p-4 bg-[#8cabd9] min-h-[290px] max-h-[420px] overflow-y-auto space-y-2.5">
              {/* Simulated LINE Header Bar */}
              <div className="flex items-center justify-between text-[11px] text-white/95 pb-1 border-b border-white/25">
                <span className="font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#06C755]" />
                  LINE Official Account / Nhóm LINE (Flex Message)
                </span>
                <span>Flex Bubble</span>
              </div>

              {/* LINE Flex Message Card Container */}
              <div className="max-w-[90%] rounded-2xl bg-white overflow-hidden shadow-md border border-white/60">
                {/* Optional Urgency Banner Header inside LINE Flex */}
                {urgency === 2 && (
                  <div className="px-3.5 py-2 bg-[#db342e] text-white text-xs font-extrabold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>!! THÔNG BÁO KHẨN CẤP</span>
                  </div>
                )}
                {urgency === 1 && (
                  <div className="px-3.5 py-2 bg-[#f27806] text-white text-xs font-extrabold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>! THÔNG BÁO QUAN TRỌNG</span>
                  </div>
                )}

                {/* Hero Image inside LINE Flex (if image attached) */}
                {imageAttachments.length > 0 && (
                  <div className="border-b border-slate-100">
                    <img
                      src={imageAttachments[0].url}
                      alt={imageAttachments[0].filename}
                      className="w-full h-36 object-cover"
                    />
                    {imageAttachments.length > 1 && (
                      <div className="px-3 py-1 bg-slate-900/80 text-white text-[10px] font-semibold">
                        + {imageAttachments.length - 1} hình ảnh đính kèm khác
                      </div>
                    )}
                  </div>
                )}

                {/* Flex Body with Styled Spans */}
                <div className="p-3.5 space-y-2">
                  <div className="text-[13.5px] text-slate-900 whitespace-pre-wrap leading-relaxed break-words">
                    {renderedWithVariables.trim() ? (
                      renderFormattedRichText(renderedWithVariables)
                    ) : (
                      <span className="text-slate-400 italic">
                        Nội dung thẻ LINE Flex Message sẽ hiển thị tại đây...
                      </span>
                    )}
                  </div>
                </div>

                {/* Flex Footer CTA Buttons (Links + File Downloads) */}
                {(links.length > 0 || fileAttachments.length > 0) && (
                  <div className="px-3.5 pb-3.5 pt-1 space-y-1.5 border-t border-slate-100">
                    {links.map((lnk, idx) => (
                      <div key={`lnk-${idx}`} className="space-y-1">
                        {lnk.title && (
                          <div className="text-[11px] font-bold text-slate-700 pt-1">
                            {lnk.title}
                          </div>
                        )}
                        <div className="w-full py-2 px-3 rounded-xl bg-[#06C755] text-white text-xs font-bold text-center flex items-center justify-center gap-1.5 shadow-2xs">
                          <span>{lnk.buttonLabel || 'Mở xem ngay'}</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    ))}

                    {fileAttachments.map((att, idx) => (
                      <div
                        key={`file-${idx}`}
                        className="w-full py-2 px-3 rounded-xl bg-emerald-50 text-[#06C755] border border-[#06C755]/30 text-xs font-bold text-center flex items-center justify-center gap-1.5"
                      >
                        <Paperclip className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Tải tệp: {att.filename}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Dual-Platform Explanation Footer */}
          <div className="px-3.5 py-2.5 bg-surface-muted/90 border-t border-border text-[11px] text-text-secondary leading-snug">
            <strong className="text-text-primary">Cơ chế đồng bộ đa nền tảng:</strong>{' '}
            Trên <strong>Zalo</strong>: gửi định dạng chữ nguyên bản + File/Link Card. Trên{' '}
            <strong>LINE</strong>: tự động đóng gói thành thẻ <strong>Flex Message</strong> có
            màu sắc, in đậm/nghiêng và nút bấm mở Link!
          </div>
        </div>
      </div>
    </div>
  );
};
