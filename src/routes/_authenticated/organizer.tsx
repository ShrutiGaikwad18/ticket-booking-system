import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { Plus, Calendar, MapPin, Loader2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/organizer")({
  component: HostDashboard,
});

type Venue = { id: string; name: string; city: string };
type ShowRow = { id: string; starts_at: string; ends_at?: string | null; base_price: number };
type EventRow = {
  id: string;
  title: string;
  category: string;
  status: string;
  description: string | null;
  poster_url: string | null;
  venue: { name: string; city: string } | null;
  shows: ShowRow[];
};

function HostDashboard() {
  const { user, roles, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && user && !roles.includes("organizer") && !roles.includes("admin")) {
      toast.error("Host access required");
      navigate({ to: "/" });
    }
  }, [user, roles, loading, navigate]);

  const { data: venues = [] } = useQuery({
    queryKey: ["venues"],
    queryFn: async () => {
      const { data, error } = await supabase.from("venues").select("id, name, city").order("name");
      if (error) throw error;
      return data as Venue[];
    },
  });

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["organizer-events", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select(
          "id, title, category, status, description, poster_url, venue:venues(name, city), shows(id, starts_at, ends_at, base_price)",
        )
        .eq("organizer_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as EventRow[];
    },
  });

  const { data: bookingCount = 0 } = useQuery({
    queryKey: ["organizer-booking-count", user?.id],
    enabled: !!user && events.length > 0,
    queryFn: async () => {
      const showIds = events.flatMap((e) => e.shows.map((s) => s.id));
      if (showIds.length === 0) return 0;
      const { count } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .in("show_id", showIds)
        .eq("status", "confirmed");
      return count ?? 0;
    },
  });

  const totalRevenue = useMemo(() => 0, []); // placeholder-safe (kept simple)

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-primary">Host</div>
          <h1 className="mt-1 text-3xl font-bold">Your events</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create events, add showtimes, and welcome customers.
          </p>
        </div>
        <NewEventDialog
          venues={venues}
          onCreated={() => qc.invalidateQueries({ queryKey: ["organizer-events"] })}
        />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Events" value={events.length} />
        <StatCard label="Shows" value={events.reduce((n, e) => n + e.shows.length, 0)} />
        <StatCard label="Confirmed bookings" value={bookingCount} />
      </div>

      <div className="mt-8 space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <Store className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              No events yet. Create your first one.
            </p>
          </div>
        ) : (
          events.map((e) => <EventRowCard key={e.id} event={e} venues={venues} />)
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function EventRowCard({ event, venues }: { event: EventRow; venues: Venue[] }) {
  const qc = useQueryClient();
  const [showOpen, setShowOpen] = useState(false);
  const [showDate, setShowDate] = useState("");
  const [showTime, setShowTime] = useState("");
  const [showEndTime, setShowEndTime] = useState("");
  const [basePrice, setBasePrice] = useState("500");
  const [totalSeats, setTotalSeats] = useState("60");

  const togglePublish = useMutation({
    mutationFn: async () => {
      const next = event.status === "published" ? "draft" : "published";
      const { error } = await supabase.from("events").update({ status: next }).eq("id", event.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["organizer-events"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteEvent = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("events").delete().eq("id", event.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event deleted");
      qc.invalidateQueries({ queryKey: ["organizer-events"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addShow = useMutation({
    mutationFn: async () => {
      const startsAt = new Date(`${showDate}T${showTime}`);
      const endsAt = new Date(`${showDate}T${showEndTime}`);
      if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime()))
        throw new Error("Invalid date/time");
      if (endsAt <= startsAt) throw new Error("End time must be later than start time");
      const price = Number(basePrice);
      const seatCount = Math.max(1, Math.min(200, Number(totalSeats)));

      const { data: show, error } = await supabase
        .from("shows")
        .insert({
          event_id: event.id,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          base_price: price,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Generate simple seat grid (rows A-?, 10 per row)
      const perRow = 10;
      const rows = Math.ceil(seatCount / perRow);
      type SeatInsert = {
        show_id: string;
        row_label: string;
        seat_number: number;
        section: "premium" | "standard";
        price: number;
      };
      const seats: SeatInsert[] = [];
      let created = 0;
      for (let r = 0; r < rows; r++) {
        const label = String.fromCharCode(65 + r);
        for (let n = 1; n <= perRow && created < seatCount; n++, created++) {
          const isPremium = r < Math.max(1, Math.floor(rows / 3));
          seats.push({
            show_id: show.id,
            row_label: label,
            seat_number: n,
            section: isPremium ? "premium" : "standard",
            price: isPremium ? price * 1.5 : price,
          });
        }
      }
      const { error: seatErr } = await supabase.from("seats").insert(seats);
      if (seatErr) throw seatErr;
    },
    onSuccess: () => {
      toast.success("Show added");
      setShowOpen(false);
      qc.invalidateQueries({ queryKey: ["organizer-events"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const venueName = event.venue
    ? `${event.venue.name} · ${event.venue.city}`
    : (venues.find(() => false)?.name ?? "—");

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider">
            <span
              className={`rounded-full px-2 py-0.5 ${event.status === "published" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}
            >
              {event.status}
            </span>
            <span className="text-muted-foreground">{event.category}</span>
          </div>
          <h3 className="mt-2 text-lg font-semibold">{event.title}</h3>
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" /> {venueName}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/events/$id" params={{ id: event.id }}>
              View public page
            </Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => togglePublish.mutate()}>
            {event.status === "published" ? "Unpublish" : "Publish"}
          </Button>
          <Dialog open={showOpen} onOpenChange={setShowOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4" /> Add show
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a showtime</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={showDate}
                      onChange={(e) => setShowDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Start time</Label>
                    <Input
                      type="time"
                      value={showTime}
                      onChange={(e) => setShowTime(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>End time</Label>
                    <Input
                      type="time"
                      value={showEndTime}
                      onChange={(e) => setShowEndTime(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Base price (₹)</Label>
                    <Input
                      type="number"
                      min="1"
                      value={basePrice}
                      onChange={(e) => setBasePrice(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Total seats</Label>
                    <Input
                      type="number"
                      min="1"
                      max="200"
                      value={totalSeats}
                      onChange={(e) => setTotalSeats(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => addShow.mutate()} disabled={addShow.isPending}>
                  {addShow.isPending ? "Adding…" : "Add show"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (confirm("Delete this event?")) deleteEvent.mutate();
            }}
          >
            Delete
          </Button>
        </div>
      </div>

      {event.shows.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {event.shows.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-xl border border-border bg-background/40 p-3 text-sm"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />{" "}
                  {format(new Date(s.starts_at), "EEE, dd MMM · h:mm a")}
                </div>
                {s.ends_at ? (
                  <div className="text-xs text-muted-foreground">
                    Ends {format(new Date(s.ends_at), "h:mm a")}
                  </div>
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground">
                From ₹{Number(s.base_price).toFixed(0)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewEventDialog({ venues, onCreated }: { venues: Venue[]; onCreated: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<"movie" | "concert" | "theatre" | "sports">("movie");
  const [description, setDescription] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
  const [venueId, setVenueId] = useState<string>("");
  const [newVenueName, setNewVenueName] = useState("");
  const [newVenueCity, setNewVenueCity] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      let vId = venueId;
      if (!vId) {
        if (!newVenueName || !newVenueCity) throw new Error("Pick or create a venue");
        const { data: v, error: vErr } = await supabase
          .from("venues")
          .insert({ name: newVenueName, city: newVenueCity })
          .select("id")
          .single();
        if (vErr) throw vErr;
        vId = v.id;
      }
      const { error } = await supabase.from("events").insert({
        title,
        category,
        description,
        poster_url: posterUrl || null,
        venue_id: vId,
        organizer_id: user.id,
        status: "draft",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event created (draft). Add a show, then publish.");
      setOpen(false);
      setTitle("");
      setDescription("");
      setPosterUrl("");
      setVenueId("");
      setNewVenueName("");
      setNewVenueCity("");
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> New event
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create event</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="movie">Movie</SelectItem>
                  <SelectItem value="concert">Concert</SelectItem>
                  <SelectItem value="theatre">Theatre</SelectItem>
                  <SelectItem value="sports">Sports</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Venue</Label>
              <Select value={venueId} onValueChange={setVenueId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick venue" />
                </SelectTrigger>
                <SelectContent>
                  {venues.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} · {v.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {!venueId && (
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-dashed border-border p-3">
              <div className="col-span-2 text-xs text-muted-foreground">Or create a new venue:</div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={newVenueName} onChange={(e) => setNewVenueName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input value={newVenueCity} onChange={(e) => setNewVenueCity(e.target.value)} />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Poster URL (optional)</Label>
            <Input
              value={posterUrl}
              onChange={(e) => setPosterUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !title}>
            {create.isPending ? "Creating…" : "Create event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
