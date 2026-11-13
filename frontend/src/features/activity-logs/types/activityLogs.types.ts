export type AuditModuleKey =
  | 'ALL'
  | 'ENROLLMENT'
  | 'ATTENDANCE'
  | 'CARE'
  | 'MESSAGING'
  | 'IMPORT_SYNC'
  | 'SYSTEM';

export type ActivityLogTabKey = 'audit' | 'sync' | 'backup' | 'login';
export type ActivityExportView = ActivityLogTabKey;

export type LoginAuditStatus =
  | 'ALL'
  | 'SUCCESS'
  | 'FAILED'
  | 'LOCKED'
  | 'DISABLED';

export interface AuditChangedField {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
}

export interface AuditLogActor {
  id: number | null;
  name: string | null;
  code: string | null;
  staff_code?: string | null;
  email: string | null;
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
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
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
  pageSize: number;
  totalPages: number;
  refreshedAt: string;
}

export interface LoginAuditItem {
  id: number;
  createdAt: string;
  emailAttempted: string;
  status: 'SUCCESS' | 'FAILED' | 'LOCKED' | 'DISABLED';
  statusLabel?: string;
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
  pageSize: number;
  totalPages: number;
  refreshedAt: string;
}

export interface AuditLogQueryParams {
  module?: AuditModuleKey;
  action?: string;
  actorId?: number | string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}

export interface LoginAuditQueryParams {
  status?: LoginAuditStatus;
  actorId?: number | string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}

export interface ActivityExportQueryParams {
  view: ActivityExportView;
  module?: AuditModuleKey;
  status?: string;
  actorId?: number | string;
  search?: string;
  programType?: string;
  fromDate?: string;
  toDate?: string;
}

export interface ActivityActorsResponse {
  success: boolean;
  items: AuditLogActor[];
}
