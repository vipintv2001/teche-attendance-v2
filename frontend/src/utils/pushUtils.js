import { fetchVapidPublicKey, postSubscribePush } from '../api/client';
import { getDeviceSignature } from './deviceUtils';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.warn('Service worker registration failed:', err);
    return null;
  }
}

export async function subscribeEmployeeToPush() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error(
      'Web Push is not supported in this browser. On iOS, add this app to your Home Screen first (iOS 16.4+).'
    );
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  const { publicKey, configured } = await fetchVapidPublicKey();
  if (!configured || !publicKey) {
    throw new Error('VAPID Public Key is not configured on the server.');
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
  }

  const { platform, screenSize } = getDeviceSignature();
  await postSubscribePush({
    subscription: subscription.toJSON(),
    platform,
    screenSize
  });

  return subscription;
}

