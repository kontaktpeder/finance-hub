import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Landmark } from "lucide-react";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/bank")({
  component: BankPage,
});

function BankPage() {
  const { orgId } = Route.useParams();
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Landmark className="h-6 w-6" /> Bank
        </h1>
        <p className="text-sm text-muted-foreground">
          Kople banken din via Neonomics. Importerte transaksjonar er ikkje bokført —
          du vel sjølv kva som skal bli til regnskapspost.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Open Banking kjem snart</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Datamodellen for bank-tilkoblingar, kontoar og transaksjonar er på plass.
            Neste steg er å kople på Neonomics sandbox når API-nøklane er klare.
          </p>
          <ul className="list-disc pl-5 text-muted-foreground space-y-1">
            <li>Sprint 1: koble bank → hent kontoar → list transaksjonar</li>
            <li>Sprint 2: «Bokfør» → opprett finance_entry</li>
            <li>Sprint 3: privat dashbord frå bank-transaksjonar</li>
          </ul>
          <div className="pt-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/orgs/$orgId" params={{ orgId }}>Tilbake til dashbord</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
