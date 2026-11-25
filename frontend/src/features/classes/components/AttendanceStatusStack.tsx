import React from 'react';
import { AttendanceStatus, ClassSession } from '../types/classes.types';
import { AttendanceStatusDropdown } from './AttendanceStatusDropdown';

interface AttendanceStatusStackProps {
  id: string;
  studentName: string;
  sessions: ClassSession[];
  readStatus: (session: ClassSession) => AttendanceStatus | null | undefined;
  disabled?: boolean;
  onSelect: (session: ClassSession | undefined, caNumber: number, status: AttendanceStatus) => void | Promise<void>;
  onDelete: (session: ClassSession) => void | Promise<void>;
  renderMeta?: (session: ClassSession) => React.ReactNode;
}

/** Only marked sessions are rows; an unmarked shared session is reused by the + selector. */
export const AttendanceStatusStack: React.FC<AttendanceStatusStackProps> = ({
  id, studentName, sessions, readStatus, disabled, onSelect, onDelete, renderMeta,
}) => {
  const markedSessions = sessions.filter((session) => Boolean(readStatus(session)));
  const availableIndex = sessions.findIndex((session) => !readStatus(session));
  const nextIndex = availableIndex < 0 ? sessions.length : availableIndex;
  const renderAddSelector = () => (
    <AttendanceStatusDropdown
      id={`${id}-add`}
      emptyLabel={markedSessions.length ? '+' : '-'}
      disabled={disabled}
      ariaLabel={`Thêm và điểm danh Ca ${nextIndex + 1} cho ${studentName}`}
      title="Chọn trạng thái để lưu điểm danh ca tiếp theo"
      onChange={(status) => status ? onSelect(sessions[nextIndex], nextIndex + 1, status) : undefined}
    />
  );
  return (
    <div className="flex flex-col items-start gap-1.5">
      {markedSessions.map((session, index) => {
        const caNumber = sessions.indexOf(session) + 1;
        return (
          <div key={session.id} className="flex flex-col items-start gap-1">
            <div className="flex items-center gap-1">
              {sessions.length > 1 && <span className="text-[10px] font-bold text-text-muted">Ca {caNumber}</span>}
              <AttendanceStatusDropdown
                id={`${id}-session-${session.id}`}
                value={readStatus(session)}
                disabled={disabled}
                ariaLabel={`Trạng thái điểm danh Ca ${caNumber} của ${studentName}`}
                onChange={(status) => status ? onSelect(session, caNumber, status) : onDelete(session)}
              />
              {index === markedSessions.length - 1 && renderAddSelector()}
            </div>
            {renderMeta?.(session)}
          </div>
        );
      })}
      {markedSessions.length === 0 && renderAddSelector()}
    </div>
  );
};
