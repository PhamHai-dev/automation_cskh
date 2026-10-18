/**
 * Shared types for the Hybrid LINE module (Official Account + Personal Thrift/E2EE).
 */

import type { LineAccountStatus, LineAccountType, ZaloContactRelationStatus } from '@prisma/client';

// ─── Encrypted Session Credential Structures (AES-256-GCM) ──────────────────

export interface LineOaSessionData {
  mode: 'OA';
  channelId: string;
  channelSecret: string;
  channelAccessToken: string;
  basicId?: string;
}

export interface LinePersonalSessionData {
  mode: 'PERSONAL';
  authToken: string;
  refreshToken?: string;
  qrCert?: string;
  e2eeKeychain?: Record<string, any>;
  device?: string;
}

export type LineSessionData = LineOaSessionData | LinePersonalSessionData;

// ─── Socket.IO Event Payloads ───────────────────────────────────────────────

export interface LineStatusSocketPayload {
  accountId: number;
  accountType: LineAccountType;
  status: LineAccountStatus;
  displayName?: string | null;
  lineMid?: string | null;
  basicId?: string | null;
  avatarUrl?: string | null;
  monthlyQuota?: number | null;
  monthlyConsumption?: number | null;
  disconnectReason?: string | null;
  timestamp: string;
}

export interface LineQrSocketPayload {
  accountId: number;
  qrUrl: string;
  qrCodeDataUri?: string;
  status: LineAccountStatus;
  timestamp: string;
}

export interface LinePinSocketPayload {
  accountId: number;
  pinCode: string;
  status: LineAccountStatus;
  timestamp: string;
}

export interface LineMessageSocketPayload {
  accountId: number;
  conversationId: number;
  externalThreadId: string;
  threadType: 'user' | 'group';
  message: {
    id: number;
    lineMsgId: string;
    quoteToken?: string | null;
    senderUid: string;
    senderName?: string | null;
    senderType: 'self' | 'other';
    content: string;
    contentType: string;
    isSelf: boolean;
    sentVia: string;
    timestamp: string;
  };
}

export interface LineFriendUpdateSocketPayload {
  accountId: number;
  friendUid: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  friendshipStatus: 'friend' | 'follower' | 'blocked' | 'none';
  timestamp: string;
}

export interface LineGroupUpdateSocketPayload {
  accountId: number;
  lineGroupId: string;
  name?: string | null;
  memberCount?: number | null;
  avatarUrl?: string | null;
  action: 'joined' | 'left' | 'member_joined' | 'member_left' | 'synced' | 'linked';
  timestamp: string;
}

// ─── Adapter / Service Helper Types ─────────────────────────────────────────

export interface LineBotProfileInfo {
  userId: string;
  basicId?: string;
  displayName: string;
  pictureUrl?: string;
  monthlyQuota: number | null;
  monthlyConsumption: number;
}

export interface CreateLineOaAccountInput {
  account_type: 'OA';
  csId: number;
  channelId: string;
  channelSecret: string;
  channelAccessToken: string;
  basicId?: string;
  displayName?: string;
}

export interface CreateLinePersonalAccountInput {
  account_type: 'PERSONAL';
  csId: number;
  displayName?: string;
  linePhone?: string;
  proxyUrl?: string;
}

export type CreateLineAccountInput = CreateLineOaAccountInput | CreateLinePersonalAccountInput;

export interface LineContactLinkInfo {
  id: number;
  studentId: number;
  lineAccountId: number;
  relationStatus: ZaloContactRelationStatus;
  displayName?: string | null;
  avatarUrl?: string | null;
  friendLineUid?: string | null;
  linkCode?: string | null;
}
