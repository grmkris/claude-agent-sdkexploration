"use client";

import { use } from "react";

import { EmailContent } from "@/components/email-content";

export default function ProjectEmailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <EmailContent projectSlug={slug} />
    </div>
  );
}
