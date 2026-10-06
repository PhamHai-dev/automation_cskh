export interface ZaloProfileSnapshot {
  displayName: string | null;
  avatarUrl: string | null;
  phone: string | null;
}

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' ? value as Record<string, any> : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** Normalize the profile response shapes returned by zca-js getUserInfo/profile APIs. */
export function extractZaloProfile(raw: unknown, uid?: string): ZaloProfileSnapshot | null {
  const root = asRecord(raw);
  if (!root) return null;

  const candidates: Record<string, any>[] = [];
  const add = (value: unknown) => {
    const record = asRecord(value);
    if (record && !candidates.includes(record)) candidates.push(record);
  };

  add(root);
  add(root.data);
  if (uid) {
    add(root[uid]);
    add(asRecord(root.data)?.[uid]);
    const changed = asRecord(root.changed_profiles);
    add(changed?.[uid]);
    add(changed?.[`${uid}_0`]);
    if (changed) {
      for (const value of Object.values(changed)) {
        const profile = asRecord(value);
        if (profile && String(profile.userId ?? profile.uid ?? '') === uid) add(profile);
      }
    }
  }

  const profile = candidates.find((candidate) =>
    ['avatar', 'avatarUrl', 'avt', 'thumbAvatarUrl', 'fullAvt', 'displayName', 'zaloName', 'zalo_name', 'phoneNumber']
      .some((key) => candidate[key] !== undefined),
  );
  if (!profile) return null;

  return {
    displayName: firstString(profile.displayName, profile.zaloName, profile.zalo_name, profile.name),
    avatarUrl: firstString(profile.avatar, profile.avatarUrl, profile.avt, profile.thumbAvatarUrl, profile.fullAvt),
    phone: firstString(profile.phoneNumber, profile.phone),
  };
}

export function mergeZaloProfile(
  current: ZaloProfileSnapshot,
  incoming: ZaloProfileSnapshot | null,
): ZaloProfileSnapshot {
  return {
    displayName: incoming?.displayName ?? current.displayName,
    avatarUrl: incoming?.avatarUrl ?? current.avatarUrl,
    phone: incoming?.phone ?? current.phone,
  };
}
