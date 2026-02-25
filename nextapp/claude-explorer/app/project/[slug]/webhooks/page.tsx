"use client";

import { use } from "react";

import { WebhooksContent } from "@/components/webhooks-content";

export default function ProjectWebhooksPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <WebhooksContent projectSlug={slug} />
    </div>
  );
}
