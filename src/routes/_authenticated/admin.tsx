import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Shield, Users, CalendarDays, Ticket as TicketIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getRoleLabel } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminDashboard,
});

type Role = "admin" | "organizer" | "customer";
type UserWithRole = { id: string; email: string; full_name: string | null; role: Role };

function AdminDashboard() {
  const { user, roles, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && user && !roles.includes("admin")) {
      toast.error("Admin access required");
      navigate({ to: "/" });
    }
  }, [user, roles, loading, navigate]);

  const { data: profiles = [], isLoading: pLoading } = useQuery({
    queryKey: ["admin-profiles"],
    enabled: roles.includes("admin"),
    queryFn: async () => {
      const { data: profs, error } = await supabase.from("profiles").select("id, email, full_name").order("created_at", { ascending: false });
      if (error) throw error;
      const { data: rs } = await supabase.from("user_roles").select("user_id, role");
      const roleMap = new Map<string, Role>();
      (rs ?? []).forEach((r) => roleMap.set(r.user_id, r.role as Role));
      return (profs ?? []).map((p) => ({ ...p, role: roleMap.get(p.id) ?? "customer" })) as UserWithRole[];
    },
  });

  const { data: allEvents = [] } = useQuery({
    queryKey: ["admin-events"],
    enabled: roles.includes("admin"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, title, status, category, venue:venues(name, city)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: bookingCount = 0 } = useQuery({
    queryKey: ["admin-booking-count"],
    enabled: roles.includes("admin"),
    queryFn: async () => {
      const { count } = await supabase.from("bookings").select("id", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Role }) => {
      const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (delErr) throw delErr;
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Role updated"); qc.invalidateQueries({ queryKey: ["admin-profiles"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteEvent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Event deleted"); qc.invalidateQueries({ queryKey: ["admin-events"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const next = status === "published" ? "draft" : "published";
      const { error } = await supabase.from("events").update({ status: next }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status updated"); qc.invalidateQueries({ queryKey: ["admin-events"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!roles.includes("admin")) {
    return <div className="mx-auto max-w-6xl px-4 py-10 text-muted-foreground">Checking permissions…</div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/20 text-primary"><Shield className="h-5 w-5" /></div>
        <div>
          <div className="text-xs uppercase tracking-wider text-primary">Admin</div>
          <h1 className="text-3xl font-bold">Control panel</h1>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat icon={Users} label="Users" value={profiles.length} />
        <Stat icon={CalendarDays} label="Events" value={allEvents.length} />
        <Stat icon={TicketIcon} label="Bookings" value={bookingCount} />
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Users & roles</h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-4 py-2 text-left">Name</th><th className="px-4 py-2 text-left">Email</th><th className="px-4 py-2 text-left">Role</th></tr>
            </thead>
            <tbody>
              {pLoading ? (
                <tr><td colSpan={3} className="px-4 py-6"><Loader2 className="h-4 w-4 animate-spin" /></td></tr>
              ) : profiles.map((p) => (
                <tr key={p.id} className="border-t border-border/60">
                  <td className="px-4 py-3">{p.full_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.email}</td>
                  <td className="px-4 py-3">
                    <Select value={p.role} onValueChange={(v) => setRole.mutate({ userId: p.id, role: v as Role })}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="customer">Customer</SelectItem>
                        <SelectItem value="organizer">Host</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">All events</h2>
        <div className="mt-3 grid gap-3">
          {allEvents.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{e.category} · {e.status}</div>
                <div className="font-medium">{e.title}</div>
                <div className="text-xs text-muted-foreground">{e.venue?.name ?? "—"} · {e.venue?.city ?? ""}</div>
              </div>
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline"><Link to="/events/$id" params={{ id: e.id }}>View</Link></Button>
                <Button size="sm" variant="ghost" onClick={() => togglePublish.mutate({ id: e.id, status: e.status })}>
                  {e.status === "published" ? "Unpublish" : "Publish"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this event?")) deleteEvent.mutate(e.id); }}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
    </div>
  );
}
