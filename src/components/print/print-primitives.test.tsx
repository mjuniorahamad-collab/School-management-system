// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { PrintFieldGrid, PrintSection } from "@/components/print/PrintFields"
import { PrintSignatureRow } from "@/components/print/PrintSignatures"
import { PrintTable, type PrintTableColumn } from "@/components/print/PrintTable"
import { PrintTotals } from "@/components/print/PrintTotals"

// Contract tests for the shared print primitives. The shell itself (letterhead,
// title block, footer, framing) is covered in print-document.test.tsx.

afterEach(() => {
  cleanup()
})

interface Item {
  id: string
  name: string
}

const columns: PrintTableColumn<Item>[] = [
  { key: "name", header: "Name", render: (row) => row.name },
  { key: "amount", header: "Amount", numeric: true, render: (row) => `₹${row.id}` },
]

describe("PrintSection", () => {
  it("renders a named section heading", () => {
    const { container } = render(
      <PrintSection title="Fee breakdown">
        <p>Rows</p>
      </PrintSection>,
    )

    expect(container.querySelector("h2")?.textContent).toBe("Fee breakdown")
    expect(container.querySelector(".print-document-section")?.textContent).toBe("Fee breakdown")
    expect(container.textContent).toContain("Rows")
  })
})

describe("PrintFieldGrid", () => {
  it("renders one labelled value per field", () => {
    const { container } = render(
      <PrintFieldGrid
        fields={[
          { label: "Class", value: "Grade 5" },
          { label: "Section", value: "A" },
        ]}
      />,
    )

    expect(container.querySelectorAll("dt")).toHaveLength(2)
    expect(container.textContent).toContain("Grade 5")
  })
})

describe("PrintTotals", () => {
  const items = [
    { label: "Invoice total", value: "₹100" },
    { label: "Amount received", value: "₹40", emphasis: true },
    { label: "Balance after", value: "₹60" },
  ]

  it("renders the strip variant with every label and value", () => {
    const { container } = render(<PrintTotals items={items} />)

    expect(container.querySelector(".print-document-totals-strip")).not.toBeNull()
    for (const item of items) {
      expect(container.textContent).toContain(item.label)
      expect(container.textContent).toContain(item.value)
    }
  })

  it("emphasises only the item marked for emphasis", () => {
    const { container } = render(<PrintTotals items={items} />)

    expect(container.querySelectorAll(".print-document-total-emphasis")).toHaveLength(1)
    expect(container.textContent).toContain("Amount received")
  })

  it("renders an optional hint under an item", () => {
    const { container } = render(
      <PrintTotals items={[{ label: "Balance after", value: "₹0", hint: "Fully paid" }]} />,
    )

    expect(container.textContent).toContain("Fully paid")
  })

  it("renders the ledger variant and emphasises the configured label", () => {
    const { container } = render(
      <PrintTotals
        variant="ledger"
        emphasisLabel="Total payable"
        items={[
          { label: "Total", value: "₹100" },
          { label: "Paid", value: "₹40" },
          { label: "Total payable", value: "₹60" },
        ]}
      />,
    )

    expect(container.querySelector(".print-document-totals-ledger")).not.toBeNull()
    expect(container.querySelectorAll(".print-document-total-emphasis")).toHaveLength(2)
    expect(container.textContent).toContain("Total payable")
  })
})

describe("PrintTable", () => {
  it("renders a header row and one row per record", () => {
    const { container } = render(
      <PrintTable columns={columns} rows={[{ id: "10", name: "Tuition" }]} rowKey={(row) => row.id} />,
    )

    expect(Array.from(container.querySelectorAll("thead th")).map((th) => th.textContent)).toEqual([
      "Name",
      "Amount",
    ])
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1)
    expect(container.textContent).toContain("₹10")
  })

  it("shows the empty message instead of a blank table when there are no rows", () => {
    const { container } = render(
      <PrintTable
        columns={columns}
        rows={[]}
        rowKey={(row) => row.id}
        emptyMessage="No loans match this filter."
      />,
    )

    expect(container.querySelectorAll("tbody tr")).toHaveLength(1)
    expect(container.textContent).toContain("No loans match this filter.")
  })

  it("spans the empty message across every column", () => {
    const { container } = render(<PrintTable columns={columns} rows={[]} rowKey={(row) => row.id} />)

    expect(container.querySelector("tbody td")?.getAttribute("colspan")).toBe("2")
  })

  it("applies an explicit column width to both the head and body cells", () => {
    const { container } = render(
      <PrintTable
        columns={[
          { key: "name", header: "Name", width: "30%", render: (row: Item) => row.name },
          { key: "amount", header: "Amount", numeric: true, render: (row: Item) => row.id },
        ]}
        rows={[{ id: "10", name: "Tuition" }]}
        rowKey={(row) => row.id}
      />,
    )

    expect(container.querySelector<HTMLTableCellElement>("thead th")?.style.width).toBe("30%")
    expect(container.querySelector<HTMLTableCellElement>("tbody td")?.style.width).toBe("30%")
  })

  it("renders a repeating totals footer when supplied", () => {
    const { container } = render(
      <PrintTable
        columns={columns}
        rows={[{ id: "10", name: "Tuition" }]}
        rowKey={(row) => row.id}
        footer={
          <tr>
            <td>Total</td>
            <td>₹10</td>
          </tr>
        }
      />,
    )

    const tfoot = container.querySelector("tfoot")
    expect(tfoot).not.toBeNull()
    expect(tfoot?.textContent).toContain("Total")
  })

  it("omits the tfoot entirely when no footer is supplied", () => {
    const { container } = render(
      <PrintTable columns={columns} rows={[{ id: "10", name: "Tuition" }]} rowKey={(row) => row.id} />,
    )

    expect(container.querySelector("tfoot")).toBeNull()
  })

  it("marks a compact table for the tighter print density", () => {
    const { container } = render(
      <PrintTable
        compact
        columns={columns}
        rows={[{ id: "10", name: "Tuition" }]}
        rowKey={(row) => row.id}
      />,
    )

    expect(container.querySelector(".print-document-table-compact")).not.toBeNull()
  })

  it("renders a caption as a section heading", () => {
    const { container } = render(
      <PrintTable
        caption="Fee breakdown"
        columns={columns}
        rows={[{ id: "10", name: "Tuition" }]}
        rowKey={(row) => row.id}
      />,
    )

    expect(container.querySelector("caption")?.textContent).toBe("Fee breakdown")
  })

  it("adds no per-cell border class — the print stylesheet owns the rule", () => {
    const { container } = render(
      <PrintTable columns={columns} rows={[{ id: "10", name: "Tuition" }]} rowKey={(row) => row.id} />,
    )

    for (const cell of Array.from(container.querySelectorAll("th, td"))) {
      expect(cell.className).not.toMatch(/border-foreground|border-\[|border-solid|border-slate/)
    }
  })
})

describe("PrintSignatureRow", () => {
  it("renders one signature line per role", () => {
    const { container } = render(<PrintSignatureRow roles={["Parent / Guardian", "Accounts"]} />)

    expect(container.textContent).toContain("Parent / Guardian")
    expect(container.textContent).toContain("Accounts")
    expect(container.querySelectorAll(".print-document-signature-rule")).toHaveLength(2)
  })

  it("prints a server-supplied name above the rule instead of discarding it", () => {
    const { container } = render(
      <PrintSignatureRow entries={[{ role: "Received by", name: "Meera Iyer" }, { role: "Verified by", name: null }]} />,
    )

    expect(container.textContent).toContain("Meera Iyer")
  })

  it("omits the name line entirely when the server returned none", () => {
    const { container } = render(<PrintSignatureRow roles={["Received by", "Verified by"]} />)

    // Two rules and two role labels, and no name paragraph above them: the only
    // notes present are the two role captions, so nothing empty adds stray space.
    expect(container.querySelectorAll(".print-document-signature-rule")).toHaveLength(2)
    expect(container.querySelector(".print-document-signatures-no-stamp")).not.toBeNull()
    expect(container.querySelectorAll(".print-document-note")).toHaveLength(2)
  })

  it("adds a school stamp box when requested", () => {
    const { container } = render(<PrintSignatureRow roles={["Received by"]} stamp />)

    expect(container.querySelector(".print-document-stamp")).not.toBeNull()
  })

  it("omits the stamp box by default", () => {
    const { container } = render(<PrintSignatureRow roles={["Received by"]} />)

    expect(container.querySelector(".print-document-stamp")).toBeNull()
  })
})
