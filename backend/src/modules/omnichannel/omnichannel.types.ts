export interface GroupAccount {
  id: number;
  platform: 'ZALO' | 'LINE';
  name: string;
  status: string;
}
export interface GroupClassLink {
  programType: 'KAIWA' | 'JLPT';
  studentId: number;
  studentName: string;
  studentExternalId: string | null;
  classId: number;
  className: string;
  classCode: string | null;
}
export interface OmnichannelGroup {
  programType: 'KAIWA' | 'JLPT' | null;
  levelNote: string | null;
  needsProgramReview: boolean;
  key: string;
  id: number;
  platform: 'ZALO' | 'LINE';
  account: GroupAccount;
  externalGroupId: string;
  name: string;
  avatarUrl: string | null;
  memberCount: number | null;
  lastSyncedAt: string | null;
  classLinks: GroupClassLink[];
}
