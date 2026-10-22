-- Only the authenticated Edge handler may call this atomic operation.
create or replace function public.orbita_apply_transfer(p_actor uuid,p_iat bigint,p_kind text,p_request uuid,p_digest text,p_changes jsonb,p_checks jsonb,p_summary jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor public.orbita_profiles; item jsonb; v_payload jsonb; current_version integer; previous jsonb; result jsonb; stored public.orbita_imports;
begin
 if p_kind not in ('csv','restore','students','calendar') or p_digest !~ '^[0-9a-f]{64}$' then raise exception 'Invalid transfer'; end if;
 -- Block ordinary writes while checking the preview and saving the before-image.
 lock table public.orbita_groups,public.orbita_lessons,public.orbita_payments in share row exclusive mode;
 select * into actor from public.orbita_profiles where id=p_actor for share;
 if not found or actor.disabled or actor.must_change or p_iat<=actor.invalid_before or (actor.role not in ('owner','admin') and not (actor.role='teacher' and p_kind in ('calendar','students'))) or (p_kind='restore' and actor.role<>'owner') then raise exception using errcode='42501',message='Access denied'; end if;
 select * into stored from public.orbita_imports where id=p_request::text;
 if found then
  if stored.summary->>'actor'<>p_actor::text or stored.summary->>'digest'<>p_digest then raise exception using errcode='40001',message='Request already used'; end if;
  return stored.summary;
 end if;
 if jsonb_typeof(p_changes->'groups')<>'array' or jsonb_typeof(p_changes->'lessons')<>'array' or jsonb_typeof(p_checks->'groups')<>'array' or jsonb_typeof(p_checks->'lessons')<>'array' or jsonb_array_length(p_changes->'groups')>1000 or jsonb_array_length(p_changes->'lessons')>5000 then raise exception 'Invalid changes'; end if;
 if (select count(*) from public.orbita_groups)<>jsonb_array_length(p_checks->'groups') or (select count(*) from public.orbita_lessons)<>jsonb_array_length(p_checks->'lessons') then raise exception using errcode='40001',message='Preview expired'; end if;
 for item in select value from jsonb_array_elements(p_checks->'groups') loop
  if not exists(select 1 from public.orbita_groups where id=(item->>'id')::uuid and version=(item->>'version')::int) then raise exception using errcode='40001',message='Group changed'; end if;
 end loop;
 for item in select value from jsonb_array_elements(p_checks->'lessons') loop
  if not exists(select 1 from public.orbita_lessons where id=(item->>'id')::uuid and version=(item->>'version')::int) then raise exception using errcode='40001',message='Lesson changed'; end if;
 end loop;
 if p_kind='calendar' and jsonb_array_length(p_changes->'groups')<>0 then raise exception 'Calendar cannot change groups'; end if;
 -- Payments are immutable ledger entries. Only an owner restore can insert missing IDs.
 if jsonb_typeof(coalesce(p_changes->'payments','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_changes->'payments','[]'::jsonb))>10000 then raise exception 'Invalid payments'; end if;
 if jsonb_array_length(coalesce(p_changes->'payments','[]'::jsonb))>0 and p_kind<>'restore' then raise exception using errcode='42501',message='Only restore may recover payments'; end if;
 if jsonb_array_length(coalesce(p_changes->'payments','[]'::jsonb))>0 and p_checks->'payments' is null then raise exception 'Payment checks required'; end if;
 if p_checks->'payments' is not null then
  if jsonb_typeof(p_checks->'payments')<>'array' or (select count(*) from public.orbita_payments)<>jsonb_array_length(p_checks->'payments') then raise exception using errcode='40001',message='Payments changed'; end if;
  for item in select value from jsonb_array_elements(p_checks->'payments') loop
   if not exists(select 1 from public.orbita_payments p where p.id=(item->>'id')::uuid and p.at=(item->>'at')::timestamptz and p.actor=(item->>'actor')::uuid and p.teacher_id=(item->>'teacher_id')::uuid and p.month=item->>'month' and p.subject=item->>'subject' and p.lesson_type=item->>'lesson_type' and p.minutes=(item->>'minutes')::int and p.note=item->>'note') then raise exception using errcode='40001',message='Payment changed'; end if;
  end loop;
 end if;
 previous:=public.orbita_journal_backup();
 for item in select value from jsonb_array_elements(p_changes->'groups') loop
  v_payload:=item->'payload';select version into current_version from public.orbita_groups where id=(v_payload->>'id')::uuid;
  if coalesce(current_version,0)<>(item->>'expectedVersion')::int then raise exception using errcode='40001',message='Group version changed'; end if;
  v_payload:=jsonb_set(v_payload,'{version}',to_jsonb(coalesce(current_version,0)+1));
  if current_version is null then
   insert into public.orbita_groups(id,teacher_id,payload,version) values((v_payload->>'id')::uuid,nullif(v_payload->>'teacherId','')::uuid,v_payload,1);
  else update public.orbita_groups set teacher_id=nullif(v_payload->>'teacherId','')::uuid,payload=v_payload,version=current_version+1 where id=(v_payload->>'id')::uuid; end if;
 end loop;
 for item in select value from jsonb_array_elements(p_changes->'lessons') loop
  v_payload:=item->'payload';select version into current_version from public.orbita_lessons where id=(v_payload->>'id')::uuid;
  if coalesce(current_version,0)<>(item->>'expectedVersion')::int then raise exception using errcode='40001',message='Lesson version changed'; end if;
  v_payload:=jsonb_set(v_payload,'{version}',to_jsonb(coalesce(current_version,0)+1));
  if current_version is null then
   insert into public.orbita_lessons(id,group_id,date,start,payload,version) values((v_payload->>'id')::uuid,(v_payload->>'groupId')::uuid,(v_payload->>'date')::date,(v_payload->>'start')::time,v_payload,1);
  else update public.orbita_lessons set group_id=(v_payload->>'groupId')::uuid,date=(v_payload->>'date')::date,start=(v_payload->>'start')::time,payload=v_payload,version=current_version+1 where id=(v_payload->>'id')::uuid; end if;
 end loop;
 for item in select value from jsonb_array_elements(coalesce(p_changes->'payments','[]'::jsonb)) loop
  insert into public.orbita_payments(id,at,actor,teacher_id,month,subject,lesson_type,minutes,note)
  values((item->>'id')::uuid,(item->>'at')::timestamptz,(item->>'actor')::uuid,(item->>'teacher_id')::uuid,item->>'month',item->>'subject',item->>'lesson_type',(item->>'minutes')::int,item->>'note');
 end loop;
 result:=p_summary||jsonb_build_object('actor',p_actor,'digest',p_digest,'backupId',p_request,'kind',p_kind,'at',statement_timestamp());
 insert into public.orbita_imports(id,source,summary,snapshot) values(p_request::text,'orbita-'||p_kind,result,previous);
 insert into public.orbita_audit(actor,action,target) values(p_actor,case when p_kind='csv' then 'import:csv' when p_kind='students' then 'update:students' when p_kind='calendar' then 'generate:calendar' else 'restore:journal' end,p_request::text);
 return result;
end; $$;
revoke all on function public.orbita_apply_transfer(uuid,bigint,text,uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.orbita_apply_transfer(uuid,bigint,text,uuid,text,jsonb,jsonb,jsonb) to service_role;
