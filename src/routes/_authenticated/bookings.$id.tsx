import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { format } from "date-fns";
import { ArrowLeft, Calendar, MapPin, Ticket } from "lucide-react";
import { fetchBooking } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/bookings/$id")({
  component: BookingTicket,
});

function BookingTicket() {
  const { id } = Route.useParams();
  const { data: b, isLoading } = useQuery({
    queryKey: ["booking", id],
    queryFn: () => fetchBooking(id),
  });

  if (isLoading) return <div className="mx-auto max-w-2xl px-4 py-12">Loading…</div>;
  if (!b) return <div className="mx-auto max-w-2xl px-4 py-12">Ticket not found.</div>;
  const ev = b.show?.event;
  const seats = b.booking_seats.map((bs: { seat: { row_label: string; seat_number: number; section: string } }) => bs.seat);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/bookings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to bookings
      </Link>

      <div className="mt-4 overflow-hidden rounded-3xl border border-border/60 bg-card">
        <div className="bg-[image:var(--gradient-hero)] p-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary">
            <Ticket className="h-4 w-4" /> TicketBooking Ticket
          </div>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{ev?.title}</h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {b.show && <span className="flex items-center gap-1"><Calendar className="h-4 w-4" />{format(new Date(b.show.starts_at), "EEE, dd MMM yyyy · h:mm a")}</span>}
            {ev?.venue && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{ev.venue.name}, {ev.venue.city}</span>}
          </div>
        </div>

        <div className="grid gap-6 border-t border-dashed border-border p-6 sm:grid-cols-[1fr_auto]">
          <div className="space-y-3 text-sm">
            <Row label="Booking ID" value={b.id.slice(0, 8).toUpperCase()} mono />
            <Row label="Seats" value={seats.map((s: { row_label: string; seat_number: number }) => `${s.row_label}${s.seat_number}`).join(", ")} mono />
            <Row label="Section" value={Array.from(new Set(seats.map((s: { section: string }) => s.section))).join(" + ")} />
            <Row label="Total paid" value={`₹${Number(b.total).toFixed(0)}`} />
            <Row label="Status" value={b.status} />
          </div>
          <div className="justify-self-center rounded-2xl bg-white p-3">
            <QRCodeSVG value={b.qr_code} size={140} level="H" />
          </div>
        </div>

        <div className="border-t border-dashed border-border bg-background/40 px-6 py-4 text-center text-xs font-mono text-muted-foreground">
          {b.qr_code}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono" : ""}>{value}</span>
    </div>
  );
}
