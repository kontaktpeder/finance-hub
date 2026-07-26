import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  inviteOrganizationMember,
  listOrganizationMembers,
} from "@/lib/members.functions";

export const Route = createFileRoute("/_authenticated/orgs/$orgId/members")({
  component: MembersPage,
});

function MembersPage() {
  const { orgId } = Route.useParams();
  const qc = useQueryClient();
  const listFn = useServerFn(listOrganizationMembers);
  const inviteFn = useServerFn(inviteOrganizationMember);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "editor">("editor");

  const membersQ = useQuery({
    queryKey: ["members", orgId],
    queryFn: () => listFn({ data: { organizationId: orgId } }),
  });

  const inviteMut = useMutation({
    mutationFn: () =>
      inviteFn({
        data: { organizationId: orgId, email: email.trim(), role },
      }),
    onSuccess: (res) => {
      setEmail("");
      qc.invalidateQueries({ queryKey: ["members", orgId] });
      if (res.alreadyMember) toast.message("Brukeren er allerede medlem");
      else if (res.invited) toast.success("Invitasjon sendt på e-post");
      else toast.success("Medlem lagt til");
    },
    onError: (e: Error) => toast.error(e.message ?? "Kunne ikke invitere"),
  });

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Medlemmer</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Personer med tilgang til denne organisasjonen.
        </p>
      </header>

      {membersQ.data?.canInvite && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inviter via e-post</CardTitle>
            <CardDescription>
              Sender invitasjon hvis brukeren er ny, eller legger til eksisterende
              brukere direkte.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">E-post</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="navn@firma.no"
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rolle</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "admin" | "editor")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              disabled={!email.trim() || inviteMut.isPending}
              onClick={() => inviteMut.mutate()}
            >
              {inviteMut.isPending ? "Sender…" : "Inviter"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aktive medlemmer</CardTitle>
          <CardDescription>
            {membersQ.isLoading ? "Laster…" : `${membersQ.data?.members.length ?? 0} medlemmer`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {membersQ.data?.members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between border rounded-md px-3 py-2 gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm truncate">{m.email ?? "Ukjent e-post"}</p>
                  <p className="tabular text-xs text-muted-foreground truncate">{m.userId}</p>
                </div>
                <Badge variant={m.role === "owner" ? "default" : "secondary"}>{m.role}</Badge>
              </div>
            ))}
            {!membersQ.isLoading && (membersQ.data?.members.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">Ingen medlemmer ennå.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
