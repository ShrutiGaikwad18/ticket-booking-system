import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar, MapPin, Ticket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchMyBookings } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/bookings")({
  component: Bookings,
});

function Bookings() {
  const qc = useQueryClient();
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["my-bookings"],
    queryFn: fetchMyBookings,
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("cancel_booking", { _booking_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Booking cancelled");
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold">My Bookings</h1>
      <p className="mt-1 text-sm text-muted-foreground">All your tickets in one place.</p>

      <div className="mt-8 space-y-4">
        {isLoading ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : bookings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <Ticket className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">No bookings yet.</p>
            <Button asChild className="mt-4">
              <Link to="/">Browse events</Link>
            </Button>
          </div>
        ) : (
          bookings.map((b) => {
            const ev = b.show?.event;
            return (
              <div key={b.id} className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 sm:flex sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider">
                      <span
                        className={`rounded-full px-2 py-0.5 ${b.status === "confirmed" ? "bg-[color:var(--color-success)]/20 text-[color:var(--color-success)]" : "bg-[color:var(--color-destructive)]/20 text-[color:var(--color-destructive)]"}`}
                      >
                        {b.status}
                      </span>
                      <span className="text-muted-foreground">
                        Booked {format(new Date(b.created_at), "dd MMM yyyy")}
                      </span>
                    </div>
                    <h3 className="mt-2 truncate text-lg font-semibold">{ev?.title}</h3>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {b.show && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(b.show.starts_at), "EEE, dd MMM · h:mm a")}
                        </span>
                      )}
                      {ev?.venue && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {ev.venue.name}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Seats:{" "}
                      {b.booking_seats
                        .map(
                          (bs: { seat: { row_label: string; seat_number: number } }) =>
                            `${bs.seat.row_label}${bs.seat.seat_number}`,
                        )
                        .join(", ")}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="text-lg font-bold">₹{Number(b.total).toFixed(0)}</div>
                    <div className="flex gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/bookings/$id" params={{ id: b.id }}>
                          View ticket
                        </Link>
                      </Button>
                      {b.status === "confirmed" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("Cancel this booking?")) cancel.mutate(b.id);
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
