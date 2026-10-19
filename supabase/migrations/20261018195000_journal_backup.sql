-- Calendar data snapshot: one SQL statement reads a consistent MVCC snapshot.
-- This is an application backup, not an Auth/database dump.
create or replace function public.orbita_journal_backup()
returns jsonb language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object(
  'format','orbita-journal','formatVersion',1,'createdAt',statement_timestamp(),
  'groups',coalesce((select jsonb_agg(g.payload || jsonb_build_object('version',g.version) order by g.id) from public.orbita_groups g),'[]'::jsonb),
  'lessons',coalesce((select jsonb_agg(l.payload || jsonb_build_object('version',l.version) order by l.date,l.start,l.id) from public.orbita_lessons l),'[]'::jsonb),
  'users',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'login',p.login,'role',p.role,'subjects',p.subjects,'disabled',p.disabled) order by p.id) from public.orbita_profiles p),'[]'::jsonb)
 );
$$;
revoke all on function public.orbita_journal_backup() from public, anon, authenticated;
grant execute on function public.orbita_journal_backup() to service_role;
-- The DDL event trigger still runs as its owner; clients need no EXECUTE grant.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
