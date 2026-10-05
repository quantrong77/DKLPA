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

test('reloadHint: nói rõ danh sách được tải lại theo tab (tab Lịch: lịch hoặc công việc) và giờ cập nhật', async () => {
  const { reloadHint, refreshedLabel } = await import('../client/lib/help.js');
  assert.match(reloadHint('outages'), /danh sách lịch cắt điện, danh mục/);
  assert.match(reloadHint('outages', 'works'), /danh sách công việc không có lịch cắt điện/);
  assert.match(reloadHint('plans', 'works'), /danh sách phương án/);
  assert.match(reloadHint('khac'), /máy chủ: danh sách đang mở, danh mục/);
  const at = new Date(2026, 9, 5, 9, 7);
  assert.match(reloadHint('surveys', 'outages', at), /Cập nhật lần cuối lúc 09:07\./);
  assert.doesNotMatch(reloadHint('surveys'), /Cập nhật lần cuối/);
  assert.equal(refreshedLabel(at), 'Cập nhật 09:07');
  assert.equal(refreshedLabel(null), '');
});
