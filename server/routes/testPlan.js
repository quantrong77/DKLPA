/**
 * Kế hoạch thí nghiệm hằng năm (services/testPlan.js), mỗi năm một kế hoạch: admin thêm / sửa / xóa kế hoạch năm (link
 * Google Sheet, trang tính, cột) và đồng bộ (theo link hoặc tải file .xlsx); mọi người xem dòng kế hoạch của một trạm khi
 * lập phương án.
 */
const express = require('express');
const multer = require('multer');
const { forbidden } = require('../policy');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024, files: 1, fields: 4 } });

function testPlanRouter({ policy, wrap, testPlan }) {
  const router = express.Router();
  const requireAdmin = wrap(async (req, res, next) => {
    if (!policy.isAdmin(await policy.actorOf(req))) throw forbidden('Chỉ admin được cài đặt kế hoạch thí nghiệm.');
    next();
  });

  router.get('/test-plan/plans', requireAdmin, wrap(async (req, res) => {
    res.json({ plans: await testPlan.plans() });
  }));

  // thêm (năm chưa có: chép cột của kế hoạch gần nhất) hoặc sửa kế hoạch năm; body.year khác: đổi năm
  router.put('/test-plan/plans/:year', requireAdmin, wrap(async (req, res) => {
    const plan = await testPlan.savePlan(req.params.year, req.body || {});
    res.json({ plan, plans: await testPlan.plans() });
  }));

  router.delete('/test-plan/plans/:year', requireAdmin, wrap(async (req, res) => {
    await testPlan.deletePlan(req.params.year);
    res.json({ plans: await testPlan.plans() });
  }));

  // đồng bộ: kèm file .xlsx (trường "file") thì đọc file, không thì tải theo link của kế hoạch năm
  router.post('/test-plan/plans/:year/sync', requireAdmin, (req, res, next) => upload.single('file')(req, res, (err) => {
    if (!err) return next();
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File kế hoạch tối đa 30 MB.' : err.message });
  }), wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    const name = String(req.body?.fileName || req.file?.originalname || '').normalize('NFC').slice(0, 200);
    const status = await testPlan.sync(req.params.year, { buffer: req.file?.buffer, fileName: name, actorId: actor.id });
    res.json({ status, plans: await testPlan.plans() });
  }));

  // dòng kế hoạch của một trạm (tên trạm so không dấu) theo năm (không có kế hoạch năm đó: năm gần nhất); years: các năm có
  router.get('/test-plan/items', wrap(async (req, res) => {
    await policy.actorOf(req);
    res.json(await testPlan.itemsOf({ station: req.query.station, year: req.query.year }));
  }));

  return router;
}

module.exports = { testPlanRouter };
