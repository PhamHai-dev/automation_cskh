export type AuditModuleKey =
  | 'ALL'
  | 'ENROLLMENT'
  | 'ATTENDANCE'
  | 'CARE'
  | 'MESSAGING'
  | 'IMPORT_SYNC'
  | 'SYSTEM';

export type ActivityLogTabKey = 'audit' | 'sync' | 'backup' | 'login';

export type LoginAuditStatus =
  | 'ALL'
  | 'SUCCESS'
  | 'FAILED'
  | 'LOCKED'
  | 'DISABLED';

export interface AuditChangedField {
  field: string;
  label: string;
  before: any;
  after: any;
}

export interface AuditLogActor {
  id: number;
  name: string | null;
  code: string | null;
  email: string;
  roles: string[];
  displayLabel: string;
}

export interface AuditLogItem {
  id: number;
  createdAt: string;
  actor: AuditLogActor | null;
  module: Exclude<AuditModuleKey, 'ALL'>;
  moduleLabel: string;
  action: string;
  actionLabel: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  summary: string;
  changedFields: AuditChangedField[];
  beforeData?: Record<string, any> | null;
  afterData?: Record<string, any> | null;
  ipAddress?: string | null;
}

export interface AuditLogListResponse {
  success: boolean;
  stats: {
    todayTotal: number;
    todayByModule: Record<string, number>;
    lastActivityAt: string | null;
  };
  moduleCounts: Record<string, number>;
  items: AuditLogItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface LoginAuditItem {
  id: number;
  createdAt: string;
  emailAttempted: string;
  status: 'SUCCESS' | 'FAILED' | 'LOCKED' | 'DISABLED';
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  actor: AuditLogActor | null;
  user?: AuditLogActor | null;
}

export interface LoginAuditListResponse {
  success: boolean;
  stats: {
    todayTotal: number;
    todaySuccess: number;
    todayFailed: number;
    lastLoginAt: string | null;
  };
  items: LoginAuditItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuditLogQueryParams {
  module?: AuditModuleKey;
  actorId?: number | string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

export interface LoginAuditQueryParams {
  status?: LoginAuditStatus;
  actorId?: number | string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

export interface ActivityActorsResponse {
  success: boolean;
  items: AuditLogActor[];
}
