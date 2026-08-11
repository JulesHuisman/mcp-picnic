import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { StreamableHttpServer } from "../../../src/transports/streamable-http"
import { createMCPServer } from "../../../src/utils/server-factory"

// Rate limiting behind a reverse proxy: without `trust proxy` every client
// shares the proxy's address and therefore a single quota bucket, and
// unauthenticated health checks drain the quota real clients need.
vi.mock("../../../src/utils/server-factory")

vi.mock("@modelcontextprotocol/sdk/server/streamableHttp.js", () => ({
  StreamableHTTPServerTransport: vi.fn().mockImplementation(() => ({
    sessionId: "test-session-id",
    close: vi.fn().mockResolvedValue(undefined),
    handleRequest: vi.fn().mockResolvedValue(undefined),
  })),
}))

describe("StreamableHttpServer rate limiting", () => {
  let server: StreamableHttpServer
  let baseUrl: string

  const start = async (options: Record<string, unknown>) => {
    server = new StreamableHttpServer({
      port: 0,
      host: "127.0.0.1",
      rateLimitConfig: { windowMs: 60_000, maxRequests: 2 },
      enableRequestLogging: false,
      ...options,
    })
    await server.start()
    const address = (server as any).server.address()
    baseUrl = `http://127.0.0.1:${address.port}`
  }

  const post = (forwardedFor: string) =>
    fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": forwardedFor },
      body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
    })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createMCPServer).mockReturnValue({
      server: { setRequestHandler: vi.fn(), connect: vi.fn().mockResolvedValue(undefined) },
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as any)
  })

  afterEach(async () => {
    await server?.stop()
  })

  it("gives each forwarded client its own quota when trustProxy is enabled", async () => {
    await start({ trustProxy: true })

    // Exhaust the quota (2 requests) for the first client.
    await post("10.0.0.1")
    await post("10.0.0.1")
    expect((await post("10.0.0.1")).status).toBe(429)

    // A different client behind the same proxy is unaffected.
    expect((await post("10.0.0.2")).status).not.toBe(429)
  })

  it("shares one quota across clients when trustProxy is disabled", async () => {
    await start({ trustProxy: false })

    await post("10.0.0.1")
    await post("10.0.0.2")
    expect((await post("10.0.0.3")).status).toBe(429)
  })

  it("does not count health checks against the quota", async () => {
    await start({ trustProxy: true })

    for (let i = 0; i < 5; i++) {
      expect((await fetch(`${baseUrl}/health`)).status).toBe(200)
    }

    expect((await post("10.0.0.1")).status).not.toBe(429)
  })
})
