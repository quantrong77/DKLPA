/**
 * Thông báo Zalo (chỉ admin): cấu hình bot, người nhận, gửi thử, tìm người vừa nhắn bot.
 */
const express = require('express');
const { forbidden } = require('../policy');

function zaloRouter({ policy, wrap, zalo }) {
  const router = express.Router();
  const requireAdmin = wrap(async (req, res, next) => {
    const actor = await policy.actorOf(req);
    if (!policy.isAdmin(actor)) throw forbidden('Chỉ admin được cấu hình thông báo Zalo.');
    req.dkctActor = actor;
    next();
  });

  router.get('/zalo-settings', requireAdmin, wrap(async (req, res) => res.json(await zalo.view())));
  router.put('/zalo-settings', requireAdmin, wrap(async (req, res) => {
    const b = req.body || {};
    res.json(await zalo.save({
      token: b.token, clearToken: !!b.clearToken, enabled: b.enabled, onAuto: b.onAuto, onManual: b.onManual,
      appUrl: b.appUrl, recipients: b.recipients
    }, req.dkctActor.id));
  }));
  router.post('/zalo-settings/test', requireAdmin, wrap(async (req, res) => res.json(await zalo.test(req.body?.chatId))));
  router.post('/zalo-settings/discover', requireAdmin, wrap(async (req, res) => res.json({ chats: await zalo.discover() })));
  return router;
}

module.exports = { zaloRouter };
