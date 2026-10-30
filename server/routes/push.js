/**
 * Thông báo đẩy khi lịch cắt điện thay đổi (services/webPush.js): mỗi người tự bật trên từng thiết bị.
 * Service worker do ứng dụng chủ phục vụ công khai tại /dkct-sw.js (module.serviceWorker).
 */
const express = require('express');

function pushRouter({ policy, wrap, push }) {
  const router = express.Router();

  // khóa công khai VAPID để trình duyệt đăng ký, và các thiết bị đã bật của người dùng (?endpoint=: đánh dấu thiết bị đang dùng)
  router.get('/push/config', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    res.json({ publicKey: await push.publicKey(), devices: await push.devicesOf(actor.id, req.query.endpoint), department: actor.department || '' });
  }));

  router.post('/push/subscriptions', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    const device = await push.subscribe(actor, req.body || {});
    res.status(201).json({ device, devices: await push.devicesOf(actor.id, req.body?.subscription?.endpoint) });
  }));

  // tắt trên thiết bị đang dùng (theo endpoint của trình duyệt)
  router.post('/push/unsubscribe', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    await push.unsubscribe(actor, req.body?.endpoint);
    res.json({ devices: await push.devicesOf(actor.id, req.body?.endpoint) });
  }));

  router.delete('/push/subscriptions/:id', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    await push.remove(actor, req.params.id);
    res.json({ devices: await push.devicesOf(actor.id, req.query.endpoint) });
  }));

  router.post('/push/test', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    res.json(await push.test(actor));
  }));

  return router;
}

module.exports = { pushRouter };
