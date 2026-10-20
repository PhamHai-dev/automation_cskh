/**
 * rich-message.compiler.ts — Multi-Channel Rich Message Compiler for Zalo (`zca-js`) & LINE (`@line/bot-sdk`).
 *
 * Responsibilities:
 *   1. Parse inline rich-text markup tags (`[b]`, `[i]`, `[u]`, `[s]`, `[red]`, `[orange]`, `[yellow]`,
 *      `[green]`, `[big]`, `[small]`, `**bold**`, `*italic*`, `__underline__`, `~~strike~~`, and bullet/numbered lists)
 *      AFTER `{{variable}}` template substitution so character offsets (`{ start, len, st }`) are always exact.
 *   2. Compile `lineFlexSpans` for LINE Official Account Flex Message rendering.
 *   3. Build Zalo (`zca-js`) `sendMessage` & `sendLink` payloads, resolving uploaded attachments on disk.
 *   4. Build LINE (`@line/bot-sdk`) `messages` payloads (Flex Bubble with urgency badge, styled spans,
 *      hero/attachment cards, and URI CTA buttons, or plain text when unstyled).
 */

import fs from 'fs';
import path from 'path';
import type {
  RichAttachmentItem,
  RichLinkItem,
  RichMessageMetadata,
  RichTextStyleSpan,
} from '../line/line-dispatcher.contract';

export interface LineFlexSpan {
  type: 'span';
  text: string;
  weight?: 'bold';
  style?: 'italic';
  decoration?: 'underline' | 'line-through';
  color?: string;
  size?: string;
}

export interface CompiledRichTextResult {
  cleanText: string;
  styles: RichTextStyleSpan[];
  lineFlexSpans: LineFlexSpan[];
}

export interface ZaloAttachmentSourceObject {
  data: Buffer;
  filename: `${string}.${string}`;
  metadata: {
    totalSize: number;
    width?: number;
    height?: number;
  };
}

export interface ZaloMessageContentPayload {
  msg: string;
  styles?: RichTextStyleSpan[];
  urgency?: 0 | 1 | 2;
  attachments?: ZaloAttachmentSourceObject[];
}

export interface ZaloSendPayloadResult {
  messagePayload: string | ZaloMessageContentPayload;
  linksToSend: Array<{ link: string; msg?: string }>;
}

const TAG_TO_ZALO_STYLE: Record<string, string> = {
  b: 'b',
  bold: 'b',
  i: 'i',
  italic: 'i',
  u: 'u',
  underline: 'u',
  s: 's',
  strike: 's',
  red: 'c_db342e',
  orange: 'c_f27806',
  yellow: 'c_f7b503',
  green: 'c_15a85f',
  big: 'f_18',
  large: 'f_18',
  small: 'f_13',
};

const CANONICAL_TAG_MAP: Record<string, string> = {
  b: 'b',
  bold: 'b',
  i: 'i',
  italic: 'i',
  u: 'u',
  underline: 'u',
  s: 's',
  strike: 's',
  red: 'red',
  orange: 'orange',
  yellow: 'yellow',
  green: 'green',
  big: 'big',
  large: 'big',
  small: 'small',
};

const COLOR_HEX_MAP: Record<string, string> = {
  c_db342e: '#db342e',
  c_f27806: '#f27806',
  c_f7b503: '#f7b503',
  c_15a85f: '#15a85f',
};

const SIZE_FLEX_MAP: Record<string, string> = {
  f_13: 'sm',
  f_18: 'lg',
};

/**
 * Convert Markdown inline syntax (`**bold**`, `__underline__`, `~~strike~~`, `*italic*`)
 * into canonical BBCode tags (`[b]...[/b]`, `[u]...[/u]`, `[s]...[/s]`, `[i]...[/i]`)
 * so a single stack-based parser can compute exact character offsets even with nested tags.
 */
function normalizeMarkdownToTags(input: string): string {
  if (!input) return '';

  let normalized = input;

  // **bold** -> [b]bold[/b]
  normalized = normalized.replace(/\*\*([^\n*]+?)\*\*/g, '[b]$1[/b]');

  // __underline__ -> [u]underline[/u]
  normalized = normalized.replace(/__([^\n_]+?)__/g, '[u]$1[/u]');

  // ~~strike~~ -> [s]strike[/s]
  normalized = normalized.replace(/~~([^\n~]+?)~~/g, '[s]$1[/s]');

  // *italic* -> [i]italic[/i] (avoid matching ** or bullet * at start of line)
  normalized = normalized.replace(
    /(?<!\*)\*(?!\s|\*)([^\n*]+?)(?<!\s|\*)\*(?!\*)/g,
    '[i]$1[/i]',
  );

  return normalized;
}

/**
 * Build LINE Flex `span` items from `cleanText` and `{ start, len, st }` spans.
 */
export function buildLineFlexSpansFromStyles(
  cleanText: string,
  styles: RichTextStyleSpan[],
): LineFlexSpan[] {
  if (!cleanText) return [];

  const inlineStyles = styles.filter(
    (s) => s.st !== 'lst_1' && s.st !== 'lst_2' && s.len > 0,
  );

  if (inlineStyles.length === 0) {
    return [{ type: 'span', text: cleanText }];
  }

  const textLen = cleanText.length;
  const boundarySet = new Set<number>([0, textLen]);

  for (const s of inlineStyles) {
    const start = Math.max(0, Math.min(textLen, s.start));
    const end = Math.max(0, Math.min(textLen, s.start + s.len));
    if (end > start) {
      boundarySet.add(start);
      boundarySet.add(end);
    }
  }

  const boundaries = Array.from(boundarySet).sort((a, b) => a - b);
  const rawSpans: LineFlexSpan[] = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const segStart = boundaries[i];
    const segEnd = boundaries[i + 1];
    if (segEnd <= segStart) continue;

    const segText = cleanText.slice(segStart, segEnd);
    if (!segText) continue;

    const span: LineFlexSpan = {
      type: 'span',
      text: segText,
    };

    for (const s of inlineStyles) {
      const sStart = Math.max(0, Math.min(textLen, s.start));
      const sEnd = Math.max(0, Math.min(textLen, s.start + s.len));
      if (sStart <= segStart && sEnd >= segEnd) {
        if (s.st === 'b') {
          span.weight = 'bold';
        } else if (s.st === 'i') {
          span.style = 'italic';
        } else if (s.st === 'u') {
          span.decoration = 'underline';
        } else if (s.st === 's' && !span.decoration) {
          span.decoration = 'line-through';
        } else if (COLOR_HEX_MAP[s.st]) {
          span.color = COLOR_HEX_MAP[s.st];
        } else if (SIZE_FLEX_MAP[s.st]) {
          span.size = SIZE_FLEX_MAP[s.st];
        }
      }
    }

    const prev = rawSpans[rawSpans.length - 1];
    if (
      prev &&
      prev.weight === span.weight &&
      prev.style === span.style &&
      prev.decoration === span.decoration &&
      prev.color === span.color &&
      prev.size === span.size
    ) {
      prev.text += span.text;
    } else {
      rawSpans.push(span);
    }
  }

  return rawSpans;
}

/**
 * Parse inline rich markup tags (`[b]`, `[red]`, `**bold**`, `*italic*`, `__underline__`, `~~strike~~`,
 * bullet/numbered lists) into clean plain text `cleanText`, Zalo `{ start, len, st }` `styles`,
 * and LINE OA Flex `lineFlexSpans`.
 */
export function parseAndCompileRichText(
  renderedWithTags: string,
  explicitStyles?: RichTextStyleSpan[],
): CompiledRichTextResult {
  const source = normalizeMarkdownToTags(renderedWithTags ?? '');
  const tagRegex =
    /\[(\/?)(b|bold|i|italic|u|underline|s|strike|red|orange|yellow|green|big|large|small)\]/gi;

  let cleanText = '';
  let lastIndex = 0;
  const openStack: Array<{ canonicalTag: string; st: string; startOffset: number }> = [];
  const parsedStyles: RichTextStyleSpan[] = [];

  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(source)) !== null) {
    const fullMatch = match[0];
    const isClosing = match[1] === '/';
    const rawTag = match[2].toLowerCase();
    const canonicalTag = CANONICAL_TAG_MAP[rawTag];
    const st = TAG_TO_ZALO_STYLE[rawTag];

    if (!canonicalTag || !st) {
      continue;
    }

    // Append text before this tag
    if (match.index > lastIndex) {
      cleanText += source.slice(lastIndex, match.index);
    }

    if (!isClosing) {
      // Check if a matching closing tag exists later in `source`
      const closePattern = new RegExp(`\\[\\/(?:${rawTag}|${canonicalTag})\\]`, 'i');
      const hasClosingLater = closePattern.test(source.slice(tagRegex.lastIndex));
      if (hasClosingLater) {
        openStack.push({
          canonicalTag,
          st,
          startOffset: cleanText.length,
        });
      } else {
        // Keep literal text if there is no matching closing tag
        cleanText += fullMatch;
      }
    } else {
      // Find most recent matching open tag on stack
      let foundIdx = -1;
      for (let i = openStack.length - 1; i >= 0; i--) {
        if (openStack[i].canonicalTag === canonicalTag) {
          foundIdx = i;
          break;
        }
      }

      if (foundIdx !== -1) {
        const [opened] = openStack.splice(foundIdx, 1);
        const len = cleanText.length - opened.startOffset;
        if (len > 0) {
          parsedStyles.push({
            start: opened.startOffset,
            len,
            st: opened.st,
          });
        }
      } else {
        // Unmatched closing tag: keep literal
        cleanText += fullMatch;
      }
    }

    lastIndex = tagRegex.lastIndex;
  }

  if (lastIndex < source.length) {
    cleanText += source.slice(lastIndex);
  }

  // Detect bullet (`• ` or `- `) and numbered (`1. `, `2. `) list lines on cleanText
  const lines = cleanText.split('\n');
  let lineOffset = 0;
  for (const line of lines) {
    if (line.length > 0) {
      if (/^\s*(?:•|-)\s+/.test(line)) {
        parsedStyles.push({
          start: lineOffset,
          len: line.length,
          st: 'lst_1',
        });
      } else if (/^\s*\d+\.\s+/.test(line)) {
        parsedStyles.push({
          start: lineOffset,
          len: line.length,
          st: 'lst_2',
        });
      }
    }
    lineOffset += line.length + 1; // +1 for '\n'
  }

  // Merge with explicitStyles and deduplicate
  const combinedStyles: RichTextStyleSpan[] = [...parsedStyles];
  if (Array.isArray(explicitStyles)) {
    for (const exp of explicitStyles) {
      if (
        exp &&
        typeof exp.start === 'number' &&
        typeof exp.len === 'number' &&
        typeof exp.st === 'string' &&
        exp.start >= 0 &&
        exp.len > 0 &&
        exp.start < cleanText.length
      ) {
        const clampedLen = Math.min(exp.len, cleanText.length - exp.start);
        if (clampedLen > 0) {
          combinedStyles.push({
            start: exp.start,
            len: clampedLen,
            st: exp.st,
          });
        }
      }
    }
  }

  const seen = new Set<string>();
  const uniqueStyles: RichTextStyleSpan[] = [];
  for (const s of combinedStyles) {
    const key = `${s.start}:${s.len}:${s.st}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueStyles.push(s);
    }
  }

  uniqueStyles.sort((a, b) => (a.start !== b.start ? a.start - b.start : b.len - a.len));

  const lineFlexSpans = buildLineFlexSpansFromStyles(cleanText, uniqueStyles);

  return {
    cleanText,
    styles: uniqueStyles,
    lineFlexSpans,
  };
}

function ensureFilenameWithExtension(filename: string, fallbackPath?: string): `${string}.${string}` {
  const trimmed = (filename || '').trim();
  if (trimmed.includes('.') && !trimmed.startsWith('.') && !trimmed.endsWith('.')) {
    return trimmed as `${string}.${string}`;
  }
  const extFromPath = fallbackPath ? path.extname(fallbackPath) : '';
  const ext = extFromPath && extFromPath.startsWith('.') ? extFromPath : '.bin';
  const base = trimmed.replace(/\.+$/, '') || 'attachment';
  return `${base}${ext}` as `${string}.${string}`;
}

function resolveDiskAttachmentPath(att: RichAttachmentItem): string | null {
  if (att.filePath && fs.existsSync(att.filePath)) {
    return att.filePath;
  }
  if (att.url) {
    const cleanRel = att.url.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '');
    if (cleanRel.startsWith('uploads/')) {
      const candidate = path.resolve(process.cwd(), cleanRel);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * Build Zalo (`zca-js`) `sendMessage` and `sendLink` payloads from cleanText + rich metadata.
 * Returns a plain `string` for `messagePayload` when no styles, urgency, or attachments are present,
 * or a `MessageContent` object `{ msg, styles, urgency, attachments }` when rich features are used.
 */
export function buildZaloSendPayload(
  cleanText: string,
  metadata?: RichMessageMetadata | null,
): ZaloSendPayloadResult {
  const compiled = parseAndCompileRichText(cleanText, metadata?.styles);
  const finalText = compiled.cleanText;
  const styles = compiled.styles;
  const urgency = metadata?.urgency;

  const resolvedAttachments: ZaloAttachmentSourceObject[] = [];
  if (Array.isArray(metadata?.attachments)) {
    for (const att of metadata!.attachments) {
      const diskPath = resolveDiskAttachmentPath(att);
      if (diskPath) {
        try {
          const data = fs.readFileSync(diskPath);
          const filename = ensureFilenameWithExtension(att.filename, diskPath);
          resolvedAttachments.push({
            data,
            filename,
            metadata: {
              totalSize: att.size || data.length,
              ...(att.width ? { width: att.width } : {}),
              ...(att.height ? { height: att.height } : {}),
            },
          });
        } catch {
          // Ignore unreadable file on disk
        }
      }
    }
  }

  const linksToSend: Array<{ link: string; msg?: string }> = [];
  if (Array.isArray(metadata?.links)) {
    for (const linkItem of metadata!.links) {
      const url = linkItem?.url?.trim();
      if (!url) continue;
      const msgParts = [linkItem.title?.trim(), linkItem.description?.trim()].filter(Boolean);
      linksToSend.push({
        link: url,
        ...(msgParts.length > 0 ? { msg: msgParts.join(' — ') } : {}),
      });
    }
  }

  const hasStyles = styles.length > 0;
  const hasUrgency = urgency === 1 || urgency === 2;
  const hasAttachments = resolvedAttachments.length > 0;

  if (!hasStyles && !hasUrgency && !hasAttachments) {
    return {
      messagePayload: finalText,
      linksToSend,
    };
  }

  const contentPayload: ZaloMessageContentPayload = {
    msg: finalText,
  };
  if (hasStyles) {
    contentPayload.styles = styles;
  }
  if (hasUrgency) {
    contentPayload.urgency = urgency;
  }
  if (hasAttachments) {
    contentPayload.attachments = resolvedAttachments;
  }

  return {
    messagePayload: contentPayload,
    linksToSend,
  };
}

/**
 * Build LINE Official Account (`@line/bot-sdk`) `messages` array (up to 5 bubbles in 1 API call).
 * Returns a Flex Message bubble when `styles`, `urgency`, `attachments`, or `links` are present,
 * or a standard `[{ type: 'text', text: cleanText }]` when plain.
 */
export function buildLineMessagesPayload(
  cleanText: string,
  metadata?: RichMessageMetadata | null,
): any[] {
  if (Array.isArray(metadata?.flexMessages) && metadata!.flexMessages.length > 0) {
    return metadata!.flexMessages.slice(0, 5);
  }

  const compiled = parseAndCompileRichText(cleanText, metadata?.styles);
  const finalText = compiled.cleanText;
  const styles = compiled.styles;
  const lineFlexSpans = compiled.lineFlexSpans;

  const urgency = metadata?.urgency;
  const attachments: RichAttachmentItem[] = Array.isArray(metadata?.attachments)
    ? metadata!.attachments
    : [];
  const links: RichLinkItem[] = Array.isArray(metadata?.links)
    ? metadata!.links.filter((l) => Boolean(l?.url?.trim()))
    : [];

  const hasStyles = styles.length > 0;
  const hasUrgency = urgency === 1 || urgency === 2;
  const hasAttachments = attachments.length > 0;
  const hasLinks = links.length > 0;

  if (!hasStyles && !hasUrgency && !hasAttachments && !hasLinks) {
    return [
      {
        type: 'text',
        text: finalText,
      },
    ];
  }

  const bodyContents: any[] = [];

  // 1. Urgency badge pill at top of Flex body
  if (urgency === 2) {
    bodyContents.push({
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'text',
          text: '!! KHẨN CẤP',
          color: '#ffffff',
          weight: 'bold',
          size: 'xs',
        },
      ],
      backgroundColor: '#db342e',
      cornerRadius: 'md',
      paddingAll: '4px',
      paddingStart: '8px',
      paddingEnd: '8px',
    });
  } else if (urgency === 1) {
    bodyContents.push({
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'text',
          text: '! QUAN TRỌNG',
          color: '#ffffff',
          weight: 'bold',
          size: 'xs',
        },
      ],
      backgroundColor: '#f27806',
      cornerRadius: 'md',
      paddingAll: '4px',
      paddingStart: '8px',
      paddingEnd: '8px',
    });
  }

  // 2. Main text with styled Flex spans
  if (finalText) {
    bodyContents.push({
      type: 'text',
      wrap: true,
      size: 'md',
      color: '#1e293b',
      ...(hasUrgency ? { margin: 'md' } : {}),
      ...(lineFlexSpans.length > 0
        ? { contents: lineFlexSpans }
        : { text: finalText }),
    });
  }

  // 3. Attachments (hero image for first public image + file cards for non-image/other files)
  let heroImage: any = undefined;
  const extraImageMessages: any[] = [];

  for (const att of attachments) {
    const isImage = Boolean(att.mimeType?.toLowerCase().startsWith('image/'));
    const isPublicHttp = /^https?:\/\//i.test(att.url || '');

    if (isImage && isPublicHttp && !heroImage) {
      heroImage = {
        type: 'image',
        url: att.url,
        size: 'full',
        aspectRatio:
          att.width && att.height ? `${att.width}:${att.height}` : '20:13',
        aspectMode: 'cover',
      };
    } else if (isImage && isPublicHttp && extraImageMessages.length < 4) {
      extraImageMessages.push({
        type: 'image',
        originalContentUrl: att.url,
        previewImageUrl: att.url,
      });
    } else {
      bodyContents.push({
        type: 'box',
        layout: 'vertical',
        margin: 'md',
        paddingAll: '8px',
        backgroundColor: '#f1f5f9',
        cornerRadius: 'md',
        contents: [
          {
            type: 'text',
            text: `📎 ${att.filename || 'Tệp đính kèm'}`,
            size: 'sm',
            weight: 'bold',
            color: '#0f172a',
            wrap: true,
          },
        ],
      });
    }
  }

  // 4. Link cards description in body + CTA buttons in footer
  for (const link of links) {
    if (link.title || link.description) {
      bodyContents.push({
        type: 'box',
        layout: 'vertical',
        margin: 'md',
        paddingAll: '8px',
        backgroundColor: '#f8fafc',
        cornerRadius: 'md',
        contents: [
          ...(link.title
            ? [
                {
                  type: 'text',
                  text: link.title,
                  weight: 'bold',
                  size: 'sm',
                  color: '#0f172a',
                  wrap: true,
                },
              ]
            : []),
          ...(link.description
            ? [
                {
                  type: 'text',
                  text: link.description,
                  size: 'xs',
                  color: '#64748b',
                  wrap: true,
                  margin: 'xs',
                },
              ]
            : []),
        ],
      });
    }
  }

  const footerButtons: any[] = links.map((link, idx) => ({
    type: 'button',
    style: idx === 0 ? 'primary' : 'secondary',
    ...(idx === 0 ? { color: '#06c755' } : {}),
    height: 'sm',
    action: {
      type: 'uri',
      label: (link.buttonLabel || link.title || 'Mở liên kết').slice(0, 40),
      uri: link.url.trim(),
    },
  }));

  for (const att of attachments) {
    const isImage = Boolean(att.mimeType?.toLowerCase().startsWith('image/'));
    const isPublicHttp = /^https?:\/\//i.test(att.url || '');
    if (!isImage && isPublicHttp && footerButtons.length < 4) {
      footerButtons.push({
        type: 'button',
        style: 'secondary',
        height: 'sm',
        action: {
          type: 'uri',
          label: `Tải ${att.filename || 'tệp'}`.slice(0, 40),
          uri: att.url,
        },
      });
    }
  }

  if (bodyContents.length === 0) {
    bodyContents.push({
      type: 'text',
      text: finalText || 'Tin nhắn từ Edura',
      wrap: true,
    });
  }

  const flexBubble: Record<string, any> = {
    type: 'bubble',
    ...(heroImage ? { hero: heroImage } : {}),
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: bodyContents,
    },
    ...(footerButtons.length > 0
      ? {
          footer: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: footerButtons,
          },
        }
      : {}),
  };

  const altTextBase =
    finalText ||
    links[0]?.title ||
    attachments[0]?.filename ||
    'Tin nhắn từ Edura';

  return [
    {
      type: 'flex',
      altText: altTextBase.slice(0, 400),
      contents: flexBubble,
    },
    ...extraImageMessages,
  ].slice(0, 5);
}
