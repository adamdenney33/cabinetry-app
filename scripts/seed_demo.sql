-- ============================================================================
-- ProCabinet.App — Demo-Data Reset
-- ----------------------------------------------------------------------------
-- One-shot wipe + reseed of the signed-in user's working data
-- (clients / projects / cabinets / stock / cutlists + the dependent
-- quotes / orders that reference them).
--
-- Scope:        single user, resolved by email below
-- Side-effect:  destroys every row in 11 tables for that user_id
-- Idempotent:   re-running this file wipes the demo and reseeds the same set
-- Transactional: a single DO block — partial failure rolls back the wipe
--
-- KEPT (not touched): catalog_items, business_info, subscriptions, settings.
-- ============================================================================

DO $$
DECLARE
  uid uuid;

  -- client ids
  smith_id    bigint;
  green_id    bigint;
  bayside_id  bigint;

  -- project ids
  proj_kitchen   bigint;
  proj_lakehouse bigint;
  proj_workshop  bigint;

  -- cabinet template ids
  tpl_base600   bigint;
  tpl_wall600   bigint;
  tpl_drawer800 bigint;

  -- cutlist id
  cl_main bigint;

  -- quote + order ids
  q_id bigint;
  o_id bigint;
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
  -- 1. WIPE — FK-safe order, with defensive sweeps for cutlist-less rows
  -- ------------------------------------------------------------------
  DELETE FROM public.stock_items        WHERE user_id = uid;
  DELETE FROM public.quotes             WHERE user_id = uid;  -- cascades quote_lines
  DELETE FROM public.orders             WHERE user_id = uid;  -- cascades order_lines
  DELETE FROM public.cutlists           WHERE user_id = uid;  -- cascades sheets/pieces/edge_bands/cutlist_cabinets
  DELETE FROM public.cabinet_templates  WHERE user_id = uid;
  DELETE FROM public.projects           WHERE user_id = uid;  -- cascades cabinets, cabinet_hardware
  DELETE FROM public.clients            WHERE user_id = uid;

  -- Defensive sweeps — harmless if cascades already cleaned them
  DELETE FROM public.pieces      WHERE user_id = uid;
  DELETE FROM public.sheets      WHERE user_id = uid;
  DELETE FROM public.edge_bands  WHERE user_id = uid;
  DELETE FROM public.cabinets    WHERE user_id = uid;

  -- ------------------------------------------------------------------
  -- 2. SEED — clients
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
               'New trade contact — quoted once, no projects yet.')
    RETURNING id INTO bayside_id;

  -- ------------------------------------------------------------------
  -- 3. SEED — projects
  -- ------------------------------------------------------------------
  INSERT INTO public.projects (user_id, name, client_id, status, description)
       VALUES (uid, 'Kitchen Renovation', smith_id, 'active',
               'Full kitchen refit — 8 bases + 4 walls + island. Painted shaker.')
    RETURNING id INTO proj_kitchen;

  INSERT INTO public.projects (user_id, name, client_id, status, description)
       VALUES (uid, 'Lakehouse New Build', green_id, 'active',
               'Contract for Greenwood — supply only, 12-cabinet kitchen + utility.')
    RETURNING id INTO proj_lakehouse;

  INSERT INTO public.projects (user_id, name, status, description)
       VALUES (uid, 'Workshop Bench Storage', 'active',
               'In-house — drawer bank for the workshop. No client (own job).')
    RETURNING id INTO proj_workshop;

  -- ------------------------------------------------------------------
  -- 4. SEED — cabinet_templates (library)
  -- ------------------------------------------------------------------
  INSERT INTO public.cabinet_templates
              (user_id, name, type, default_w_mm, default_h_mm, default_d_mm, default_specs)
       VALUES (uid, 'Base 600', 'base', 600, 720, 560,
               jsonb_build_object(
                 'doors',          2,
                 'drawers',        0,
                 'shelves',        1,
                 'doorPct',        95,
                 'construction',   'overlay',
                 'baseType',       'plinth'))
    RETURNING id INTO tpl_base600;

  INSERT INTO public.cabinet_templates
              (user_id, name, type, default_w_mm, default_h_mm, default_d_mm, default_specs)
       VALUES (uid, 'Wall 600', 'wall', 600, 720, 330,
               jsonb_build_object(
                 'doors',          2,
                 'drawers',        0,
                 'shelves',        2,
                 'doorPct',        95,
                 'construction',   'overlay',
                 'baseType',       'none'))
    RETURNING id INTO tpl_wall600;

  INSERT INTO public.cabinet_templates
              (user_id, name, type, default_w_mm, default_h_mm, default_d_mm, default_specs)
       VALUES (uid, 'Drawer 800', 'custom', 800, 720, 560,
               jsonb_build_object(
                 'doors',          0,
                 'drawers',        3,
                 'shelves',        0,
                 'drawerPct',      33,
                 'construction',   'overlay',
                 'baseType',       'plinth'))
    RETURNING id INTO tpl_drawer800;

  -- ------------------------------------------------------------------
  -- 5. SEED — stock_items
  -- ------------------------------------------------------------------
  INSERT INTO public.stock_items
              (user_id, name, category, sku, qty, low, cost,
               thickness_mm, width_mm, length_m, supplier)
       VALUES
    (uid, '18mm Birch Plywood',     'Plywood',   'PLY-BIRCH-18', 12, 3, 58.00, 18, 1220, 2.44, 'Travis Perkins'),
    (uid, '12mm MDF',               'MDF',       'MDF-12',        8, 2, 22.00, 12, 1220, 2.44, 'Travis Perkins'),
    (uid, 'Soft-close hinges',      'Hardware',  'HW-HINGE-SC',  50, 10, 2.80, NULL, NULL, NULL, 'Blum UK'),
    (uid, '500mm drawer slides',    'Hardware',  'HW-SLIDE-500', 20, 4, 14.00, NULL, NULL, NULL, 'Blum UK'),
    (uid, 'PVC edge band 22mm white','Edge Band','EB-PVC-22W',    2, 1, 18.00, NULL,   22, 50.00, 'Hafele');

  -- ------------------------------------------------------------------
  -- 6. SEED — cutlist + parts (in Kitchen Renovation)
  -- ------------------------------------------------------------------
  INSERT INTO public.cutlists (user_id, project_id, name, position)
       VALUES (uid, proj_kitchen, 'Main', 0)
    RETURNING id INTO cl_main;

  INSERT INTO public.sheets
              (user_id, project_id, cutlist_id, position, name, w_mm, h_mm, qty, kerf_mm, grain)
       VALUES
    (uid, proj_kitchen, cl_main, 0, '18mm Birch Plywood', 2440, 1220, 3, 3, 'none');

  INSERT INTO public.pieces
              (user_id, project_id, cutlist_id, position, label, w_mm, h_mm, qty, grain)
       VALUES
    (uid, proj_kitchen, cl_main, 0, 'Side Panel',   590, 762, 2, 'none'),
    (uid, proj_kitchen, cl_main, 1, 'Top / Bottom', 572, 590, 2, 'none'),
    (uid, proj_kitchen, cl_main, 2, 'Shelf',        572, 559, 3, 'none'),
    (uid, proj_kitchen, cl_main, 3, 'Back Panel',   590, 762, 1, 'none'),
    (uid, proj_kitchen, cl_main, 4, 'Door',         292, 749, 2, 'none');

  -- ------------------------------------------------------------------
  -- 7. SEED — quote QUO-0001 (Kitchen Renovation / Smith)
  -- ------------------------------------------------------------------
  INSERT INTO public.quotes
              (user_id, project_id, client_id, status, date, notes,
               markup, tax, quote_number)
       VALUES (uid, proj_kitchen, smith_id, 'draft', CURRENT_DATE,
               'Demo quote — Base 600 cabinet, hinges, install.',
               0, 0, 'QUO-0001')
    RETURNING id INTO q_id;

  -- 7a. Cabinet line (Base 600)
  INSERT INTO public.quote_lines
              (quote_id, user_id, position, line_kind,
               name, type, w_mm, h_mm, d_mm, qty,
               material, finish, construction, base_type,
               door_count, door_pct, drawer_count,
               fixed_shelves, adj_shelves,
               labour_hours, labour_override)
       VALUES (q_id, uid, 0, 'cabinet',
               'Base 600', 'base', 600, 720, 560, 1,
               '18mm Birch Plywood', 'None', 'overlay', 'plinth',
               2, 95, 0,
               1, 0,
               4, false);

  -- 7b. Item line (hinges)
  INSERT INTO public.quote_lines
              (quote_id, user_id, position, line_kind,
               name, qty, unit_price)
       VALUES (q_id, uid, 1, 'item',
               'Soft-close hinges', 4, 8.00);

  -- 7c. Labour line (install)
  INSERT INTO public.quote_lines
              (quote_id, user_id, position, line_kind,
               name, labour_hours, unit_price)
       VALUES (q_id, uid, 2, 'labour',
               'Install on site', 4, 45.00);

  -- ------------------------------------------------------------------
  -- 8. SEED — order ORD-0001 (Lakehouse New Build / Greenwood)
  -- ------------------------------------------------------------------
  INSERT INTO public.orders
              (user_id, project_id, client_id, status, due, value,
               markup, tax, order_number,
               production_start_date, priority, auto_schedule, run_over_hours,
               sidebar_order_index, notes)
       VALUES (uid, proj_lakehouse, green_id, 'production',
               CURRENT_DATE + INTERVAL '14 days', 375.00,
               0, 0, 'ORD-0001',
               CURRENT_DATE, 0, true, 0,
               0, 'Demo order — Wall 600 + delivery.')
    RETURNING id INTO o_id;

  -- 8a. Cabinet line (Wall 600)
  INSERT INTO public.order_lines
              (order_id, user_id, position, line_kind,
               name, type, w_mm, h_mm, d_mm, qty,
               material, finish, construction, base_type,
               door_count, door_pct, drawer_count,
               fixed_shelves, adj_shelves,
               labour_hours, labour_override)
       VALUES (o_id, uid, 0, 'cabinet',
               'Wall 600', 'wall', 600, 720, 330, 1,
               '18mm Birch Plywood', 'None', 'overlay', 'none',
               2, 95, 0,
               2, 0,
               3, false);

  -- 8b. Item line (delivery)
  INSERT INTO public.order_lines
              (order_id, user_id, position, line_kind,
               name, qty, unit_price)
       VALUES (o_id, uid, 1, 'item',
               'Delivery to site', 1, 75.00);

  -- ------------------------------------------------------------------
  -- 9. Done.
  -- ------------------------------------------------------------------
  RAISE NOTICE 'Demo data reset complete.';
  RAISE NOTICE '  3 clients, 3 projects, 5 stock items, 3 cabinet templates.';
  RAISE NOTICE '  1 cutlist (5 pieces, 1 sheet), 1 quote (QUO-0001), 1 order (ORD-0001).';
END $$;


-- ============================================================================
-- VERIFICATION — run this after the DO block to confirm counts.
-- ============================================================================
WITH u AS (
  SELECT id AS uid FROM auth.users WHERE email = 'adam.denney@hotmail.com'
)
SELECT 'clients'           AS table_name, COUNT(*) AS rows FROM public.clients,           u WHERE clients.user_id           = u.uid
UNION ALL
SELECT 'projects',                       COUNT(*)            FROM public.projects,          u WHERE projects.user_id          = u.uid
UNION ALL
SELECT 'stock_items',                    COUNT(*)            FROM public.stock_items,       u WHERE stock_items.user_id       = u.uid
UNION ALL
SELECT 'cabinet_templates',              COUNT(*)            FROM public.cabinet_templates, u WHERE cabinet_templates.user_id = u.uid
UNION ALL
SELECT 'cutlists',                       COUNT(*)            FROM public.cutlists,          u WHERE cutlists.user_id          = u.uid
UNION ALL
SELECT 'sheets',                         COUNT(*)            FROM public.sheets,            u WHERE sheets.user_id            = u.uid
UNION ALL
SELECT 'pieces',                         COUNT(*)            FROM public.pieces,            u WHERE pieces.user_id            = u.uid
UNION ALL
SELECT 'quotes',                         COUNT(*)            FROM public.quotes,            u WHERE quotes.user_id            = u.uid
UNION ALL
SELECT 'quote_lines',                    COUNT(*)            FROM public.quote_lines,       u WHERE quote_lines.user_id       = u.uid
UNION ALL
SELECT 'orders',                         COUNT(*)            FROM public.orders,            u WHERE orders.user_id            = u.uid
UNION ALL
SELECT 'order_lines',                    COUNT(*)            FROM public.order_lines,       u WHERE order_lines.user_id       = u.uid
ORDER BY 1;
-- Expected:
--   cabinet_templates 3
--   clients           3
--   cutlists          1
--   order_lines       2
--   orders            1
--   pieces            5
--   projects          3
--   quote_lines       3
--   quotes            1
--   sheets            1
--   stock_items       5
