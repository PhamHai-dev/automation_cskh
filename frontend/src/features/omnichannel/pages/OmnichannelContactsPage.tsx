import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ZaloContactsPage } from '../../zalo/pages/ZaloContactsPage';
import { LineContactsPage } from '../../line/pages/LineContactsPage';
import { ShieldCheck, Smartphone, Bot, Users } from 'lucide-react';

type ContactsChannelTab = 'ZALO' | 'LINE';

export const OmnichannelContactsPage: React.FC<{ initialChannel?: ContactsChannelTab }> = ({
  initialChannel,
}) => {
  const [searchParams] = useSearchParams();
  const resolvedInitial = useMemo<ContactsChannelTab>(() => {
    if (initialChannel) return initialChannel;
    const ch = (searchParams.get('channel') || '').toUpperCase();
    return ch === 'LINE' ? 'LINE' : 'ZALO';
  }, [initialChannel, searchParams]);

  const [channel, setChannel] = useState<ContactsChannelTab>(resolvedInitial);

  return (
    <div className="space-y-3">
      {/* Top Omnichannel Switcher + Anti-Ban Guardrail Banner */}
      <div className="mx-4 mt-4 p-3 rounded-2xl bg-surface border border-border shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-emerald-500 text-white flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-text-primary">
                Danh bạ Đa kênh (Zalo & LINE)
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                <ShieldCheck className="w-3 h-3" />
                Anti-Ban Rate Limiter: Zalo SĐT 60/ngày (4/5p) · LINE SĐT 20/ngày (2/10p)
              </span>
            </div>
            <p className="text-xs text-text-muted">
              Quản lý Bạn bè Zalo, Bạn bè LINE Cá nhân (E2EE) và Người theo dõi LINE Official Account
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-surface-muted p-1 rounded-xl border border-border">
          <button
            onClick={() => setChannel('ZALO')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              channel === 'ZALO'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            Danh bạ Zalo (Bạn bè / Alias / Tìm SĐT)
          </button>
          <button
            onClick={() => setChannel('LINE')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              channel === 'LINE'
                ? 'bg-[#06C755] text-white shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            Danh bạ LINE (OA Followers & Bạn bè E2EE)
          </button>
        </div>
      </div>

      {channel === 'ZALO' ? <ZaloContactsPage /> : <LineContactsPage />}
    </div>
  );
};
