import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { SellerSnapshot } from "./invoices.seller.server";

function nok(n: number): string {
  return new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("nb-NO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export type PdfInvoiceInput = {
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  customer_name: string;
  customer_org_number: string | null;
  customer_email: string | null;
  customer_address: string | null;
  seller_snapshot: SellerSnapshot;
  lines: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    vat_rate: number;
    line_net: number;
    line_vat: number;
    line_total: number;
  }>;
  subtotal: number;
  vat_amount: number;
  total: number;
};

export async function renderInvoicePdf(invoice: PdfInvoiceInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  const margin = 50;
  const textColor = rgb(0.1, 0.1, 0.1);
  const mutedColor = rgb(0.4, 0.4, 0.4);

  let y = height - margin;

  const draw = (
    text: string,
    x: number,
    yPos: number,
    opts: { size?: number; font?: typeof font; color?: ReturnType<typeof rgb> } = {},
  ) => {
    page.drawText(text, {
      x,
      y: yPos,
      size: opts.size ?? 10,
      font: opts.font ?? font,
      color: opts.color ?? textColor,
    });
  };

  // Header
  draw("FAKTURA", width - margin - 130, y, { size: 22, font: bold });
  y -= 30;

  // Seller block (left)
  const s = invoice.seller_snapshot;
  let sy = y;
  draw(s.name, margin, sy, { size: 11, font: bold });
  sy -= 14;
  if (s.org_number) {
    draw(`Org.nr.: ${s.org_number}`, margin, sy);
    sy -= 12;
  }
  if (s.address) {
    draw(s.address, margin, sy);
    sy -= 12;
  }
  const cityLine = [s.postal_code, s.city].filter(Boolean).join(" ");
  if (cityLine) {
    draw(cityLine, margin, sy);
    sy -= 12;
  }
  if (s.country) {
    draw(s.country, margin, sy);
    sy -= 12;
  }
  if (s.bank_account) {
    draw(`Kontonr.: ${s.bank_account}`, margin, sy);
    sy -= 12;
  }

  // Meta block (right)
  let my = y;
  const metaX = width - margin - 200;
  draw(`Fakturanr.: ${invoice.invoice_number}`, metaX, my);
  my -= 14;
  draw(`Fakturadato: ${fmtDate(invoice.issue_date)}`, metaX, my);
  my -= 12;
  if (invoice.due_date) {
    draw(`Forfallsdato: ${fmtDate(invoice.due_date)}`, metaX, my);
    my -= 12;
  }

  y = Math.min(sy, my) - 20;

  // Customer
  draw("Fakturamottaker", margin, y, { size: 11, font: bold });
  y -= 16;
  draw(invoice.customer_name, margin, y);
  y -= 12;
  if (invoice.customer_org_number) {
    draw(`Org.nr.: ${invoice.customer_org_number}`, margin, y);
    y -= 12;
  }
  if (invoice.customer_address) {
    draw(invoice.customer_address, margin, y);
    y -= 12;
  }
  if (invoice.customer_email) {
    draw(invoice.customer_email, margin, y);
    y -= 12;
  }

  y -= 20;

  // Table header
  const colDesc = margin;
  const colQty = 320;
  const colPrice = 360;
  const colVat = 430;
  const colTotal = 480;

  draw("Beskrivelse", colDesc, y, { font: bold });
  draw("Ant.", colQty, y, { font: bold });
  draw("Pris", colPrice, y, { font: bold });
  draw("MVA%", colVat, y, { font: bold });
  draw("Sum", colTotal, y, { font: bold });
  y -= 4;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: mutedColor,
  });
  y -= 14;

  // Lines
  for (const line of invoice.lines) {
    draw(line.description.slice(0, 50), colDesc, y);
    draw(String(line.quantity), colQty, y);
    draw(nok(line.unit_price), colPrice, y);
    draw(String(line.vat_rate), colVat, y);
    draw(nok(line.line_total), colTotal, y);
    y -= 14;
    if (y < 150) break; // simple MVP: no pagination
  }

  y -= 10;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: mutedColor,
  });
  y -= 18;

  const totalsX = width - margin - 200;
  draw(`Sum eks. MVA:`, totalsX, y);
  draw(`${nok(invoice.subtotal)} NOK`, totalsX + 110, y);
  y -= 14;
  draw(`MVA:`, totalsX, y);
  draw(`${nok(invoice.vat_amount)} NOK`, totalsX + 110, y);
  y -= 18;
  draw(`Totalt å betale:`, totalsX, y, { font: bold, size: 12 });
  draw(`${nok(invoice.total)} NOK`, totalsX + 110, y, { font: bold, size: 12 });

  return await doc.save();
}
