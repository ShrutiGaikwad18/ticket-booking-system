# TicketBooking — Ticket Booking System

A production-ready ticket booking app for movies, concerts, theatre and sports.

## Stack

- **Frontend:** React 19 + TypeScript + TanStack Start (Vite 8) + Tailwind CSS v4 + shadcn/ui
- **Backend:** Supabase (Postgres + Auth + Storage + Edge/Worker runtime)
- **Auth:** Email/password + Google, JWT bearer tokens
- **Roles:** `admin`, `organizer`, `customer` (via `user_roles` table + `has_role()` security-definer function — never on the profile row)
- **QR Tickets:** `qrcode.react`
- **Realtime seat coordination:** Postgres RPC (`hold_seats`, `confirm_booking`, `cancel_booking`) + `pg_cron` auto-release job

## Features

### Customer
- Browse & filter events (movies, concerts, theatre, sports)
- Search by title, category chips
- Event detail with showtime picker
- Interactive seat map — **green = available, yellow = held, red = booked**
- 10-minute countdown seat hold with automatic release
- Concurrency-safe atomic booking (no double-booking)
- QR-code ticket + booking history + cancellation
- Wishlist & waitlist (when a section sells out)

### Organizer / Admin (Pass 2)
Dashboards for event CRUD, show CRUD, seat layout, pricing, revenue analytics, user & venue management.

## Getting Started

```bash
npm install
npm run dev
```

The app runs on `http://localhost:5173`.

## Environment

Supabase requires a local `.env` file with project URL and keys. See `.env.example` for the required values.

## Database Schema

| Table | Purpose |
| --- | --- |
| `profiles` | User profile (linked to `auth.users`) |
| `user_roles` | Roles: admin / organizer / customer |
| `venues` | Venue name, city, address |
| `events` | Movie/concert/etc., linked to venue + organizer |
| `shows` | Individual showtime for an event |
| `seats` | Per-show seat with section, row, price, status |
| `bookings` + `booking_seats` | Confirmed bookings & seat mapping |
| `waitlist` | Users waiting for a sold-out section |
| `wishlist` | Saved events |

### RPCs

- `hold_seats(_seat_ids, _minutes)` — atomic hold for 10 min
- `release_seats(_seat_ids)` — release own hold
- `confirm_booking(_seat_ids, _show_id, _qr)` — verify hold + create booking transactionally
- `cancel_booking(_booking_id)` — cancel & free seats
- `has_role(_user_id, _role)` — RLS helper

### Automation
- `pg_cron` job every minute releases expired seat holds (`held_until < now()`).

## Security

- Row Level Security on every table
- Security-definer functions with fixed `search_path`
- Roles stored in dedicated `user_roles` table (prevents privilege escalation)
- Seat holds are atomic (`UPDATE … WHERE status = 'available'`) — never issues a double hold

## Deploy

Deploy with your preferred host or backend platform. Configure Supabase credentials and serve the Vite app normally.
