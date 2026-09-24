// dig-zalo-mysql.ts — temporary diagnostic: inspect zalo_accounts
// Author: Kimi. One-off scratch. NOT part of app.
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const url = process.env.DATABASE_URL ?? 'mysql://root:root@localhost:3306/automation_cskh';

const rows: any[] = await p.$queryRawUnsafe(
  `SELECT id, cs_id, display_name, status,
          zalo_uid IS NOT NULL AS has_uid,
          encrypted_session_data IS NOT NULL AS has_session,
          archived_at IS NOT NULL AS archived,
          disconnect_reason,
          last_sync_at, last_sync_error
   FROM zalo_accounts
   ORDER BY id`,
);
console.table(rows.map((r: any) => ({
  id: r.id, cs_id: r.cs_id, name: r.display_name, status: r.status,
  uid: r.has_uid ? 1 : 0, session: r.has_session ? 1 : 0,
  archived: r.archived ? 1 : 0, dc: r.disconnect_reason,
  sync_at: r.last_sync_at, sync_err: r.last_sync_error,
})));
await p.$disconnect();
