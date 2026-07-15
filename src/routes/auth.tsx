import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Ticket, ShieldCheck, Store, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { cn, getRoleLabel } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [{ title: "Sign in — TicketBooking" }],
  }),
});

type SignupRole = "customer" | "organizer";

const roleOptions: { id: SignupRole; label: string; desc: string; icon: typeof UserIcon }[] = [
  { id: "customer", label: "Customer", desc: "Browse and book tickets", icon: UserIcon },
  {
    id: "organizer",
    label: "Host",
    desc: "Create events, manage venues, and welcome customers",
    icon: Store,
  },
];

function redirectByRoles(roles: string[]): "/admin" | "/organizer" | "/" {
  if (roles.includes("admin")) return "/admin";
  if (roles.includes("organizer")) return "/organizer";
  return "/";
}

async function fetchRolesForUser(userId: string): Promise<string[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r) => r.role as string);
}

function AuthPage() {
  const navigate = useNavigate();
  const { user, roles, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<SignupRole>("customer");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: redirectByRoles(roles) });
  }, [user, roles, loading, navigate]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    const r = data.user ? await fetchRolesForUser(data.user.id) : [];
    setBusy(false);
    toast.success("Welcome back");
    navigate({ to: redirectByRoles(r) });
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, requested_role: role },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    // Fallback: ensure role row exists in case trigger did not fire
    if (data.user) {
      await supabase
        .from("user_roles")
        .insert({ user_id: data.user.id, role })
        .then(
          () => {},
          () => {},
        );
    }
    const r = data.user ? await fetchRolesForUser(data.user.id) : [role];
    setBusy(false);
    toast.success(`Account created as ${getRoleLabel(role)}`);
    navigate({ to: redirectByRoles(r.length ? r : [role]) });
  };

  const google = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) toast.error(error.message);
  };

  return (
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-md place-items-center px-4 py-10">
      <div className="w-full rounded-3xl border border-border/60 bg-card p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground glow">
            <Ticket className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-bold">Welcome to TicketBooking</h1>
          <p className="text-sm text-muted-foreground">
            Role-based access · Customer · Host · Admin
          </p>
        </div>

        <Button variant="outline" className="w-full" onClick={google}>
          Continue with Google
        </Button>
        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
        </div>

        <Tabs defaultValue="signin">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>
          <TabsContent value="signin">
            <form onSubmit={signIn} className="space-y-3 pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="e1">Email</Label>
                <Input
                  id="e1"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p1">Password</Label>
                <Input
                  id="p1"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button className="w-full" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                You'll be routed to the dashboard for your role.
              </p>
            </form>
          </TabsContent>
          <TabsContent value="signup">
            <form onSubmit={signUp} className="space-y-3 pt-4">
              <div className="space-y-1.5">
                <Label>Choose your role</Label>
                <div className="grid grid-cols-2 gap-2">
                  {roleOptions.map((opt) => {
                    const Icon = opt.icon;
                    const active = role === opt.id;
                    return (
                      <button
                        type="button"
                        key={opt.id}
                        onClick={() => setRole(opt.id)}
                        className={cn(
                          "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors",
                          active
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/60",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4",
                            active ? "text-primary" : "text-muted-foreground",
                          )}
                        />
                        <div className="text-sm font-medium">{opt.label}</div>
                        <div className="text-[11px] text-muted-foreground">{opt.desc}</div>
                      </button>
                    );
                  })}
                </div>
                <p className="flex items-center gap-1 pt-1 text-[11px] text-muted-foreground">
                  <ShieldCheck className="h-3 w-3" /> Admin role is assigned by existing admins
                  only.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="n2">Full name</Label>
                <Input id="n2" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e2">Email</Label>
                <Input
                  id="e2"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p2">Password</Label>
                <Input
                  id="p2"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button className="w-full" disabled={busy}>
                {busy ? "Creating…" : `Create ${getRoleLabel(role)} account`}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
