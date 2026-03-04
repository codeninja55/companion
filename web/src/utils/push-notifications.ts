/**
 * Browser-side Web Push subscription management.
 *
 * Uses the Push API via the active service worker registration to
 * subscribe/unsubscribe for push notifications. The VAPID public key
 * is fetched from the server and converted to the Uint8Array format
 * required by PushManager.subscribe().
 */

/** Convert a base64url-encoded VAPID key to a Uint8Array for PushManager.subscribe(). */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Check whether the browser supports Web Push (service worker + PushManager). */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

/** Check whether the browser is currently subscribed to push notifications. */
export async function isPushSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch {
    return false;
  }
}

/**
 * Subscribe the browser for push notifications.
 * Fetches the VAPID public key from the server, creates a push subscription,
 * and sends it to the server for storage.
 * Returns true on success, false on failure.
 */
export async function registerPushSubscription(vapidPublicKey: string): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Unsubscribe from push notifications.
 * Removes the push subscription from both the browser and the server.
 * Returns true on success, false on failure.
 */
export async function unregisterPushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return true;

    // Notify server first
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });

    // Unsubscribe from the browser
    await subscription.unsubscribe();
    return true;
  } catch {
    return false;
  }
}
