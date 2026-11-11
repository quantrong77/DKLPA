/**
 * Tên công ty, đội, tên gọi đơn vị trực tiếp, chức danh (services/orgNames.js): ai cũng xem được, chỉ admin sửa.
 */
const express = require('express');
const { forbidden } = require('../policy');

function orgNamesRouter({ policy, wrap, orgNames }) {
  const router = express.Router();
  router.get('/org-names', wrap(async (req, res) => {
    await policy.actorOf(req);
    res.json(await orgNames.view());
  }));

  router.put('/org-names', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    if (!policy.isAdmin(actor)) throw forbidden('Chỉ admin được đổi tên đơn vị.');
    await orgNames.save(req.body || {});
    res.json(await orgNames.view());
  }));

  return router;
}

module.exports = { orgNamesRouter };
