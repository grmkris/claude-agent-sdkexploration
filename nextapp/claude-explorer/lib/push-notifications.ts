import webpush from "web-push";

import {
  getAllSubscriptions,
  removeSubscription,
} from "./push-subscriptions-db";

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  event?: string;
}

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

let vapidConfigured = false;

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    "mailto:notifications@claude-explorer.local",
    vapidPublicKey,
    vapidPrivateKey
  );
  vapidConfigured = true;
}

export async function sendPushNotification(
  payload: PushPayload
): Promise<void> {
  if (!vapidConfigured) return;

  const subscriptions = getAllSubscriptions();
  if (subscriptions.length === 0) return;

  const body = JSON.stringify(payload);

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.keys_p256dh,
              auth: sub.keys_auth,
            },
          },
          body
        );
      } catch (err: unknown) {
        // 410 Gone or 404 = subscription expired, remove it
        if (
          err &&
          typeof err === "object" &&
          "statusCode" in err &&
          ((err as { statusCode: number }).statusCode === 410 ||
            (err as { statusCode: number }).statusCode === 404)
        ) {
          removeSubscription(sub.endpoint);
        }
      }
    })
  );
}
