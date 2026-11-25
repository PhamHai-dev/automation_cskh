const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
};
const { toInboxConversation, toInboxMessage, inboxError } = require('../src/features/omnichannel/utils/inbox.ts');
const account = { key: 'LINE:13', platform: 'LINE', id: 13, name: 'LINE CSKH', type: 'PERSONAL', status: 'ACTIVE' };

test('LINE camelCase and snake_case conversations map to the same inbox data', () => {
  const camel = { externalThreadId: 'thread', threadType: 'group', groupName: 'Study group', groupAvatarUrl: '/avatar', unreadCount: 0, isReplied: false,
    lastMessageAt: '2026-11-20T00:00:00Z', replyTokenExpiresAt: '2026-11-20T00:01:00Z', lastMessage: { content: 'Hello', isSelf: true } };
  const snake = { external_thread_id: 'thread', thread_type: 'group', group_name: 'Study group', group_avatar_url: '/avatar', unread_count: 0, is_replied: false,
    last_message_at: camel.lastMessageAt, reply_token_expires_at: camel.replyTokenExpiresAt, messages: [{ content: 'Hello', is_self: true }] };
  assert.deepEqual(toInboxConversation(account, camel), toInboxConversation(account, snake));
  assert.equal(toInboxConversation(account, camel).preview, 'Bạn: Hello');
});

test('conversations with identical provider IDs remain distinct across platforms and accounts', () => {
  const raw = { externalThreadId: 'thread', displayName: 'Learner' };
  const line = toInboxConversation(account, raw);
  const zalo = toInboxConversation({ ...account, key: 'ZALO:13', platform: 'ZALO' }, raw);
  const other = toInboxConversation({ ...account, key: 'LINE:14', id: 14 }, raw);
  assert.equal(new Set([line.key, zalo.key, other.key]).size, 3);
  assert.equal(line.account.id, 13);
  assert.equal(other.account.id, 14);
});

test('inbound false values are preserved and LINE message naming versions render identically', () => {
  const camel = { id: 1, lineMsgId: 'message', senderName: 'Learner', senderUid: 'uid', isSelf: false, content: 'Hi', contentType: 'text', timestamp: '2026-11-20T00:00:00Z', sentVia: 'reply_token' };
  const snake = { id: 1, line_msg_id: 'message', sender_name: 'Learner', sender_uid: 'uid', is_self: false, content: 'Hi', content_type: 'text', timestamp: camel.timestamp, sent_via: 'reply_token' };
  assert.deepEqual(toInboxMessage(camel), toInboxMessage(snake));
  assert.equal(toInboxMessage({ ...camel, is_self: true }).isSelf, false);
});

test('Zalo message mapping retains deletion, quote, reactions, receipts and poll details', () => {
  const raw = { id: 1, zaloMsgId: 'z-message', timestamp: '2026-11-20T00:00:00Z', contentType: 'poll', content: 'Question', isSelf: true,
    isDeleted: true, quote: { msgId: 'original' }, reactions: { '👍': ['self'] }, rawContent: { id: 'poll-1', options: [] }, seenAt: 'seen', deliveredAt: 'delivered' };
  const result = toInboxMessage(raw);
  assert.equal(result.providerId, raw.zaloMsgId);
  for (const key of ['isDeleted', 'quote', 'reactions', 'seenAt', 'deliveredAt']) assert.deepEqual(result[key], raw[key]);
  assert.deepEqual(result.poll, raw.rawContent);
});

test('error messages support both provider response shapes without rendering an object', () => {
  assert.equal(inboxError({ response: { data: { error: 'Disconnected' } } }, 'fallback'), 'Disconnected');
  assert.equal(inboxError({ response: { data: { error: { message: 'Quota exceeded' } } } }, 'fallback'), 'Quota exceeded');
  assert.equal(inboxError(new Error(), 'fallback'), 'fallback');
});
