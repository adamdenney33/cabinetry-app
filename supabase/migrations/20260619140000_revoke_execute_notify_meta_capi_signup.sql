-- Security hardening (debug audit S1). notify_meta_capi_signup() is a
-- SECURITY DEFINER *trigger* function (fired by trg_meta_capi_signup AFTER
-- INSERT on auth.users). It does not need to be callable over the REST RPC
-- endpoint, but EXECUTE was granted to PUBLIC (inherited by anon +
-- authenticated), so /rest/v1/rpc/notify_meta_capi_signup was reachable.
-- Revoke that exposure. postgres + service_role keep EXECUTE, and the trigger
-- still fires as the definer regardless of this grant.
revoke execute on function public.notify_meta_capi_signup() from public, anon, authenticated;
