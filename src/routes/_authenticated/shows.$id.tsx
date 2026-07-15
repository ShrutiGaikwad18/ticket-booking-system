import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { format, differenceInSeconds } from "date-fns";
import { Clock, Calendar, MapPin, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn, randomUUID } from "@/lib/utils";
import { fetchShow } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/shows/$id")({
  component: ShowSeats,
});

type Seat = {
  id: string;
  section: "premium" | "standard";
  row_label: string;
  seat_number: number;
  price: number;
  status: "available" | "held" | "booked";
  held_by: string | null;
  held_until: string | null;
};

function ShowSeats() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [holdExpiresAt, setHoldExpiresAt] = useState<Date | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const releaseRef = useRef<string[]>([]);

  const {
    data: show,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["show", id],
    queryFn: () => fetchShow(id),
    refetchInterval: 15000,
  });

  const seats = useMemo<Seat[]>(() => show?.seats ?? [], [show?.seats]);

  // Waitlist check
  const soldOutBySection = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const sec of ["premium", "standard"] as const) {
      const inSec = seats.filter((s) => s.section === sec);
      out[sec] = inSec.length > 0 && inSec.every((s) => s.status !== "available");
    }
    return out;
  }, [seats]);

  // Countdown timer
  useEffect(() => {
    if (!holdExpiresAt) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [holdExpiresAt]);

  useEffect(() => {
    if (holdExpiresAt && holdExpiresAt <= now) {
      toast.warning("Your seat hold expired");
      setHoldExpiresAt(null);
      setSelected(new Set());
      releaseRef.current = [];
      refetch();
    }
  }, [now, holdExpiresAt, refetch]);

  // Release on unmount if not booked
  useEffect(() => {
    return () => {
      if (releaseRef.current.length) {
        supabase.rpc("release_seats", { _seat_ids: releaseRef.current });
      }
    };
  }, []);

  const holdMutation = useMutation({
    mutationFn: async (seatIds: string[]) => {
      const { data, error } = await supabase.rpc("hold_seats", {
        _seat_ids: seatIds,
        _minutes: 10,
      });
      if (error) throw error;
      return data as Array<{ seat_id: string; ok: boolean }>;
    },
    onSuccess: (rows) => {
      const failed = rows.filter((r) => !r.ok);
      if (failed.length) {
        toast.error(`${failed.length} seat(s) unavailable — please choose again`);
        qc.invalidateQueries({ queryKey: ["show", id] });
        setSelected(new Set());
        releaseRef.current = [];
        setHoldExpiresAt(null);
        return;
      }
      releaseRef.current = rows.map((r) => r.seat_id);
      setHoldExpiresAt(new Date(Date.now() + 10 * 60 * 1000));
      qc.invalidateQueries({ queryKey: ["show", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      const qr = `TICKETBOOKING-${randomUUID()}`;
      const { data, error } = await supabase.rpc("confirm_booking", {
        _seat_ids: ids,
        _show_id: id,
        _qr: qr,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (bookingId) => {
      releaseRef.current = [];
      toast.success("Booking confirmed!");
      navigate({ to: "/bookings/$id", params: { id: bookingId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const joinWaitlist = useMutation({
    mutationFn: async (section: "premium" | "standard") => {
      if (!user) throw new Error("auth");
      await supabase.from("waitlist").insert({ show_id: id, section, user_id: user.id });
    },
    onSuccess: () => toast.success("Added to waitlist — we'll notify you"),
    onError: (e: Error) => {
      if (e.message.includes("duplicate")) toast.info("You're already on this waitlist");
      else toast.error(e.message);
    },
  });

  const toggleSeat = (seat: Seat) => {
    if (holdExpiresAt) return;
    if (seat.status !== "available") return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(seat.id)) next.delete(seat.id);
      else next.add(seat.id);
      return next;
    });
  };

  const total = seats
    .filter((s) => selected.has(s.id))
    .reduce((sum, s) => sum + Number(s.price), 0);
  const secondsLeft = holdExpiresAt ? Math.max(0, differenceInSeconds(holdExpiresAt, now)) : 0;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  if (isLoading) return <div className="mx-auto max-w-5xl px-4 py-12">Loading seat map…</div>;
  if (!show) return <div className="mx-auto max-w-5xl px-4 py-12">Show not found.</div>;

  const grouped = seats.reduce<Record<string, Seat[]>>((acc, s) => {
    (acc[s.row_label] ??= []).push(s);
    return acc;
  }, {});
  const rows = Object.keys(grouped).sort();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link
        to="/events/$id"
        params={{ id: show.event.id }}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to event
      </Link>

      <header className="mt-4 flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold sm:text-2xl">{show.event.title}</h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {format(new Date(show.starts_at), "EEE, dd MMM · h:mm a")}
            </span>
            {show.event.venue && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {show.event.venue.name}
              </span>
            )}
          </div>
        </div>
        {holdExpiresAt && (
          <div className="flex items-center gap-2 rounded-full bg-[color:var(--color-warning)]/15 px-4 py-2 text-sm font-mono text-[color:var(--color-warning)]">
            <Clock className="h-4 w-4" /> Hold expires in {mm}:{ss}
          </div>
        )}
      </header>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <div className="mx-auto mb-6 h-1.5 max-w-md rounded-full bg-primary/40" />
          <div className="mb-6 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
            Screen / Stage
          </div>

          {(["premium", "standard"] as const).map((section) => {
            const sectionRows = rows.filter((r) => grouped[r][0].section === section);
            if (!sectionRows.length) return null;
            return (
              <div key={section} className="mb-6">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {section} · ₹{Number(grouped[sectionRows[0]][0].price).toFixed(0)}
                  </div>
                  {soldOutBySection[section] && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => joinWaitlist.mutate(section)}
                    >
                      Join waitlist
                    </Button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {sectionRows.map((row) => (
                    <div key={row} className="flex items-center justify-center gap-1.5">
                      <div className="w-4 text-[10px] font-mono text-muted-foreground">{row}</div>
                      <div className="flex flex-wrap justify-center gap-1.5">
                        {grouped[row].map((seat) => {
                          const isSel = selected.has(seat.id);
                          const isMine = seat.held_by === user?.id;
                          const color =
                            seat.status === "booked"
                              ? "bg-[color:var(--color-seat-booked)]/60 cursor-not-allowed"
                              : seat.status === "held" && !isMine
                                ? "bg-[color:var(--color-seat-held)]/60 cursor-not-allowed"
                                : isSel
                                  ? "bg-primary text-primary-foreground ring-2 ring-primary"
                                  : "bg-[color:var(--color-seat-available)]/25 hover:bg-[color:var(--color-seat-available)]/50 text-foreground";
                          return (
                            <button
                              key={seat.id}
                              disabled={seat.status !== "available" && !isSel}
                              onClick={() => toggleSeat(seat)}
                              className={cn(
                                "h-7 w-7 rounded-md text-[10px] font-mono transition-colors",
                                color,
                              )}
                              title={`${row}${seat.seat_number} — ₹${seat.price}`}
                            >
                              {seat.seat_number}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-[color:var(--color-seat-available)]/50" />{" "}
              Available
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-[color:var(--color-seat-held)]/60" /> Held
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-[color:var(--color-seat-booked)]/60" /> Booked
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-primary" /> Selected
            </span>
          </div>
        </div>

        <aside className="h-fit rounded-2xl border border-border/60 bg-card p-5 md:sticky md:top-20">
          <h2 className="font-semibold">Order summary</h2>
          <div className="mt-3 text-sm text-muted-foreground">
            {selected.size === 0
              ? "No seats selected"
              : `${selected.size} seat${selected.size > 1 ? "s" : ""}`}
          </div>
          <div className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs font-mono">
            {seats
              .filter((s) => selected.has(s.id))
              .map((s) => (
                <div key={s.id} className="flex justify-between">
                  <span>
                    {s.row_label}
                    {s.seat_number} <span className="text-muted-foreground">· {s.section}</span>
                  </span>
                  <span>₹{Number(s.price).toFixed(0)}</span>
                </div>
              ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-bold text-lg">₹{total.toFixed(0)}</span>
          </div>
          {!holdExpiresAt ? (
            <Button
              className="mt-4 w-full"
              disabled={selected.size === 0 || holdMutation.isPending}
              onClick={() => holdMutation.mutate(Array.from(selected))}
            >
              {holdMutation.isPending ? "Holding…" : "Hold seats (10 min)"}
            </Button>
          ) : (
            <Button
              className="mt-4 w-full"
              disabled={confirmMutation.isPending}
              onClick={() => confirmMutation.mutate()}
            >
              {confirmMutation.isPending ? "Confirming…" : "Confirm & Pay"}
            </Button>
          )}
          {holdExpiresAt && (
            <button
              onClick={async () => {
                await supabase.rpc("release_seats", { _seat_ids: Array.from(selected) });
                releaseRef.current = [];
                setHoldExpiresAt(null);
                setSelected(new Set());
                qc.invalidateQueries({ queryKey: ["show", id] });
              }}
              className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground"
            >
              Release hold
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
