import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar, MapPin, Heart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchEvent } from "@/lib/queries";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/events/$id")({
  component: EventDetail,
});

function EventDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: event, isLoading } = useQuery({
    queryKey: ["event", id],
    queryFn: () => fetchEvent(id),
  });

  const { data: wishlisted } = useQuery({
    queryKey: ["wishlisted", id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("wishlist")
        .select("event_id")
        .eq("event_id", id)
        .maybeSingle();
      return !!data;
    },
  });

  const toggleWishlist = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("auth");
      if (wishlisted) {
        await supabase.from("wishlist").delete().eq("event_id", id);
      } else {
        await supabase.from("wishlist").insert({ event_id: id, user_id: user.id });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wishlisted", id] }),
    onError: () => navigate({ to: "/auth" }),
  });

  if (isLoading) return <div className="mx-auto max-w-6xl px-4 py-12">Loading…</div>;
  if (!event) return <div className="mx-auto max-w-6xl px-4 py-12">Event not found.</div>;

  const upcoming = (
    (event as { shows?: Array<{ id: string; starts_at: string; base_price: number }> }).shows ?? []
  )
    .filter((s) => new Date(s.starts_at) > new Date())
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <div className="grid gap-8 md:grid-cols-[300px_1fr]">
        <div className="aspect-[3/4] overflow-hidden rounded-2xl border border-border/60 bg-card">
          {event.poster_url && (
            <img src={event.poster_url} alt={event.title} className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-primary">{event.category}</div>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{event.title}</h1>
          {event.venue && (
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" /> {event.venue.name} · {event.venue.city}
            </div>
          )}
          <p className="mt-4 text-muted-foreground">{event.description}</p>

          <div className="mt-6 flex gap-2">
            <Button variant="outline" onClick={() => toggleWishlist.mutate()}>
              <Heart className={wishlisted ? "fill-primary text-primary" : ""} />
              {wishlisted ? "Wishlisted" : "Add to wishlist"}
            </Button>
          </div>

          <div className="mt-10">
            <h2 className="text-lg font-semibold">Select a showtime</h2>
            {upcoming.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No upcoming shows.</p>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {upcoming.map((s) => (
                  <Link
                    key={s.id}
                    to="/shows/$id"
                    params={{ id: s.id }}
                    onClick={(e) => {
                      if (!user) {
                        e.preventDefault();
                        toast.error("Sign in to book");
                        navigate({ to: "/auth" });
                      }
                    }}
                    className="group flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Calendar className="h-4 w-4 text-primary" />
                        {format(new Date(s.starts_at), "EEE, dd MMM · h:mm a")}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        From ₹{Number(s.base_price).toFixed(0)}
                      </div>
                    </div>
                    <span className="text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      Select →
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
