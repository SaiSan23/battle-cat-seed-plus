import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { parseRollTable } from '../extension/lib/parser.js';
import { mergeBanners } from '../extension/lib/merge.js';
import { pullOutcome } from '../extension/lib/route.js';

// 資料驅動回歸鎖：fixture 內所有 godfat 標的重抽格，模擬「以重複狀態抵達」，
// 斷言 pullOutcome 的落點與 godfat 自己的箭頭一致（A→(n+1)B、B→(n+2)A）。
for (const file of ['dupe-banner.html', 'dupe-chain-banner.html']) {
  test(`落點與 godfat 箭頭一致：${file}`, () => {
    const { document } = parseHTML(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8'));
    const parsed = parseRollTable(document);
    const merged = mergeBanners([{ banner: { id: 'x' }, parsed }]);
    let checked = 0;
    for (const [, cell] of parsed.cells) {
      if (!cell.dupe?.to || cell.rarity !== 'rare') continue;
      // 以「上一抽 = 本格天然貓」抵達 → 觸發重抽
      const o = pullOutcome(merged, '測試池', cell.n, cell.track, cell.name, 'x', false);
      assert.equal(o.switched, true, `${cell.pos} 應觸發換軌`);
      const expect = cell.dupe.to.match(/^(\d+)([AB])/);
      assert.equal(String(o.nextN), expect[1], `${cell.pos} 落點位置（godfat: ${cell.dupe.to}）`);
      assert.equal(o.nextTrack, expect[2], `${cell.pos} 落點軌道（godfat: ${cell.dupe.to}）`);
      // 同時驗證規則式落點（無標時的 fallback）與 godfat 標示相符
      const ruleN = cell.track === 'A' ? cell.n + 1 : cell.n + 2;
      const ruleT = cell.track === 'A' ? 'B' : 'A';
      assert.equal(String(ruleN), expect[1], `${cell.pos} 規則落點位置應同 godfat`);
      assert.equal(ruleT, expect[2], `${cell.pos} 規則落點軌道應同 godfat`);
      checked++;
    }
    assert.ok(checked >= 3, `${file} 應至少驗證 3 個重抽格（實際 ${checked}）`);
  });
}
