import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { parseEventList } from '../extension/lib/parser.js';

const html = readFileSync(new URL('./fixtures/gu-banner.html', import.meta.url), 'utf8');
const { document } = parseHTML(html);

test('parseEventList 取出卡池 ID 與名稱', () => {
  const events = parseEventList(document);
  assert.ok(events.length >= 2, '至少數個卡池');
  const known = events.find((e) => e.id === '2026-04-24_1047');
  assert.ok(known, '應含 2026-04-24_1047');
  assert.match(known.id, /^\d{4}-\d{2}-\d{2}_\d+$/);
  assert.ok(known.name.length > 0);
});

test('parseEventList 不含地區/型態等非卡池 option', () => {
  const events = parseEventList(document);
  assert.ok(!events.some((e) => ['en', 'tw', 'jp', 'kr', '0', '1'].includes(e.id)));
});
