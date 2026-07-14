import { supabase } from "@/integrations/supabase/client";

export type Category = "movie" | "concert" | "sports" | "theatre";

export async function fetchEvents(opts: { category?: Category; search?: string } = {}) {
  let q = supabase
    .from("events")
    .select("id, title, category, poster_url, description, venue:venues(name, city), shows(id, starts_at, base_price)")
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (opts.category) q = q.eq("category", opts.category);
  if (opts.search) q = q.ilike("title", `%${opts.search}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((e) => {
    const upcoming = (e.shows ?? [])
      .filter((s) => new Date(s.starts_at) > new Date())
      .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
    return { ...e, next_show: upcoming[0] ?? null };
  });
}

export async function fetchEvent(id: string) {
  const { data, error } = await supabase
    .from("events")
    .select("*, venue:venues(*), shows(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchShow(id: string) {
  const { data, error } = await supabase
    .from("shows")
    .select("*, event:events(*, venue:venues(*)), seats(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  data.seats.sort((a: { row_label: string; seat_number: number }, b: { row_label: string; seat_number: number }) =>
    a.row_label.localeCompare(b.row_label) || a.seat_number - b.seat_number,
  );
  return data;
}

export async function fetchMyBookings() {
  const { data, error } = await supabase
    .from("bookings")
    .select("*, show:shows(*, event:events(*, venue:venues(*))), booking_seats(seat:seats(*))")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchBooking(id: string) {
  const { data, error } = await supabase
    .from("bookings")
    .select("*, show:shows(*, event:events(*, venue:venues(*))), booking_seats(seat:seats(*))")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchWishlist() {
  const { data, error } = await supabase
    .from("wishlist")
    .select("event:events(id, title, category, poster_url, venue:venues(name, city), shows(id, starts_at, base_price))");
  if (error) throw error;
  return (data ?? []).map((w) => w.event).filter(Boolean);
}
