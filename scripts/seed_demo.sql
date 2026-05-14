-- ============================================================================
-- ProCabinet.App — Demo-Data Reset
-- ----------------------------------------------------------------------------
-- One-shot wipe + reseed of the signed-in user's working data.
-- Brings each capped library to exactly 5 entries for demo screenshots /
-- walkthroughs (the free-tier cap per src/limits.js is 5).
--
-- Scope:        single user, resolved by email below
-- Side-effect:  destroys every row in the listed tables for that user_id
-- Idempotent:   re-running this file wipes the demo and reseeds the same set
-- Transactional: a single DO block — partial failure rolls back the wipe
--
-- KEPT (not touched): catalog_items, business_info, subscriptions,
-- schedule_day_overrides, settings.
--
-- Architecture notes (post-F5/F6 migrations, 2026-05-13):
--   • No `projects` table — quotes & orders carry the job name in their own
--     `name` column.
--   • Cutlists are a standalone library; optional `quote_id` bookmarks the
--     source Quote.
-- ============================================================================

DO $$
DECLARE
  uid uuid;

  -- client ids
  smith_id     bigint;
  green_id     bigint;
  bayside_id   bigint;
  harring_id   bigint;
  cooper_id    bigint;

  -- cabinet template ids
  tpl_base600    bigint;
  tpl_wall600    bigint;
  tpl_drawer800  bigint;
  tpl_tall600    bigint;
  tpl_corner900  bigint;

  -- quote ids
  q1_id bigint;  -- QUO-0001 Smith Kitchen
  q2_id bigint;  -- QUO-0002 Greenwood Lakehouse
  q3_id bigint;  -- QUO-0003 Harrington Library
  q4_id bigint;  -- QUO-0004 Cooper Showhome
  q5_id bigint;  -- QUO-0005 Bayside Initial

  -- order ids
  o1_id bigint;  -- ORD-0001 Greenwood Lakehouse
  o2_id bigint;  -- ORD-0002 Smith Kitchen
  o3_id bigint;  -- ORD-0003 Harrington Library
  o4_id bigint;  -- ORD-0004 Cooper Showhome
  o5_id bigint;  -- ORD-0005 Workshop Bench Storage (no client)

  -- cutlist ids
  cl1_id bigint;  -- Smith Kitchen — Bases
  cl2_id bigint;  -- Greenwood Lakehouse — Walls
  cl3_id bigint;  -- Harrington Library — Tall Units
  cl4_id bigint;  -- Cooper Showhome — Wardrobes
  cl5_id bigint;  -- Workshop — Drawer Bank (no quote)
BEGIN
  -- ------------------------------------------------------------------
  -- 0. Resolve user
  -- ------------------------------------------------------------------
  SELECT id INTO uid
    FROM auth.users
   WHERE email = 'adam.denney@hotmail.com'
   LIMIT 1;

  IF uid IS NULL THEN
    RAISE EXCEPTION 'User not found in auth.users (looked up by email).';
  END IF;

  RAISE NOTICE 'Resetting demo data for user_id = %', uid;

  -- ------------------------------------------------------------------
  -- 1. WIPE — FK-safe order
  -- ------------------------------------------------------------------
  DELETE FROM public.cutlist_cabinets   WHERE user_id = uid;
  DELETE FROM public.pieces             WHERE user_id = uid;
  DELETE FROM public.sheets             WHERE user_id = uid;
  DELETE FROM public.edge_bands         WHERE user_id = uid;
  DELETE FROM public.cutlists           WHERE user_id = uid;
  DELETE FROM public.order_lines        WHERE user_id = uid;
  DELETE FROM public.orders             WHERE user_id = uid;
  DELETE FROM public.quote_lines        WHERE user_id = uid;
  DELETE FROM public.quotes             WHERE user_id = uid;
  DELETE FROM public.cabinet_hardware   WHERE user_id = uid;
  DELETE FROM public.cabinets           WHERE user_id = uid;
  DELETE FROM public.cabinet_templates  WHERE user_id = uid;
  DELETE FROM public.stock_items        WHERE user_id = uid;
  DELETE FROM public.clients            WHERE user_id = uid;

  -- ------------------------------------------------------------------
  -- 2. SEED — clients (5)
  -- ------------------------------------------------------------------
  INSERT INTO public.clients (user_id, name, email, phone, address, notes)
       VALUES (uid, 'Smith Residence', 'mike.smith@example.com', '07111 222 333',
               '12 Oak Lane, Bristol BS1 4AB',
               'Returning customer — kitchen + utility next year.')
    RETURNING id INTO smith_id;

  INSERT INTO public.clients (user_id, name, email, phone, address, notes)
       VALUES (uid, 'Greenwood Kitchens Ltd', 'orders@greenwood-kitchens.co.uk',
               '0117 555 4422', 'Unit 4, Avon Trade Park, Bristol BS5 9QF',
               'Trade — net 30, PO required on all jobs.')
    RETURNING id INTO green_id;

  INSERT INTO public.clients (user_id, name, email, phone, notes)
       VALUES (uid, 'Bayside Build Co', 'hello@baysidebuild.co.uk',
               '07900 111 222',
               'New trade contact — quoted once, no orders yet.')
    RETURNING id INTO bayside_id;

  INSERT INTO public.clients (user_id, name, email, phone, address, notes)
       VALUES (uid, 'Harrington Manor', 'estate@harringtonmanor.co.uk',
               '01225 778 990',
               'The Old Hall, Combe Down, Bath BA2 5HF',
               'High-end residential — library + bootroom this year, kitchen 2027.')
    RETURNING id INTO harring_id;

  INSERT INTO public.clients (user_id, name, email, phone, address, notes)
       VALUES (uid, 'Cooper & Sons Contractors', 'projects@cooperandsons.co.uk',
               '0117 432 8800',
               '7 Bedminster Down Rd, Bristol BS13 7AA',
               'Construction firm — showhome fit-outs, repeat work expected.')
    RETURNING id INTO cooper_id;

  -- ------------------------------------------------------------------
  -- 3. SEED — cabinet_templates (5)
  -- ------------------------------------------------------------------
  INSERT INTO public.cabinet_templates
              (user_id, name, type, default_w_mm, default_h_mm, default_d_mm, default_specs)
       VALUES (uid, 'Base 600', 'base', 600, 720, 560,
               jsonb_build_object(
                 'w', 600, 'h', 720, 'd', 560, 'qty', 1,
                 'material', '18mm Birch Plywood',
                 'doors', 2, 'drawers', 0, 'shelves', 1,
                 'doorPct', 95, 'construction', 'overlay', 'baseType', 'plinth'))
    RETURNING id INTO tpl_base600;

  INSERT INTO public.cabinet_templates
              (user_id, name, type, default_w_mm, default_h_mm, default_d_mm, default_specs)
       VALUES (uid, 'Wall 600', 'wall', 600, 720, 330,
               jsonb_build_object(
                 'w', 600, 'h', 720, 'd', 330, 'qty', 1,
                 'material', '18mm Birch Plywood',
                 'doors', 2, 'drawers', 0, 'shelves', 2,
                 'doorPct', 95, 'construction', 'overlay', 'baseType', 'none'))
    RETURNING id INTO tpl_wall600;

  INSERT INTO public.cabinet_templates
              (user_id, name, type, default_w_mm, default_h_mm, default_d_mm, default_specs)
       VALUES (uid, 'Drawer 800', 'custom', 800, 720, 560,
               jsonb_build_object(
                 'w', 800, 'h', 720, 'd', 560, 'qty', 1,
                 'material', '18mm Birch Plywood',
                 'doors', 0, 'drawers', 3, 'shelves', 0,
                 'drawerPct', 33, 'construction', 'overlay', 'baseType', 'plinth'))
    RETURNING id INTO tpl_drawer800;

  INSERT INTO public.cabinet_templates
              (user_id, name, type, default_w_mm, default_h_mm, default_d_mm, default_specs)
       VALUES (uid, 'Tall Larder 600', 'tall', 600, 2100, 560,
               jsonb_build_object(
                 'w', 600, 'h', 2100, 'd', 560, 'qty', 1,
                 'material', '18mm Birch Plywood',
                 'doors', 2, 'drawers', 0, 'shelves', 4,
                 'doorPct', 95, 'construction', 'overlay', 'baseType', 'plinth'))
    RETURNING id INTO tpl_tall600;

  INSERT INTO public.cabinet_templates
              (user_id, name, type, default_w_mm, default_h_mm, default_d_mm, default_specs)
       VALUES (uid, 'Corner Base 900', 'base', 900, 720, 900,
               jsonb_build_object(
                 'w', 900, 'h', 720, 'd', 900, 'qty', 1,
                 'material', '18mm Birch Plywood',
                 'doors', 1, 'drawers', 0, 'shelves', 1,
                 'doorPct', 95, 'construction', 'overlay', 'baseType', 'plinth',
                 'corner', true))
    RETURNING id INTO tpl_corner900;

  -- ------------------------------------------------------------------
  -- 4. SEED — stock_items (5)
  -- ------------------------------------------------------------------
  INSERT INTO public.stock_items
              (user_id, name, category, sku, qty, low, cost,
               thickness_mm, width_mm, length_m, supplier)
       VALUES
    (uid, '18mm Birch Plywood',       'Plywood',   'PLY-BIRCH-18', 12, 3, 58.00,  18, 1220, 2.44, 'Travis Perkins'),
    (uid, '12mm MDF',                 'MDF',       'MDF-12',        8, 2, 22.00,  12, 1220, 2.44, 'Travis Perkins'),
    (uid, 'Soft-close hinges',        'Hardware',  'HW-HINGE-SC',  50, 10, 2.80, NULL, NULL, NULL, 'Blum UK'),
    (uid, '500mm drawer slides',      'Hardware',  'HW-SLIDE-500', 20, 4, 14.00, NULL, NULL, NULL, 'Blum UK'),
    (uid, 'PVC edge band 22mm white', 'Edge Band', 'EB-PVC-22W',    2, 1, 18.00, NULL,   22, 50.00, 'Hafele');

  -- ------------------------------------------------------------------
  -- 5. SEED — quotes (5)  + quote_lines
  -- ------------------------------------------------------------------

  -- 5.1 QUO-0001  Smith Kitchen Renovation (draft)
  INSERT INTO public.quotes
              (user_id, client_id, name, status, date,
               markup, tax, discount, stock_markup, quote_number, notes)
       VALUES (uid, smith_id, 'Smith Kitchen Renovation', 'draft',
               to_char(CURRENT_DATE, 'YYYY-MM-DD'),
               25, 20, 0, 10, 'QUO-0001',
               'Full kitchen refit — 8 bases + 4 walls + island. Painted shaker.')
    RETURNING id INTO q1_id;

  INSERT INTO public.quote_lines
              (quote_id, user_id, position, line_kind,
               name, type, w_mm, h_mm, d_mm, qty,
               material, finish, construction, base_type,
               door_count, door_pct, drawer_count,
               fixed_shelves, adj_shelves,
               labour_hours, labour_override)
       VALUES (q1_id, uid, 0, 'cabinet',
               'Base 600', 'base', 600, 720, 560, 8,
               '18mm Birch Plywood', 'Painted shaker', 'overlay', 'plinth',
               2, 95, 0, 1, 0, 4, false);

  INSERT INTO public.quote_lines
              (quote_id, user_id, position, line_kind, name, qty, unit_price)
       VALUES (q1_id, uid, 1, 'item', 'Soft-close hinges', 16, 8.00);

  INSERT INTO public.quote_lines
              (quote_id, user_id, position, line_kind, name, labour_hours, unit_price)
       VALUES (q1_id, uid, 2, 'labour', 'Install on site', 16, 45.00);

  -- 5.2 QUO-0002  Greenwood Lakehouse Kitchen (sent)
  INSERT INTO public.quotes
              (user_id, client_id, name, status, date,
               markup, tax, discount, stock_markup, quote_number, notes)
       VALUES (uid, green_id, 'Greenwood Lakehouse Kitchen', 'sent',
               to_char(CURRENT_DATE - 7, 'YYYY-MM-DD'),
               20, 20, 0, 10, 'QUO-0002',
               'Trade supply only — 12-cabinet kitchen, no fitting.')
    RETURNING id INTO q2_id;

  INSERT INTO public.quote_lines
              (quote_id, user_id, position, line_kind,
               name, type, w_mm, h_mm, d_mm, qty,
               material, finish, construction, base_type,
               door_count, door_pct, fixed_shelves,
               labour_hours, labour_override)
       VALUES (q2_id, uid, 0, 'cabinet',
               'Wall 600', 'wall', 600, 720, 330, 6,
               '18mm Birch Plywood', 'None', 'overlay', 'none',
               2, 95, 2, 3, false);

  INSERT INTO public.quote_lines
              (quote_id, user_id, position, line_kind, name, qty, unit_price)
       VALUES (q2_id, uid, 1, 'item', 'Delivery — trade', 1, 75.00);

  -- 5.3 QUO-0003  Harrington Library Fit-out (accepted)
  INSERT INTO public.quotes
              (user_id, client_id, name, status, date,
               markup, tax, discount, stock_markup, quote_number, notes)
       VALUES (uid, harring_id, 'Harrington Library Fit-out', 'approved',
               to_char(CURRENT_DATE - 14, 'YYYY-MM-DD'),
               30, 20, 0, 15, 'QUO-0003',
               'Floor-to-ceiling library — 5 tall larder units, walnut veneer.')
    RETURNING id INTO q3_id;

  INSERT INTO public.quote_lines
              (quote_id, user_id, position, line_kind,
               name, type, w_mm, h_mm, d_mm, qty,
               material, finish, construction, base_type,
               door_count, door_pct, fixed_shelves, adj_shelves,
               labour_hours, labour_override)
       VALUES (q3_id, uid, 0, 'cabinet',
               'Tall Larder 600', 'tall', 600, 2100, 560, 5,
               '18mm Birch Plywood', 'Walnut veneer', 'overlay', 'plinth',
               2, 95, 4, 2, 8, false);

  INSERT INTO public.quote_lines
              (quote_id, user_id, position, line_kind, name, labour_hours, unit_price)
       VALUES (q3_id, uid, 1, 'labour', 'On-site fitting', 24, 55.00);

  -- 5.4 QUO-0004  Cooper Showhome Master Suite (sent)
  INSERT INTO public.quotes
              (user_id, client_id, name, status, date,
               markup, tax, discount, stock_markup, quote_number, notes)
       VALUES (uid, cooper_id, 'Cooper Showhome — Master Suite', 'sent',
               to_char(CURRENT_DATE - 3, 'YYYY-MM-DD'),
               22, 20, 0, 10, 'QUO-0004',
               'Master bedroom wardrobes — 3-bay run with drawer bank below.')
    RETURNING id INTO q4_id;

  INSERT INTO public.quote_lines
              (quote_id, user_id, position, line_kind,
               name, type, w_mm, h_mm, d_mm, qty,
               material, finish, construction, base_type,
               drawer_count, drawer_pct,
               labour_hours, labour_override)
       VALUES (q4_id, uid, 0, 'cabinet',
               'Drawer 800', 'custom', 800, 720, 560, 3,
               '18mm Birch Plywood', 'Painted', 'overlay', 'plinth',
               3, 33, 5, false);

  INSERT INTO public.quote_lines
              (quote_id, user_id, position, line_kind, name, qty, unit_price)
       VALUES (q4_id, uid, 1, 'item', '500mm drawer slides', 9, 28.00);

  -- 5.5 QUO-0005  Bayside Initial Quote (draft, prospect)
  INSERT INTO public.quotes
              (user_id, client_id, name, status, date,
               markup, tax, discount, stock_markup, quote_number, notes)
       VALUES (uid, bayside_id, 'Bayside Initial Quote', 'draft',
               to_char(CURRENT_DATE - 1, 'YYYY-MM-DD'),
               25, 20, 0, 10, 'QUO-0005',
               'Awaiting site visit — ballpark only.')
    RETURNING id INTO q5_id;

  INSERT INTO public.quote_lines
              (quote_id, user_id, position, line_kind,
               name, type, w_mm, h_mm, d_mm, qty,
               material, finish, construction, base_type,
               door_count, door_pct, fixed_shelves,
               labour_hours, labour_override)
       VALUES (q5_id, uid, 0, 'cabinet',
               'Base 600', 'base', 600, 720, 560, 4,
               '18mm Birch Plywood', 'TBD', 'overlay', 'plinth',
               2, 95, 1, 4, false);

  INSERT INTO public.quote_lines
              (quote_id, user_id, position, line_kind, name, labour_hours, unit_price)
       VALUES (q5_id, uid, 1, 'labour', 'Estimating allowance', 2, 45.00);

  -- ------------------------------------------------------------------
  -- 6. SEED — orders (5)  + order_lines
  -- ------------------------------------------------------------------

  -- 6.1 ORD-0001  Greenwood Lakehouse Kitchen (production, due +14)
  INSERT INTO public.orders
              (user_id, client_id, quote_id, name, status, due, value,
               markup, tax, discount, stock_markup, order_number,
               production_start_date, priority, auto_schedule, run_over_hours,
               sidebar_order_index, notes)
       VALUES (uid, green_id, q2_id, 'Greenwood Lakehouse Kitchen', 'production',
               to_char(CURRENT_DATE + 14, 'YYYY-MM-DD'), 4250.00,
               20, 20, 0, 10, 'ORD-0001',
               CURRENT_DATE, 1, true, 0,
               0, 'Demo order — converted from QUO-0002. Trade supply.')
    RETURNING id INTO o1_id;

  INSERT INTO public.order_lines
              (order_id, user_id, position, line_kind,
               name, type, w_mm, h_mm, d_mm, qty,
               material, finish, construction, base_type,
               door_count, door_pct, fixed_shelves,
               labour_hours, labour_override)
       VALUES (o1_id, uid, 0, 'cabinet',
               'Wall 600', 'wall', 600, 720, 330, 6,
               '18mm Birch Plywood', 'None', 'overlay', 'none',
               2, 95, 2, 3, false);

  INSERT INTO public.order_lines
              (order_id, user_id, position, line_kind, name, qty, unit_price)
       VALUES (o1_id, uid, 1, 'item', 'Delivery to site', 1, 75.00);

  -- 6.2 ORD-0002  Smith Kitchen Renovation (confirmed/scheduled, due +45)
  INSERT INTO public.orders
              (user_id, client_id, name, status, due, value,
               markup, tax, discount, stock_markup, order_number,
               priority, auto_schedule, run_over_hours,
               sidebar_order_index, notes)
       VALUES (uid, smith_id, 'Smith Kitchen Renovation', 'confirmed',
               to_char(CURRENT_DATE + 45, 'YYYY-MM-DD'), 9800.00,
               25, 20, 0, 10, 'ORD-0002',
               2, true, 0,
               1, 'Awaiting deposit. Production starts in 4 weeks.')
    RETURNING id INTO o2_id;

  INSERT INTO public.order_lines
              (order_id, user_id, position, line_kind,
               name, type, w_mm, h_mm, d_mm, qty,
               material, finish, construction, base_type,
               door_count, door_pct, fixed_shelves,
               labour_hours, labour_override)
       VALUES (o2_id, uid, 0, 'cabinet',
               'Base 600', 'base', 600, 720, 560, 8,
               '18mm Birch Plywood', 'Painted shaker', 'overlay', 'plinth',
               2, 95, 1, 4, false);

  INSERT INTO public.order_lines
              (order_id, user_id, position, line_kind, name, labour_hours, unit_price)
       VALUES (o2_id, uid, 1, 'labour', 'On-site install', 16, 45.00);

  -- 6.3 ORD-0003  Harrington Library Fit-out (production, due +21)
  INSERT INTO public.orders
              (user_id, client_id, quote_id, name, status, due, value,
               markup, tax, discount, stock_markup, order_number,
               production_start_date, priority, auto_schedule, run_over_hours,
               sidebar_order_index, notes)
       VALUES (uid, harring_id, q3_id, 'Harrington Library Fit-out', 'production',
               to_char(CURRENT_DATE + 21, 'YYYY-MM-DD'), 11500.00,
               30, 20, 0, 15, 'ORD-0003',
               CURRENT_DATE - 3, 1, true, 0,
               2, 'Walnut veneer ordered — lead time 10 days. Install on site.')
    RETURNING id INTO o3_id;

  INSERT INTO public.order_lines
              (order_id, user_id, position, line_kind,
               name, type, w_mm, h_mm, d_mm, qty,
               material, finish, construction, base_type,
               door_count, door_pct, fixed_shelves, adj_shelves,
               labour_hours, labour_override)
       VALUES (o3_id, uid, 0, 'cabinet',
               'Tall Larder 600', 'tall', 600, 2100, 560, 5,
               '18mm Birch Plywood', 'Walnut veneer', 'overlay', 'plinth',
               2, 95, 4, 2, 8, false);

  INSERT INTO public.order_lines
              (order_id, user_id, position, line_kind, name, labour_hours, unit_price)
       VALUES (o3_id, uid, 1, 'labour', 'On-site fitting', 24, 55.00);

  -- 6.4 ORD-0004  Cooper Showhome — Master Suite (done, completed)
  INSERT INTO public.orders
              (user_id, client_id, name, status, due, value,
               markup, tax, discount, stock_markup, order_number,
               production_start_date, priority, auto_schedule, run_over_hours,
               sidebar_order_index, notes)
       VALUES (uid, cooper_id, 'Cooper Showhome — Master Suite', 'done',
               to_char(CURRENT_DATE - 7, 'YYYY-MM-DD'), 3850.00,
               22, 20, 0, 10, 'ORD-0004',
               CURRENT_DATE - 28, 0, false, 0,
               3, 'Delivered + signed off. Awaiting final invoice payment.')
    RETURNING id INTO o4_id;

  INSERT INTO public.order_lines
              (order_id, user_id, position, line_kind,
               name, type, w_mm, h_mm, d_mm, qty,
               material, finish, construction, base_type,
               drawer_count, drawer_pct,
               labour_hours, labour_override)
       VALUES (o4_id, uid, 0, 'cabinet',
               'Drawer 800', 'custom', 800, 720, 560, 3,
               '18mm Birch Plywood', 'Painted', 'overlay', 'plinth',
               3, 33, 5, false);

  INSERT INTO public.order_lines
              (order_id, user_id, position, line_kind, name, qty, unit_price)
       VALUES (o4_id, uid, 1, 'item', 'Delivery + install', 1, 250.00);

  -- 6.5 ORD-0005  Workshop Bench Storage (confirmed, in-house, no client)
  INSERT INTO public.orders
              (user_id, name, status, due, value,
               markup, tax, discount, stock_markup, order_number,
               priority, auto_schedule, run_over_hours,
               sidebar_order_index, notes)
       VALUES (uid, 'Workshop Bench Storage', 'confirmed',
               to_char(CURRENT_DATE + 60, 'YYYY-MM-DD'), 0,
               0, 0, 0, 0, 'ORD-0005',
               0, false, 0,
               4, 'In-house job — own workshop. No client, no markup.')
    RETURNING id INTO o5_id;

  INSERT INTO public.order_lines
              (order_id, user_id, position, line_kind,
               name, type, w_mm, h_mm, d_mm, qty,
               material, finish, construction, base_type,
               drawer_count, drawer_pct,
               labour_hours, labour_override)
       VALUES (o5_id, uid, 0, 'cabinet',
               'Drawer 800', 'custom', 800, 720, 560, 2,
               '18mm Birch Plywood', 'None', 'overlay', 'plinth',
               3, 33, 3, false);

  INSERT INTO public.order_lines
              (order_id, user_id, position, line_kind, name, qty, unit_price)
       VALUES (o5_id, uid, 1, 'item', 'Off-cuts allowance', 1, 0);

  -- ------------------------------------------------------------------
  -- 7. SEED — cutlists (5) + sheets + pieces
  -- ------------------------------------------------------------------
  --
  -- Each cut list gets 1 sheet (2440×1220 ply) and 5 pieces.
  -- Four are bookmarked to a Quote via quote_id; one is standalone (workshop).
  -- ------------------------------------------------------------------

  -- 7.1 Smith Kitchen — Bases
  INSERT INTO public.cutlists (user_id, quote_id, name, position, ui_prefs)
       VALUES (uid, q1_id, 'Smith Kitchen — Bases', 0, '{}'::jsonb)
    RETURNING id INTO cl1_id;
  INSERT INTO public.sheets
              (user_id, cutlist_id, position, name, w_mm, h_mm, qty, kerf_mm, grain)
       VALUES (uid, cl1_id, 0, '18mm Birch Plywood', 2440, 1220, 3, 3, 'none');
  INSERT INTO public.pieces
              (user_id, cutlist_id, position, label, w_mm, h_mm, qty, grain)
       VALUES
    (uid, cl1_id, 0, 'Side Panel',   590, 762, 16, 'none'),
    (uid, cl1_id, 1, 'Top / Bottom', 572, 590, 16, 'none'),
    (uid, cl1_id, 2, 'Shelf',        572, 559,  8, 'none'),
    (uid, cl1_id, 3, 'Back Panel',   590, 762,  8, 'none'),
    (uid, cl1_id, 4, 'Door',         292, 749, 16, 'none');

  -- 7.2 Greenwood Lakehouse — Walls
  INSERT INTO public.cutlists (user_id, quote_id, name, position, ui_prefs)
       VALUES (uid, q2_id, 'Greenwood Lakehouse — Walls', 1, '{}'::jsonb)
    RETURNING id INTO cl2_id;
  INSERT INTO public.sheets
              (user_id, cutlist_id, position, name, w_mm, h_mm, qty, kerf_mm, grain)
       VALUES (uid, cl2_id, 0, '18mm Birch Plywood', 2440, 1220, 2, 3, 'none');
  INSERT INTO public.pieces
              (user_id, cutlist_id, position, label, w_mm, h_mm, qty, grain)
       VALUES
    (uid, cl2_id, 0, 'Side Panel',   330, 720, 12, 'none'),
    (uid, cl2_id, 1, 'Top / Bottom', 572, 330, 12, 'none'),
    (uid, cl2_id, 2, 'Shelf',        572, 310, 12, 'none'),
    (uid, cl2_id, 3, 'Back Panel',   590, 720,  6, 'none'),
    (uid, cl2_id, 4, 'Door',         292, 720, 12, 'none');

  -- 7.3 Harrington Library — Tall Units
  INSERT INTO public.cutlists (user_id, quote_id, name, position, ui_prefs)
       VALUES (uid, q3_id, 'Harrington Library — Tall Units', 2, '{}'::jsonb)
    RETURNING id INTO cl3_id;
  INSERT INTO public.sheets
              (user_id, cutlist_id, position, name, w_mm, h_mm, qty, kerf_mm, grain)
       VALUES (uid, cl3_id, 0, '18mm Birch Plywood', 2440, 1220, 4, 3, 'none');
  INSERT INTO public.pieces
              (user_id, cutlist_id, position, label, w_mm, h_mm, qty, grain)
       VALUES
    (uid, cl3_id, 0, 'Side Panel',   590, 2082, 10, 'none'),
    (uid, cl3_id, 1, 'Top / Bottom', 572,  590, 10, 'none'),
    (uid, cl3_id, 2, 'Shelf',        572,  559, 20, 'none'),
    (uid, cl3_id, 3, 'Back Panel',   590, 2082,  5, 'none'),
    (uid, cl3_id, 4, 'Door',         292, 1035, 20, 'none');

  -- 7.4 Cooper Showhome — Wardrobes
  INSERT INTO public.cutlists (user_id, quote_id, name, position, ui_prefs)
       VALUES (uid, q4_id, 'Cooper Showhome — Wardrobes', 3, '{}'::jsonb)
    RETURNING id INTO cl4_id;
  INSERT INTO public.sheets
              (user_id, cutlist_id, position, name, w_mm, h_mm, qty, kerf_mm, grain)
       VALUES (uid, cl4_id, 0, '18mm Birch Plywood', 2440, 1220, 2, 3, 'none');
  INSERT INTO public.pieces
              (user_id, cutlist_id, position, label, w_mm, h_mm, qty, grain)
       VALUES
    (uid, cl4_id, 0, 'Side Panel',   590, 762, 6, 'none'),
    (uid, cl4_id, 1, 'Top / Bottom', 772, 590, 6, 'none'),
    (uid, cl4_id, 2, 'Drawer Front', 772, 240, 9, 'none'),
    (uid, cl4_id, 3, 'Drawer Box Side',  500, 220, 18, 'none'),
    (uid, cl4_id, 4, 'Back Panel',   790, 762,  3, 'none');

  -- 7.5 Workshop — Drawer Bank (standalone, no quote)
  INSERT INTO public.cutlists (user_id, name, position, ui_prefs)
       VALUES (uid, 'Workshop — Drawer Bank', 4, '{}'::jsonb)
    RETURNING id INTO cl5_id;
  INSERT INTO public.sheets
              (user_id, cutlist_id, position, name, w_mm, h_mm, qty, kerf_mm, grain)
       VALUES (uid, cl5_id, 0, '18mm Birch Plywood', 2440, 1220, 1, 3, 'none');
  INSERT INTO public.pieces
              (user_id, cutlist_id, position, label, w_mm, h_mm, qty, grain)
       VALUES
    (uid, cl5_id, 0, 'Side Panel',   590, 762, 4, 'none'),
    (uid, cl5_id, 1, 'Top / Bottom', 772, 590, 4, 'none'),
    (uid, cl5_id, 2, 'Drawer Front', 772, 240, 6, 'none'),
    (uid, cl5_id, 3, 'Drawer Box Side', 500, 220, 12, 'none'),
    (uid, cl5_id, 4, 'Back Panel',   790, 762, 2, 'none');

  -- ------------------------------------------------------------------
  -- 8. Done.
  -- ------------------------------------------------------------------
  RAISE NOTICE 'Demo data reset complete.';
  RAISE NOTICE '  5 clients, 5 cabinet templates, 5 stock items.';
  RAISE NOTICE '  5 quotes (QUO-0001..QUO-0005), 5 orders (ORD-0001..ORD-0005).';
  RAISE NOTICE '  5 cutlists (each with 1 sheet + 5 pieces).';
END $$;


-- ============================================================================
-- VERIFICATION — run this after the DO block to confirm counts.
-- ============================================================================
WITH u AS (
  SELECT id AS uid FROM auth.users WHERE email = 'adam.denney@hotmail.com'
)
SELECT 'clients'           AS table_name, COUNT(*) AS rows FROM public.clients,           u WHERE clients.user_id           = u.uid
UNION ALL
SELECT 'cabinet_templates',              COUNT(*)            FROM public.cabinet_templates, u WHERE cabinet_templates.user_id = u.uid
UNION ALL
SELECT 'stock_items',                    COUNT(*)            FROM public.stock_items,       u WHERE stock_items.user_id       = u.uid
UNION ALL
SELECT 'quotes',                         COUNT(*)            FROM public.quotes,            u WHERE quotes.user_id            = u.uid
UNION ALL
SELECT 'quote_lines',                    COUNT(*)            FROM public.quote_lines,       u WHERE quote_lines.user_id       = u.uid
UNION ALL
SELECT 'orders',                         COUNT(*)            FROM public.orders,            u WHERE orders.user_id            = u.uid
UNION ALL
SELECT 'order_lines',                    COUNT(*)            FROM public.order_lines,       u WHERE order_lines.user_id       = u.uid
UNION ALL
SELECT 'cutlists',                       COUNT(*)            FROM public.cutlists,          u WHERE cutlists.user_id          = u.uid
UNION ALL
SELECT 'sheets',                         COUNT(*)            FROM public.sheets,            u WHERE sheets.user_id            = u.uid
UNION ALL
SELECT 'pieces',                         COUNT(*)            FROM public.pieces,            u WHERE pieces.user_id            = u.uid
ORDER BY 1;
-- Expected:
--   cabinet_templates  5
--   clients            5
--   cutlists           5
--   order_lines       10
--   orders             5
--   pieces            25
--   quote_lines       11
--   quotes             5
--   sheets             5
--   stock_items        5
