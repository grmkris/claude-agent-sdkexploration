"use server";

import {
  removeSubscription,
  saveSubscription,
} from "@/lib/push-subscriptions-db";

export async function subscribePush(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<{ ok: boolean }> {
  saveSubscription(subscription);
  return { ok: true };
}

export async function unsubscribePush(
  endpoint: string
): Promise<{ ok: boolean }> {
  removeSubscription(endpoint);
  return { ok: true };
}
