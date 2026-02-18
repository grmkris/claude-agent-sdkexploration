import { query } from "@anthropic-ai/claude-agent-sdk"
import { type NextRequest } from "next/server"
import { MCP_SERVERS } from "@/lib/mcp-servers"

export async function GET(req: NextRequest) {
  const prompt = req.nextUrl.searchParams.get("prompt")
  const resume = req.nextUrl.searchParams.get("resume")
  const cwd = req.nextUrl.searchParams.get("cwd")

  if (!prompt) {
    return Response.json({ error: "Missing ?prompt= query param" }, { status: 400 })
  }

  const conversation = query({
    prompt,
    options: {
      model: "claude-sonnet-4-6",
      executable: "bun",
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      mcpServers: MCP_SERVERS,
      ...(resume ? { resume: { id: resume, transcript: [] } } : {}),
      ...(cwd ? { cwd } : {}),
    },
  })

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        for await (const message of conversation) {
          const msg = message as Record<string, unknown>

          switch (msg.type) {
            case "system":
              if (msg.subtype === "init") {
                send("init", {
                  sessionId: msg.session_id,
                })
              }
              break

            case "assistant": {
              const assistantMsg = msg.message as { content: Array<{ type: string; text?: string; name?: string; input?: unknown }> }
              for (const block of assistantMsg.content) {
                if (block.type === "text") {
                  send("text", { text: block.text })
                } else if (block.type === "tool_use") {
                  send("tool_use", { name: block.name, input: block.input })
                }
              }
              break
            }

            case "result":
              send("result", {
                subtype: msg.subtype,
                ...(msg.subtype === "success"
                  ? { cost: msg.total_cost_usd, turns: msg.num_turns }
                  : {}),
              })
              break
          }
        }
      } catch (err) {
        send("error", { message: String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
