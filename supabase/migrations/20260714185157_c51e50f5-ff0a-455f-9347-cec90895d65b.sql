
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'organizer', 'customer');
CREATE TYPE public.event_category AS ENUM ('movie', 'concert', 'sports', 'theatre');
CREATE TYPE public.event_status AS ENUM ('draft', 'published', 'cancelled');
CREATE TYPE public.seat_section AS ENUM ('premium', 'standard');
CREATE TYPE public.seat_status AS ENUM ('available', 'held', 'booked');
CREATE TYPE public.booking_status AS ENUM ('confirmed', 'cancelled');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles self read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Profiles self update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Profiles self insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- Admin policies (after has_role exists)
CREATE POLICY "Admins view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Auto-create profile + default customer role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'customer') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ VENUES ============
CREATE TABLE public.venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.venues TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.venues TO authenticated;
GRANT ALL ON public.venues TO service_role;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Venues public read" ON public.venues FOR SELECT USING (true);
CREATE POLICY "Organizers manage venues" ON public.venues FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'organizer') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'organizer') OR public.has_role(auth.uid(), 'admin'));

-- ============ EVENTS ============
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  category event_category NOT NULL,
  poster_url TEXT,
  organizer_id UUID REFERENCES auth.users(id),
  venue_id UUID REFERENCES public.venues(id),
  status event_status NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.events TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Events public read" ON public.events FOR SELECT USING (status = 'published' OR auth.uid() = organizer_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Organizers create events" ON public.events FOR INSERT TO authenticated WITH CHECK (auth.uid() = organizer_id AND (public.has_role(auth.uid(), 'organizer') OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "Organizers update own events" ON public.events FOR UPDATE TO authenticated USING (auth.uid() = organizer_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Organizers delete own events" ON public.events FOR DELETE TO authenticated USING (auth.uid() = organizer_id OR public.has_role(auth.uid(), 'admin'));

-- ============ SHOWS ============
CREATE TABLE public.shows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  base_price NUMERIC(10,2) NOT NULL DEFAULT 0
);
CREATE INDEX ON public.shows(event_id);
GRANT SELECT ON public.shows TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.shows TO authenticated;
GRANT ALL ON public.shows TO service_role;
ALTER TABLE public.shows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shows public read" ON public.shows FOR SELECT USING (true);
CREATE POLICY "Organizers manage own shows" ON public.shows FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND (e.organizer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND (e.organizer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- ============ SEATS ============
CREATE TABLE public.seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES public.shows(id) ON DELETE CASCADE,
  section seat_section NOT NULL,
  row_label TEXT NOT NULL,
  seat_number INT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  status seat_status NOT NULL DEFAULT 'available',
  held_by UUID REFERENCES auth.users(id),
  held_until TIMESTAMPTZ,
  UNIQUE (show_id, row_label, seat_number)
);
CREATE INDEX ON public.seats(show_id, status);
GRANT SELECT ON public.seats TO anon, authenticated;
GRANT UPDATE ON public.seats TO authenticated;
GRANT ALL ON public.seats TO service_role;
ALTER TABLE public.seats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Seats public read" ON public.seats FOR SELECT USING (true);
CREATE POLICY "Organizers manage seats" ON public.seats FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.shows s JOIN public.events e ON e.id = s.event_id WHERE s.id = show_id AND (e.organizer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.shows s JOIN public.events e ON e.id = s.event_id WHERE s.id = show_id AND (e.organizer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- ============ BOOKINGS ============
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  show_id UUID NOT NULL REFERENCES public.shows(id),
  total NUMERIC(10,2) NOT NULL,
  status booking_status NOT NULL DEFAULT 'confirmed',
  qr_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ
);
CREATE INDEX ON public.bookings(user_id);
GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Bookings own read" ON public.bookings FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.shows s JOIN public.events e ON e.id = s.event_id WHERE s.id = show_id AND e.organizer_id = auth.uid()));
CREATE POLICY "Bookings own insert" ON public.bookings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Bookings own update" ON public.bookings FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.booking_seats (
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  seat_id UUID NOT NULL REFERENCES public.seats(id),
  PRIMARY KEY (booking_id, seat_id)
);
GRANT SELECT, INSERT, DELETE ON public.booking_seats TO authenticated;
GRANT ALL ON public.booking_seats TO service_role;
ALTER TABLE public.booking_seats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Booking seats read" ON public.booking_seats FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND (b.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
);
CREATE POLICY "Booking seats insert" ON public.booking_seats FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.user_id = auth.uid())
);

-- ============ WAITLIST ============
CREATE TABLE public.waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  show_id UUID NOT NULL REFERENCES public.shows(id) ON DELETE CASCADE,
  section seat_section NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, show_id, section)
);
GRANT SELECT, INSERT, DELETE ON public.waitlist TO authenticated;
GRANT ALL ON public.waitlist TO service_role;
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Waitlist self" ON public.waitlist FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ WISHLIST ============
CREATE TABLE public.wishlist (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);
GRANT SELECT, INSERT, DELETE ON public.wishlist TO authenticated;
GRANT ALL ON public.wishlist TO service_role;
ALTER TABLE public.wishlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Wishlist self" ON public.wishlist FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ SEAT HOLD FUNCTION (atomic, concurrency-safe) ============
CREATE OR REPLACE FUNCTION public.hold_seats(_seat_ids UUID[], _minutes INT DEFAULT 10)
RETURNS TABLE(seat_id UUID, ok BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _now TIMESTAMPTZ := now();
  _expires TIMESTAMPTZ := now() + (_minutes || ' minutes')::interval;
  _sid UUID;
  _updated INT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  -- Release expired holds first
  UPDATE public.seats SET status = 'available', held_by = NULL, held_until = NULL
    WHERE status = 'held' AND held_until < _now AND id = ANY(_seat_ids);
  FOREACH _sid IN ARRAY _seat_ids LOOP
    UPDATE public.seats
      SET status = 'held', held_by = _uid, held_until = _expires
      WHERE id = _sid AND (status = 'available' OR (status = 'held' AND held_by = _uid));
    GET DIAGNOSTICS _updated = ROW_COUNT;
    seat_id := _sid; ok := _updated > 0; RETURN NEXT;
  END LOOP;
END; $$;
GRANT EXECUTE ON FUNCTION public.hold_seats(UUID[], INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_seats(_seat_ids UUID[])
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.seats SET status = 'available', held_by = NULL, held_until = NULL
    WHERE id = ANY(_seat_ids) AND held_by = auth.uid() AND status = 'held';
END; $$;
GRANT EXECUTE ON FUNCTION public.release_seats(UUID[]) TO authenticated;

-- ============ CONFIRM BOOKING (atomic) ============
CREATE OR REPLACE FUNCTION public.confirm_booking(_seat_ids UUID[], _show_id UUID, _qr TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _booking_id UUID;
  _total NUMERIC;
  _count INT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  -- Verify all seats held by user and not expired
  SELECT COUNT(*), COALESCE(SUM(price), 0) INTO _count, _total
    FROM public.seats
    WHERE id = ANY(_seat_ids) AND show_id = _show_id
      AND status = 'held' AND held_by = _uid AND held_until > now();
  IF _count <> array_length(_seat_ids, 1) THEN
    RAISE EXCEPTION 'Seat hold expired or invalid';
  END IF;
  INSERT INTO public.bookings (user_id, show_id, total, qr_code)
    VALUES (_uid, _show_id, _total, _qr) RETURNING id INTO _booking_id;
  INSERT INTO public.booking_seats (booking_id, seat_id)
    SELECT _booking_id, unnest(_seat_ids);
  UPDATE public.seats SET status = 'booked', held_by = NULL, held_until = NULL
    WHERE id = ANY(_seat_ids);
  RETURN _booking_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.confirm_booking(UUID[], UUID, TEXT) TO authenticated;

-- ============ CANCEL BOOKING ============
CREATE OR REPLACE FUNCTION public.cancel_booking(_booking_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.bookings SET status = 'cancelled', cancelled_at = now()
    WHERE id = _booking_id AND user_id = _uid AND status = 'confirmed';
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found or not cancellable'; END IF;
  UPDATE public.seats SET status = 'available'
    WHERE id IN (SELECT seat_id FROM public.booking_seats WHERE booking_id = _booking_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.cancel_booking(UUID) TO authenticated;

-- ============ AUTO-RELEASE EXPIRED HOLDS (pg_cron) ============
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('release-expired-seat-holds', '* * * * *', $$
  UPDATE public.seats SET status = 'available', held_by = NULL, held_until = NULL
    WHERE status = 'held' AND held_until < now();
$$);
