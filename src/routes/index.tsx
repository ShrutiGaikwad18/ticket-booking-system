import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { EventCard } from "@/components/event-card";
import { Input } from "@/components/ui/input";
import { fetchEvents, type Category } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Home,
});

const categories: { id: Category | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "movie", label: "Movies" },
  { id: "concert", label: "Concerts" },
  { id: "theatre", label: "Theatre" },
  { id: "sports", label: "Sports" },
];

function Home() {
  const [category, setCategory] = useState<Category | "all">("all");
  const [search, setSearch] = useState("");
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["events", category, search],
    queryFn: () =>
      fetchEvents({
        category: category === "all" ? undefined : category,
        search: search || undefined,
      }),
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-[image:var(--gradient-hero)] px-6 py-14 sm:px-12 sm:py-20">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3 w-3" /> New shows every week
          </div>
          <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-6xl">
            Book seats to <span className="text-primary">unforgettable</span> nights.
          </h1>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            Movies, concerts, theatre and sports — pick your seats, hold them for ten minutes, and
            get an instant QR ticket.
          </p>
        </div>
      </section>

      <section className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm transition-colors",
                category === c.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search events…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </section>

      <section className="mt-8">
        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-card" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-20 text-center text-muted-foreground">
            No events found.
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {events.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
