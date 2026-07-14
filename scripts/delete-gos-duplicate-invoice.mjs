/**
 * One-off: find and delete duplicate invoice for Gold of Sicily AS.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/delete-gos-duplicate-invoice.mjs
 *
 * Optional:
 *   ORG_NAME="Gold of Sicily AS" node scripts/delete-gos-duplicate-invoice.mjs
 *   DELETE_INVOICE_ID=<uuid> ORG_ID=<uuid> node scripts/delete-gos-duplicate-invoice.mjs
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_NAME = process.env.ORG_NAME ?? "Gold of Sicily AS";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function groupKey(inv) {
  return [
    inv.customer_name?.trim().toLowerCase() ?? "",
    String(inv.total ?? ""),
    inv.issue_date ?? "",
    inv.status ?? "",
  ].join("|");
}

async function main() {
  const orgIdArg = process.env.ORG_ID;
  const deleteIdArg = process.env.DELETE_INVOICE_ID;

  let orgId = orgIdArg;
  if (!orgId) {
    const { data: orgs, error } = await supabase
      .from("organizations")
      .select("id, name")
      .ilike("name", `%${ORG_NAME}%`);
    if (error) throw error;
    if (!orgs?.length) {
      console.error(`Fant ingen organisasjon med navn lik «${ORG_NAME}»`);
      process.exit(1);
    }
    if (orgs.length > 1) {
      console.log("Flere organisasjoner matchet:");
      for (const o of orgs) console.log(`  ${o.id}  ${o.name}`);
      console.error("Sett ORG_ID=<uuid> og kjør på nytt.");
      process.exit(1);
    }
    orgId = orgs[0].id;
    console.log(`Org: ${orgs[0].name} (${orgId})`);
  }

  const { data: invoices, error: invErr } = await supabase
    .from("invoices")
    .select("id, invoice_number, customer_name, total, status, issue_date, created_at, finance_entry_id")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true });
  if (invErr) throw invErr;

  console.log(`\nFakturaer (${invoices?.length ?? 0}):`);
  for (const inv of invoices ?? []) {
    console.log(
      `  ${inv.invoice_number ?? "(utkast)"}  ${inv.status}  ${inv.customer_name}  ${inv.total} kr  ${inv.id}`,
    );
  }

  if (deleteIdArg) {
    console.log(`\nSletter faktura ${deleteIdArg} ...`);
    const { data, error } = await supabase.rpc("admin_delete_invoice", {
      p_organization_id: orgId,
      p_invoice_id: deleteIdArg,
    });
    if (error) throw error;
    console.log("Slettet:", data);
    return;
  }

  const groups = new Map();
  for (const inv of invoices ?? []) {
    const key = groupKey(inv);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(inv);
  }

  const dupGroups = [...groups.values()].filter((g) => g.length > 1);
  if (!dupGroups.length) {
    console.log("\nIngen åpenbare duplikater (samme kunde + beløp + dato + status).");
    console.log("Sett DELETE_INVOICE_ID=<uuid> ORG_ID=<uuid> for å slette manuelt.");
    return;
  }

  for (const group of dupGroups) {
    console.log("\nDuplikat-gruppe:");
    for (const inv of group) {
      console.log(
        `  ${inv.invoice_number ?? "(utkast)"}  ${inv.status}  ${inv.created_at}  ${inv.id}`,
      );
    }

    const sorted = [...group].sort((a, b) => {
      const aNum = a.invoice_number ? 1 : 0;
      const bNum = b.invoice_number ? 1 : 0;
      if (aNum !== bNum) return bNum - aNum;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    const keep = sorted[0];
    const remove = sorted.slice(1);

    console.log(`Beholder: ${keep.invoice_number ?? keep.id}`);
    for (const inv of remove) {
      console.log(`Sletter duplikat: ${inv.invoice_number ?? inv.id} (${inv.id})`);
      const { data, error } = await supabase.rpc("admin_delete_invoice", {
        p_organization_id: orgId,
        p_invoice_id: inv.id,
      });
      if (error) throw error;
      console.log("  →", data);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
