const express = require('express');
const {
  getSession,
  checkIn,
  checkOut,
  subscribePush,
  getVapidPublicKey
} = require('../controllers/attendanceController');
const { verifyOfficePresence } = require('../middleware/verifyOfficePresence');

const router = express.Router();

router.get('/session', getSession);
router.post('/check-in', verifyOfficePresence, checkIn);
router.post('/check-out', checkOut);
router.post('/subscribe-push', subscribePush);
router.get('/vapid-public-key', getVapidPublicKey);

module.exports = router;

