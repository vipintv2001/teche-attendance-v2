/**
 * Builds the hardware signature sent to the MongoDB device registry.
 * Uses platform and screen dimensions without browser storage or client-generated IDs.
 */
export function getDeviceSignature() {
  const platform =
    navigator.userAgentData?.platform ||
    navigator.platform ||
    'unknown';
  const width = window.screen?.width || 0;
  const height = window.screen?.height || 0;
  const dpr = window.devicePixelRatio || 1;
  const screenSize = `${width}x${height}x${dpr}`;

  return {
    platform: String(platform).trim(),
    screenSize
  };
}

/**
 * Requests GPS coordinates via browser Geolocation API when IP verification falls back to 100m geofence.
 */
export function getCurrentCoordinates() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported on this browser.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(
            new Error(
              'Location access was denied. Please connect to TechE Institute Wi-Fi or allow GPS location access.'
            )
          );
          return;
        }
        reject(new Error('Unable to retrieve GPS coordinates. Please try again.'));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
}

