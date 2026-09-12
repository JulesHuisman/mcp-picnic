import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolResult } from "../../../src/tools/registry.js"

const mocks = vi.hoisted(() => ({
  addProductToCart: vi.fn(),
  initializePicnicClient: vi.fn(),
}))

vi.mock("../../../src/utils/picnic-client.js", () => ({
  getPicnicClient: () => ({
    cart: { addProductToCart: mocks.addProductToCart },
  }),
  initializePicnicClient: mocks.initializePicnicClient,
  saveSession: vi.fn(),
  verifyPicnic2FACode: vi.fn(),
}))

function parseToolResult(result: ToolResult) {
  return JSON.parse(result.content[0].text ?? "")
}

async function loadTools() {
  vi.resetModules()
  const { toolRegistry } = await import("../../../src/tools/registry.js")
  await import("../../../src/tools/picnic-tools.js")
  return toolRegistry
}

describe("picnic_add_to_cart", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns only the confirmation message", async () => {
    mocks.addProductToCart.mockResolvedValue({
      type: "ORDER",
      id: "cart-1",
      total_count: 3,
      items: [
        {
          id: "line-other",
          display_price: 199,
          items: [{ id: "s999", name: "Other product", unit_quantity: "1 stuk", price: 199 }],
        },
        {
          id: "line-added",
          display_price: 498,
          items: [
            {
              id: "s100",
              name: "Tomatoes",
              unit_quantity: "500 g",
              price: 249,
              image_ids: ["img-1"],
            },
          ],
        },
      ],
    })

    const toolRegistry = await loadTools()
    const payload = parseToolResult(
      await toolRegistry.executeTool("picnic_add_to_cart", { productId: "s100", count: 2 })
    )

    expect(mocks.addProductToCart).toHaveBeenCalledWith("s100", 2)
    expect(payload).toEqual({ message: "Added 2 item(s) to cart" })
  })
})
