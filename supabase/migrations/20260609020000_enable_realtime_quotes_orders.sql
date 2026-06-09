-- Realtime for quote/order card live-link status sync (src/app.js
-- _subscribeLiveStatus). RLS already scopes delivery to each user's own rows, so
-- an authenticated client only receives changes to its own quotes/orders.
alter publication supabase_realtime add table public.quotes;
alter publication supabase_realtime add table public.orders;
