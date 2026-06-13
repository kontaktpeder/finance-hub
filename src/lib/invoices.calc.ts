export type InvoiceLineCalcInput = {
  quantity: number;
  unit_price: number;
  vat_rate: number;
};

export function calcLine(line: InvoiceLineCalcInput) {
  const lineNet = Math.round(line.quantity * line.unit_price * 100) / 100;
  const lineVat = Math.round(lineNet * (line.vat_rate / 100) * 100) / 100;
  const lineTotal = Math.round((lineNet + lineVat) * 100) / 100;
  return { line_net: lineNet, line_vat: lineVat, line_total: lineTotal };
}

export function calcInvoiceTotals(lines: InvoiceLineCalcInput[]) {
  let subtotal = 0;
  let vat_amount = 0;
  let total = 0;
  for (const l of lines) {
    const c = calcLine(l);
    subtotal += c.line_net;
    vat_amount += c.line_vat;
    total += c.line_total;
  }
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    vat_amount: Math.round(vat_amount * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}
