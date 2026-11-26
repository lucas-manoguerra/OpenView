-- Keep the project-level RLS event trigger, but prevent clients from invoking it
-- through the Data API as an arbitrary SECURITY DEFINER RPC.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
