import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkMessageBody, messageLength, normalizeMessageBody, previewOf, MESSAGE_MAX_CHARS } from '../messaging';
import { SlidingWindowLimiter, createGuards, limitsFromEnv } from '../../server/messaging/limits';

describe('message body rules', () => {
  it('keeps intentional line breaks and trims only the outer whitespace', () => {
    assert.equal(normalizeMessageBody('  first line\r\nsecond line\rthird  '), 'first line\nsecond line\nthird');
  });

  it('rejects empty and whitespace-only messages', () => {
    assert.equal(checkMessageBody('').ok, false);
    assert.equal(checkMessageBody(' \n\t  \r\n').ok, false);
    const empty = checkMessageBody('   ');
    assert.equal(empty.ok === false && empty.code, 'EMPTY_MESSAGE');
  });

  it('allows exactly 5,000 characters and rejects one more', () => {
    assert.equal(checkMessageBody('a'.repeat(MESSAGE_MAX_CHARS)).ok, true);
    const tooLong = checkMessageBody('a'.repeat(MESSAGE_MAX_CHARS + 1));
    assert.equal(tooLong.ok === false && tooLong.code, 'MESSAGE_TOO_LONG');
    assert.equal(tooLong.ok === false && tooLong.message.includes('Remove 1 character to send'), true);
  });

  it('counts emoji as one character each', () => {
    assert.equal(messageLength('😀'.repeat(5)), 5);
    assert.equal(checkMessageBody('😀'.repeat(MESSAGE_MAX_CHARS)).ok, true);
    assert.equal(checkMessageBody('😀'.repeat(MESSAGE_MAX_CHARS + 1)).ok, false);
  });

  it('rejects control characters but keeps tabs and line breaks', () => {
    const bad = checkMessageBody('hello\u0007world');
    assert.equal(bad.ok === false && bad.code, 'INVALID_CHARACTERS');
    assert.equal(checkMessageBody('col a\tcol b\nrow two').ok, true);
  });

  it('previews collapse whitespace and truncate by character', () => {
    assert.equal(previewOf('one\n\n  two\tthree'), 'one two three');
    const long = previewOf('x'.repeat(300));
    assert.equal(long.length, 141);
    assert.ok(long.endsWith('…'));
  });
});

describe('sliding window limiter', () => {
  it('allows the configured number of attempts, then reports how long to wait', () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(2, 1000, () => now);
    assert.equal(limiter.attempt('user').allowed, true);
    now = 100;
    assert.equal(limiter.attempt('user').allowed, true);
    now = 200;
    const refused = limiter.attempt('user');
    assert.equal(refused.allowed, false);
    assert.equal(refused.allowed === false && refused.retryAfterSeconds, 1);
  });

  it('frees attempts once they leave the window, and keeps users separate', () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(1, 1000, () => now);
    assert.equal(limiter.attempt('a').allowed, true);
    assert.equal(limiter.attempt('a').allowed, false);
    assert.equal(limiter.attempt('b').allowed, true);
    now = 1000;
    assert.equal(limiter.attempt('a').allowed, true);
  });

  it('reads limits from the environment with safe defaults', () => {
    const defaults = limitsFromEnv({} as NodeJS.ProcessEnv);
    assert.deepEqual(defaults, { sendsPerMinute: 30, conversationStartsPerHour: 10, streamsPerUser: 5, reportsPerHour: 10 });
    const custom = limitsFromEnv({ MESSAGE_SEND_LIMIT_PER_MINUTE: '7', CONVERSATION_START_LIMIT_PER_HOUR: 'nope' } as unknown as NodeJS.ProcessEnv);
    assert.equal(custom.sendsPerMinute, 7);
    assert.equal(custom.conversationStartsPerHour, 10);
    assert.equal(createGuards(custom).limits.sendsPerMinute, 7);
  });
});
