import { extractZaloProfile } from '../../src/modules/zalo/zalo-profile-utils';

describe('Zalo profile extraction', () => {
  it('extracts direct profile fields', () => {
    expect(extractZaloProfile({ displayName: 'Nick', avatar: 'https://avatar/direct.jpg' }, '1')).toEqual({
      displayName: 'Nick', avatarUrl: 'https://avatar/direct.jpg', phone: null,
    });
  });

  it('extracts changed_profiles by uid', () => {
    expect(extractZaloProfile({ changed_profiles: { '123': { zaloName: 'Nick', avatar: 'https://avatar/changed.jpg' } } }, '123')).toEqual({
      displayName: 'Nick', avatarUrl: 'https://avatar/changed.jpg', phone: null,
    });
  });

  it('extracts changed_profiles with suffixed uid', () => {
    expect(extractZaloProfile({ changed_profiles: { '123_0': { displayName: 'Nick', fullAvt: 'https://avatar/suffixed.jpg' } } }, '123')).toEqual({
      displayName: 'Nick', avatarUrl: 'https://avatar/suffixed.jpg', phone: null,
    });
  });

  it('returns null when response has no profile fields', () => {
    expect(extractZaloProfile({ changed_profiles: {} }, '123')).toBeNull();
  });
});
