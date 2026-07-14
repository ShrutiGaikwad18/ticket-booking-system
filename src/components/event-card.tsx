import { Link } from "@tanstack/react-router";
import { Calendar, MapPin } from "lucide-react";
import { format } from "date-fns";

type EventCardData = {
  id: string;
  title: string;
  category: string;
  poster_url: string | null;
  venue?: { name: string; city: string } | null;
  next_show?: { starts_at: string; base_price: number } | null;
};

const categoryLabel: Record<string, string> = {
  movie: "Movie",
  concert: "Concert",
  sports: "Sports",
  theatre: "Theatre",
};

export function EventCard({ event }: { event: EventCardData }) {
  return (
    <Link
      to="/events/$id"
      params={{ id: event.id }}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card transition-all hover:border-primary/60 hover:shadow-[0_20px_60px_-20px_oklch(0.68_0.19_250/0.45)]"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-muted">
        {event.poster_url ? (
          <img
            src={event.poster_url}
            alt={event.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-muted-foreground">No image</div>
        )}
        <div className="absolute inset-x-0 top-0 flex justify-between p-3">
          <span className="rounded-full bg-background/80 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider backdrop-blur">
            {categoryLabel[event.category] ?? event.category}
          </span>
          {event.next_show && (
            <span className="rounded-full bg-primary/90 px-2.5 py-1 text-[10px] font-semibold text-primary-foreground backdrop-blur">
              ₹{Number(event.next_show.base_price).toFixed(0)}+
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 font-semibold leading-tight">{event.title}</h3>
        <div className="mt-auto space-y-1 text-xs text-muted-foreground">
          {event.venue && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{event.venue.name} · {event.venue.city}</span>
            </div>
          )}
          {event.next_show && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3 shrink-0" />
              <span>{format(new Date(event.next_show.starts_at), "EEE, dd MMM · h:mm a")}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
