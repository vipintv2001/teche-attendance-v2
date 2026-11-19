const express = require('express');
const {
  getSession,
  checkIn,
  checkOut,
  subscribePush,
  getVapidPublicKey,
  getMyHistory
} = require('../controllers/attendanceController');
const { verifyOfficePresence } = require('../middleware/verifyOfficePresence');

const router = express.Router();

router.get('/session', getSession);
router.post('/check-in', verifyOfficePresence, checkIn);
router.post('/check-out', verifyOfficePresence, checkOut);
router.post('/subscribe-push', subscribePush);
router.get('/vapid-public-key', getVapidPublicKey);
router.get('/my-history', getMyHistory);

module.exports = router;
