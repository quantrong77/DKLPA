const test = require('node:test');
const assert = require('node:assert/strict');

test('help: mỗi tab của ứng dụng có mục hướng dẫn; tab lạ mở "Bắt đầu"; giới thiệu có người phát triển', async () => {
  const { HELP_SECTIONS, helpFor, ABOUT } = await import('../client/lib/help.js');
  const { WORKFLOW_STEPS } = await import('../client/lib/workflow.js');
  for (const tab of [...WORKFLOW_STEPS.map(s => s.tab), 'catalogs', 'legacy']) {
    assert.equal(helpFor(tab).id, tab, `có hướng dẫn cho tab ${tab}`);
  }
  assert.equal(helpFor('khong-co').id, 'general');
  assert.ok(HELP_SECTIONS.every(s => s.items.length && s.items.every(([t, d]) => t && d.length > 20)));
  assert.deepEqual(ABOUT.developer, { name: 'Hoàng Trần Quản Trọng', email: 'quantrong77@gmail.com' });
});
