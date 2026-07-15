import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventCard } from "@/components/event-card";
import { fetchWishlist } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/wishlist")({
  component: Wishlist,
});

function Wishlist() {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["wishlist"],
    queryFn: fetchWishlist,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-3xl font-bold">Wishlist</h1>
      <p className="mt-1 text-sm text-muted-foreground">Events you've saved for later.</p>

      <div className="mt-8">
        {isLoading ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <Heart className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Your wishlist is empty.</p>
            <Button asChild className="mt-4">
              <Link to="/">Discover events</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {events.map((e) => {
              const next = (e.shows ?? [])
                .filter((s: { starts_at: string }) => new Date(s.starts_at) > new Date())
                .sort(
                  (a: { starts_at: string }, b: { starts_at: string }) =>
                    +new Date(a.starts_at) - +new Date(b.starts_at),
                )[0];
              return <EventCard key={e.id} event={{ ...e, next_show: next }} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
