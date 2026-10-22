-- Append-only payment ledger. Clients access it only through the authenticated Edge handler.
create table public.orbita_payments (
 id uuid primary key, at timestamptz not null default now(), actor uuid not null references public.orbita_profiles(id),
 teacher_id uuid not null references public.orbita_profiles(id), month text not null check(month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 subject text not null check(length(subject) between 1 and 80), lesson_type text not null check(lesson_type in ('group','individual')),
 minutes integer not null check(minutes<>0 and abs(minutes)<=60000), note text not null default '' check(length(note)<=500)
);
alter table public.orbita_payments enable row level security;
revoke all on public.orbita_payments from public,anon,authenticated;
grant select,insert on public.orbita_payments to service_role;
create index orbita_payments_period on public.orbita_payments(month,teacher_id);

create function public.orbita_record_payment(p_actor uuid,p_iat bigint,p_id uuid,p_teacher uuid,p_month text,p_subject text,p_type text,p_minutes integer,p_note text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor public.orbita_profiles; stored public.orbita_payments;
begin
 select * into actor from public.orbita_profiles where id=p_actor for share;
 if not found or actor.disabled or actor.must_change or p_iat<=actor.invalid_before or actor.role not in ('owner','admin') then raise exception using errcode='42501',message='Access denied'; end if;
 -- Idempotent retries cannot create a second payment.
 insert into public.orbita_payments(id,actor,teacher_id,month,subject,lesson_type,minutes,note)
 values(p_id,p_actor,p_teacher,p_month,p_subject,p_type,p_minutes,p_note) on conflict(id) do nothing;
 select * into stored from public.orbita_payments where id=p_id;
 if stored.actor<>p_actor or stored.teacher_id<>p_teacher or stored.month<>p_month or stored.subject<>p_subject or stored.lesson_type<>p_type or stored.minutes<>p_minutes or stored.note<>p_note then raise exception using errcode='40001',message='Payment ID already used'; end if;
 if not exists(select 1 from public.orbita_audit where action='payment:record' and target=p_id::text) then
  insert into public.orbita_audit(actor,action,target) values(p_actor,'payment:record',p_id::text);
 end if;
 return to_jsonb(stored);
end; $$;
revoke all on function public.orbita_record_payment(uuid,bigint,uuid,uuid,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.orbita_record_payment(uuid,bigint,uuid,uuid,text,text,text,integer,text) to service_role;

create or replace function public.orbita_journal_backup()
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'format','orbita-journal','formatVersion',1,'createdAt',statement_timestamp(),
  'groups',coalesce((select jsonb_agg(g.payload||jsonb_build_object('version',g.version) order by g.id) from public.orbita_groups g),'[]'::jsonb),
  'lessons',coalesce((select jsonb_agg(l.payload||jsonb_build_object('version',l.version) order by l.date,l.start,l.id) from public.orbita_lessons l),'[]'::jsonb),
  'users',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'login',p.login,'role',p.role,'subjects',p.subjects,'disabled',p.disabled) order by p.id) from public.orbita_profiles p),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.at,p.id) from public.orbita_payments p),'[]'::jsonb)
 );
$$;

create function public.orbita_purge_trash(p_actor uuid,p_iat bigint,p_request uuid,p_items jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor public.orbita_profiles; item jsonb; previous jsonb; result jsonb; n integer; child jsonb;
begin
 lock table public.orbita_groups,public.orbita_lessons in share row exclusive mode;
 select * into actor from public.orbita_profiles where id=p_actor for share;
 if not found or actor.disabled or actor.must_change or p_iat<=actor.invalid_before or actor.role<>'owner' then raise exception using errcode='42501',message='Access denied'; end if;
 select summary into result from public.orbita_imports where id=p_request::text and source='orbita-purge';
 if found then
  if result->>'actor'<>p_actor::text or result->'items'<>p_items then raise exception using errcode='40001',message='Request already used'; end if;
  return result;
 end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>5000 then raise exception 'Invalid selection'; end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if item->>'table'='groups' then
   if not exists(select 1 from public.orbita_groups where id=(item->>'id')::uuid and version=(item->>'version')::int and payload->>'deleted'='true') then raise exception using errcode='40001',message='Group changed'; end if;
   select coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version) order by id),'[]'::jsonb) into child from public.orbita_lessons where group_id=(item->>'id')::uuid;
   if child is distinct from item->'children' then raise exception using errcode='40001',message='Group lessons changed'; end if;
  elsif item->>'table'='lessons' then
   if not exists(select 1 from public.orbita_lessons where id=(item->>'id')::uuid and version=(item->>'version')::int and payload->>'deleted'='true') then raise exception using errcode='40001',message='Lesson changed'; end if;
  else raise exception 'Invalid table'; end if;
 end loop;
 previous:=public.orbita_journal_backup(); n:=0;
 for item in select value from jsonb_array_elements(p_items) loop
  if item->>'table'='groups' then
   delete from public.orbita_lessons where group_id=(item->>'id')::uuid;
   delete from public.orbita_groups where id=(item->>'id')::uuid;
  else delete from public.orbita_lessons where id=(item->>'id')::uuid; end if;
  n:=n+1;
 end loop;
 result:=jsonb_build_object('actor',p_actor,'items',p_items,'removed',n,'backupId',p_request);
 insert into public.orbita_imports(id,source,summary,snapshot) values(p_request::text,'orbita-purge',result,previous);
 insert into public.orbita_audit(actor,action,target) values(p_actor,'purge:trash',p_request::text);
 return result;
end; $$;
revoke all on function public.orbita_purge_trash(uuid,bigint,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.orbita_purge_trash(uuid,bigint,uuid,jsonb) to service_role;
