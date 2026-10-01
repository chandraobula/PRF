import { getNotificationConfig, removePushSubscription, savePushSubscription } from '../services/notificationsApi';

function base64UrlToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

export function browserPushAvailable() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function currentPushSubscription() {
  if (!browserPushAvailable()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function enablePushNotifications() {
  if (!browserPushAvailable()) throw new Error('Push notifications are not supported on this device.');
  const config = await getNotificationConfig();
  if (!config.pushSupported || !config.vapidPublicKey) throw new Error('Push notifications still need their one-time server setup.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(config.vapidPublicKey),
    });
  }
  await savePushSubscription(subscription.toJSON());
  return subscription;
}

export async function disablePushNotifications() {
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  await removePushSubscription(subscription.endpoint);
  await subscription.unsubscribe();
}
