"use client"

import { use } from "react"
import { SessionList } from "@/components/session-list"

export default function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const shortPath = slug.replace(/-/g, "/").split("/").slice(-2).join("/")

  return (
    <div className="flex-1 overflow-auto p-4">
      <h2 className="mb-4 text-sm font-medium">Sessions for {shortPath}</h2>
      <SessionList projectSlug={slug} />
    </div>
  )
}
