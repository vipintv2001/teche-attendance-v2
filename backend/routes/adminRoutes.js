const express = require('express');
const {
  adminLogin,
  adminLogout,
  getAdminStatus,
  getMonthlyLedger,
  manualOverride,
  unbindDevice
} = require('../controllers/adminController');
const verifyAdminAuth = require('../middleware/verifyAdminAuth');

const router = express.Router();

router.post('/login', adminLogin);
router.post('/logout', adminLogout);
router.get('/status', getAdminStatus);
router.get('/monthly-ledger', getMonthlyLedger);
router.post('/manual-override', verifyAdminAuth, manualOverride);
router.post('/unbind-device', verifyAdminAuth, unbindDevice);

module.exports = router;

