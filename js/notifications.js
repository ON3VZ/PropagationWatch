/** notifications.js — Web Push API / browser notifications */

let granted = false;

export async function requestPermission() {
  if (!('Notification' in window)) return false;
  const result = await Notification.requestPermission();
  granted = result === 'granted';
  return granted;
}

export function hasPermission() {
  return Notification.permission === 'granted';
}

export function scheduleNotification({ title, body, tag, url }) {
  if (!hasPermission()) return;
  // Trigger immediately (alarm timing handled by watches.js debounce)
  navigator.serviceWorker?.ready.then(reg => {
    reg.showNotification(title, { body, tag, icon: '/assets/icons/icon-192.png',
      badge: '/assets/icons/icon-192.png', data: url });
  }).catch(() => {
    // Fallback: direct Notification API
    new Notification(title, { body, tag, icon: '/assets/icons/icon-192.png' });
  });
}
