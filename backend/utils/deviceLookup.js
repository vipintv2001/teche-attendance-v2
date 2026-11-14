const Employee = require('../models/Employee');

/**
 * Looks up a bound Employee document by HttpOnly deviceToken cookie first,
 * falling back to hardware signature (platform + screenSize) when cache/cookies are cleared.
 */
async function findBoundEmployee(req, platform = '', screenSize = '') {
  const cookieToken = req.cookies?.deviceToken;

  if (cookieToken && typeof cookieToken === 'string') {
    const byToken = await Employee.findOne({ registeredDeviceToken: cookieToken });
    if (byToken) {
      return byToken;
    }
  }

  const normalizedPlatform = String(platform || '').trim();
  const normalizedScreen = String(screenSize || '').trim();

  if (normalizedPlatform && normalizedScreen) {
    const bySignature = await Employee.findOne({
      'deviceSignature.platform': normalizedPlatform,
      'deviceSignature.screenSize': normalizedScreen,
      registeredDeviceToken: { $ne: null }
    });
    if (bySignature) {
      return bySignature;
    }
  }

  return null;
}

function sanitizeEmployee(emp) {
  if (!emp) return null;
  return {
    employeeId: emp.employeeId,
    name: emp.name,
    hasPushSubscription: Boolean(emp.pushSubscription && emp.pushSubscription.endpoint)
  };
}

module.exports = {
  findBoundEmployee,
  sanitizeEmployee
};

