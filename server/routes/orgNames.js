/**
 * Tên công ty, tên đội in trên văn bản mới (services/orgNames.js): ai cũng xem được, chỉ admin sửa.
 */
const express = require('express');
const { forbidden } = require('../policy');
const { DEFAULT_COMPANY_NAME, DEFAULT_UNIT_NAME } = require('../services/orgNames');

function orgNamesRouter({ policy, wrap, orgNames }) {
  const router = express.Router();
  const view = async () => ({ ...(await orgNames.get()), defaults: { companyName: DEFAULT_COMPANY_NAME, unitName: DEFAULT_UNIT_NAME } });

  router.get('/org-names', wrap(async (req, res) => {
    await policy.actorOf(req);
    res.json(await view());
  }));

  router.put('/org-names', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    if (!policy.isAdmin(actor)) throw forbidden('Chỉ admin được đổi tên đơn vị.');
    await orgNames.save(req.body || {});
    res.json(await view());
  }));

  return router;
}

module.exports = { orgNamesRouter };
