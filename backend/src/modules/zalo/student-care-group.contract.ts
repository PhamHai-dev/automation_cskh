/**
 * Shared contract for the Automatic Student Care Group Sync & Matching Engine.
 *
 * Naming convention for Student Care Groups on Zalo & LINE:
 *   "<CS_NUMBER> - <STUDENT_EXTERNAL_ID> ...text..."
 * Example:
 *   "01 - 427901798 Trần Văn An - N5"
 *   where:
 *     - "01" -> maps to CS user code "CVHT01"
 *     - "427901798" -> maps to Student.external_id "427901798"
 */

export interface ParsedCareGroupName {
  rawName: string;
  csNumberPadded: string; // e.g., "01"
  csCode: string; // e.g., "CVHT01"
  studentExternalId: string; // e.g., "427901798"
  remainderText: string;
}

export interface LinkedStudentCareGroupItem {
  studentId: number;
  studentExternalId: string;
  studentName: string;
  csId: number;
  csName: string | null;
  csCode: string | null;
  zaloLinked: boolean;
  zaloGroupName?: string | null;
  zaloGroupId?: string | null;
  zaloAccountId?: number | null;
  lineLinked: boolean;
  lineGroupName?: string | null;
  lineGroupId?: string | null;
  lineAccountId?: number | null;
  newlyLinked: boolean;
}

export interface UnlinkedStudentCareGroupItem {
  studentId: number;
  studentExternalId: string | null;
  studentName: string;
  csId: number | null;
  csName: string | null;
  csCode: string | null;
  expectedGroupPrefix: string; // e.g. "01 - 427901798"
  suggestedGroupName: string; // e.g. "01 - 427901798 - Nguyễn Văn An"
  reason: string;
}

export interface CareGroupSyncReport {
  triggeredBy: 'login' | 'import' | 'cron' | 'manual' | 'group_event';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  refreshedZaloAccounts: number;
  refreshedLineAccounts: number;
  totalZaloGroupsScanned: number;
  totalLineGroupsScanned: number;
  totalEligibleStudents: number;
  linkedStudentsCount: number;
  unlinkedStudentsCount: number;
  newlyLinkedZaloCount: number;
  newlyLinkedLineCount: number;
  linkedItems: LinkedStudentCareGroupItem[];
  unlinkedItems: UnlinkedStudentCareGroupItem[];
}

export interface SyncCareGroupsOptions {
  triggeredBy?: 'login' | 'import' | 'cron' | 'manual' | 'group_event';
  refreshLiveGroups?: boolean;
  studentIds?: number[];
  csId?: number;
  zaloAccountId?: number;
  lineAccountId?: number;
}

export type CareGroupAutoSyncRunner = (
  options?: SyncCareGroupsOptions,
) => Promise<CareGroupSyncReport>;

let _registeredRunner: CareGroupAutoSyncRunner | null = null;

export function registerCareGroupAutoSyncRunner(runner: CareGroupAutoSyncRunner): void {
  _registeredRunner = runner;
}

export async function runStudentCareGroupAutoSync(
  options?: SyncCareGroupsOptions,
): Promise<CareGroupSyncReport | null> {
  if (!_registeredRunner) return null;
  return _registeredRunner(options);
}
