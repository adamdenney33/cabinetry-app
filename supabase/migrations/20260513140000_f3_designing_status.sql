-- F3 (2026-05-13): Replace the [CB_DRAFT] notes-tag workaround with a real
-- status value. Cabinet Builder workspaces are now status='designing' quotes,
-- not notes-prefixed quotes. The notes field becomes pure free-text.
--
-- Status enum is free-form text today (no DB constraint); 'designing' joins
-- the existing values (draft, sent, approved, rejected, etc.) without DDL.
--
-- Applied 2026-05-13 via Supabase MCP.

update public.quotes
  set status = 'designing'
  where notes like '[CB_DRAFT]%';

update public.quotes
  set notes = nullif(trim(regexp_replace(notes, '^\[CB_DRAFT\]\s*', '')), '')
  where notes like '[CB_DRAFT]%';
