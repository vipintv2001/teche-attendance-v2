const express = require('express');
const {
  adminLogin,
  getAdminMe,
  adminLogout,
  getAdminStatus,
  getSettings,
  updateOfficeIp,
  getMonthlyLedger,
  createOrUpdateHoliday,
  deleteHoliday,
  createEmployee,
  updateEmployee,
  manualOverride,
  unbindDevice
} = require('../controllers/adminController');
const requireAdminAuth = require('../middleware/requireAdminAuth');

const router = express.Router();

// Public route
router.post('/login', adminLogin);

// All routes below are strictly protected by requireAdminAuth
router.use(requireAdminAuth);

router.get('/me', getAdminMe);
router.post('/logout', adminLogout);
router.get('/status', getAdminStatus);
router.get('/settings', getSettings);
router.post('/settings/office-ip', updateOfficeIp);
router.get('/monthly-ledger', getMonthlyLedger);
router.post('/holidays', createOrUpdateHoliday);
router.delete('/holidays/:date', deleteHoliday);
router.post('/employees', createEmployee);
router.patch('/employees/:employeeId', updateEmployee);
router.post('/manual-override', manualOverride);
router.post('/approve-missed-checkout', manualOverride);
router.post('/unbind-device', unbindDevice);

module.exports = router;
