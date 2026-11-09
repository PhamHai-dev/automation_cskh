export type ActivityModuleType =
  | 'ALL'
  | 'ENROLLMENT'
  | 'ATTENDANCE'
  | 'CARE'
  | 'MESSAGING'
  | 'IMPORT_SYNC'
  | 'SYSTEM';

export type ActivityModuleCode = Exclude<ActivityModuleType, 'ALL'>;

export interface AuditActorDto {
  id: number | null;
  name: string | null;
  code: string | null;
  staff_code?: string | null;
  email: string | null;
  roles: string[];
  displayLabel: string;
}

export interface ChangedFieldDto {
  field: string;
  label: string;
  before: any;
  after: any;
}

export interface EnrichedAuditLogItemDto {
  id: number;
  createdAt: string;
  actor: AuditActorDto;
  module: ActivityModuleCode;
  moduleLabel: string;
  action: string;
  actionLabel: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  summary: string;
  changedFields: ChangedFieldDto[];
  beforeData: any;
  afterData: any;
  ipAddress: string | null;
}

export interface AuditLogStatsDto {
  todayTotal: number;
  todayByModule: Record<ActivityModuleCode, number>;
  lastActivityAt: string | null;
}

export type ModuleCountsDto = Record<ActivityModuleType, number>;

export interface AuditLogListResponseDto {
  success: boolean;
  stats: AuditLogStatsDto;
  moduleCounts: ModuleCountsDto;
  items: EnrichedAuditLogItemDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuditLogQueryParams {
  module?: ActivityModuleType;
  action?: string;
  actorId?: number;
  search?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

export type LoginAuditFilterStatus = 'ALL' | 'SUCCESS' | 'FAILED' | 'LOCKED' | 'DISABLED';

export interface LoginAuditQueryParams {
  status?: LoginAuditFilterStatus;
  actorId?: number;
  search?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

export interface LoginAuditStatsDto {
  todayTotal: number;
  todaySuccess: number;
  todayFailed: number;
  lastLoginAt: string | null;
}

export interface EnrichedLoginAuditItemDto {
  id: number;
  createdAt: string;
  emailAttempted: string;
  status: 'SUCCESS' | 'FAILED' | 'LOCKED' | 'DISABLED';
  statusLabel: string;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  actor: AuditActorDto | null;
  user: AuditActorDto | null;
}

export interface LoginAuditListResponseDto {
  success: boolean;
  stats: LoginAuditStatsDto;
  items: EnrichedLoginAuditItemDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface EnrichmentContext {
  usersMap: Map<number, AuditActorDto>;
  studentsMap: Map<number, { id: number; full_name: string; external_id: string | null }>;
  enrollmentsMap: Map<
    number,
    {
      id: number;
      student_id: number;
      cs_id: number;
      program_type: string;
      student?: { id: number; full_name: string; external_id: string | null } | null;
    }
  >;
  classesMap: Map<number, { id: number; class_code: string | null; class_name: string }>;
}
