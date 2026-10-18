-- Owner-only maintenance RPC. Invoked exclusively by the existing authenticated Edge Function
-- using the service role. No browser role is permitted to execute this RPC.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('orbita-private-backups','orbita-private-backups',false,15728640,ARRAY['application/json'])
ON CONFLICT (id) DO UPDATE SET public=false;

CREATE OR REPLACE FUNCTION public.orbita_maintenance(
 p_action text, p_scope text, p_filter jsonb, p_expected text, p_actor uuid,
 p_snapshot jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
 target_groups uuid[] := '{}'::uuid[];
 target_imports text[] := '{}'::text[];
 target_lessons uuid[] := '{}'::uuid[];
 signature text;
 group_count integer;
 lesson_count integer;
 report_count integer;
 import_count integer;
 marks_count integer;
 schedule_count integer;
 restored_groups integer;
 restored_lessons integer;
 restored_imports integer;
 actor_role text;
 one_id uuid;
 start_date date;
 end_date date;
 has_schedule boolean := false;
BEGIN
 SELECT role INTO actor_role FROM public.orbita_profiles WHERE id=p_actor AND disabled=false;
 IF actor_role IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'Only the owner can manage the database'; END IF;
 IF p_action NOT IN ('preview','purge','restore-merge','restore-replace') THEN RAISE EXCEPTION 'Invalid action'; END IF;
 IF p_action <> 'preview' THEN
   LOCK TABLE public.orbita_groups,public.orbita_lessons,public.orbita_imports IN SHARE ROW EXCLUSIVE MODE;
 END IF;
 IF p_scope NOT IN ('trash','archive','group','period','schedule','reset','imports') THEN RAISE EXCEPTION 'Invalid scope'; END IF;
 IF p_filter IS NULL THEN p_filter := '{}'::jsonb; END IF;
 IF p_scope = 'group' OR (p_scope='schedule' AND p_filter ? 'groupId') THEN
   IF coalesce(p_filter->>'groupId','') !~* '^[a-f0-9]{8}-([a-f0-9]{4}-){3}[a-f0-9]{12}$' THEN RAISE EXCEPTION 'Invalid group ID'; END IF;
   one_id := (p_filter->>'groupId')::uuid;
 END IF;
 IF p_scope='period' THEN
   IF coalesce(p_filter->>'from','') !~ '^\d{4}-\d\d-\d\d$' OR coalesce(p_filter->>'to','') !~ '^\d{4}-\d\d-\d\d$' THEN RAISE EXCEPTION 'Invalid period'; END IF;
   start_date := (p_filter->>'from')::date; end_date := (p_filter->>'to')::date;
   IF end_date < start_date THEN RAISE EXCEPTION 'Invalid date order'; END IF;
 END IF;
 CASE p_scope
 WHEN 'trash' THEN
   SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO target_lessons FROM public.orbita_lessons WHERE payload->>'deleted'='true';
 WHEN 'archive' THEN
   SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO target_groups FROM public.orbita_groups WHERE payload->>'archived'='true';
 WHEN 'group' THEN
   SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO target_groups FROM public.orbita_groups WHERE id=one_id AND payload->>'archived'='true';
 WHEN 'period' THEN
   SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO target_lessons FROM public.orbita_lessons WHERE date BETWEEN start_date AND end_date;
 WHEN 'schedule' THEN
   has_schedule:=true;
   SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO target_groups FROM public.orbita_groups WHERE (one_id IS NULL OR id=one_id) AND jsonb_array_length(coalesce(payload->'schedule','[]'::jsonb))>0;
 WHEN 'imports' THEN
   SELECT coalesce(array_agg(id),'{}'::text[]) INTO target_imports FROM public.orbita_imports;
 WHEN 'reset' THEN
   SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO target_groups FROM public.orbita_groups;
 END CASE;
 IF p_scope IN ('archive','group','reset') THEN
   SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO target_lessons FROM public.orbita_lessons WHERE group_id=ANY(target_groups);
 END IF;
 -- Fingerprint includes row IDs, versions and current scope so a stale preview fails closed.
 SELECT md5(p_scope||'|'||p_filter::text||'|'||
   coalesce((SELECT string_agg(id::text||':'||version::text,',' ORDER BY id) FROM public.orbita_groups WHERE id=ANY(target_groups)),'')||'|'||
   coalesce((SELECT string_agg(id::text||':'||version::text,',' ORDER BY id) FROM public.orbita_lessons WHERE id=ANY(target_lessons)),'')||'|'||
   coalesce((SELECT string_agg(id||':'||at::text,',' ORDER BY id) FROM public.orbita_imports WHERE id=ANY(target_imports) OR p_scope='reset'),'')
 ) INTO signature;
 SELECT count(*) INTO import_count FROM public.orbita_imports WHERE id=ANY(target_imports);
 SELECT count(*) INTO group_count FROM public.orbita_groups WHERE id=ANY(target_groups);
 SELECT count(*) INTO lesson_count FROM public.orbita_lessons WHERE id=ANY(target_lessons);
 SELECT count(*) INTO report_count FROM public.orbita_lessons WHERE id=ANY(target_lessons) AND nullif(payload->>'report','') IS NOT NULL;
 SELECT coalesce(sum(jsonb_object_length_safe(payload->'attendance')),0)::integer INTO marks_count FROM public.orbita_lessons WHERE id=ANY(target_lessons);
 SELECT coalesce(sum(jsonb_array_length(coalesce(payload->'schedule','[]'::jsonb))),0)::integer INTO schedule_count FROM public.orbita_groups WHERE id=ANY(target_groups);
 IF p_action='preview' THEN
   RETURN jsonb_build_object('signature',signature,'groups',group_count,'lessons',lesson_count,'reports',report_count,'attendanceMarks',marks_count,'scheduleRules',schedule_count,'imports',import_count,'scope',p_scope);
 END IF;
 IF p_expected IS NULL OR p_expected<>signature THEN RAISE EXCEPTION 'Preview is outdated, refresh it before continuing'; END IF;
 IF p_action='purge' THEN
   IF p_scope='imports' THEN
     DELETE FROM public.orbita_imports WHERE id=ANY(target_imports);
   ELSIF p_scope='schedule' THEN
     UPDATE public.orbita_groups SET payload=jsonb_set(payload,'{schedule}','[]'::jsonb,true),version=version+1 WHERE id=ANY(target_groups);
   ELSE
     DELETE FROM public.orbita_lessons WHERE id=ANY(target_lessons);
     DELETE FROM public.orbita_groups WHERE id=ANY(target_groups);
   END IF;
   INSERT INTO public.orbita_audit(actor,action,target) VALUES (p_actor,'purge:'||p_scope, left(p_scope||' groups='||group_count||' lessons='||lesson_count,200));
   RETURN jsonb_build_object('ok',true,'groups',group_count,'lessons',lesson_count,'scheduleRules',schedule_count,'imports',import_count);
 END IF;
 -- Restore only journal data; Auth, profiles and the historical audit trail are intentionally preserved.
 IF p_snapshot IS NULL OR p_snapshot->>'format' <> 'orbita-backup-v1' OR jsonb_typeof(p_snapshot->'rows'->'groups') <> 'array' OR jsonb_typeof(p_snapshot->'rows'->'lessons') <> 'array' OR jsonb_typeof(p_snapshot->'rows'->'imports') <> 'array' THEN RAISE EXCEPTION 'Invalid backup structure'; END IF;
 IF (SELECT count(*) FROM jsonb_to_recordset(p_snapshot->'rows'->'groups') AS g(id uuid,teacher_id uuid) LEFT JOIN public.orbita_profiles p ON p.id=g.teacher_id WHERE g.teacher_id IS NOT NULL AND p.id IS NULL)>0 THEN RAISE EXCEPTION 'Backup references unknown teachers in Auth'; END IF;
 IF (SELECT count(*) FROM jsonb_to_recordset(p_snapshot->'rows'->'lessons') AS l(id uuid,group_id uuid) WHERE NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(p_snapshot->'rows'->'groups') AS g(id uuid) WHERE g.id=l.group_id) AND NOT EXISTS(SELECT 1 FROM public.orbita_groups WHERE id=l.group_id))>0 THEN RAISE EXCEPTION 'Backup contains orphan lessons'; END IF;
 IF p_action='restore-replace' THEN
   DELETE FROM public.orbita_lessons; DELETE FROM public.orbita_groups; DELETE FROM public.orbita_imports;
 END IF;
 INSERT INTO public.orbita_groups(id,teacher_id,payload,version)
 SELECT x.id,x.teacher_id,x.payload,x.version FROM jsonb_to_recordset(p_snapshot->'rows'->'groups') AS x(id uuid,teacher_id uuid,payload jsonb,version int)
 ON CONFLICT(id) DO NOTHING;
 GET DIAGNOSTICS restored_groups=ROW_COUNT;
 INSERT INTO public.orbita_lessons(id,group_id,date,start,payload,version)
 SELECT x.id,x.group_id,x.date,x.start,x.payload,x.version FROM jsonb_to_recordset(p_snapshot->'rows'->'lessons') AS x(id uuid,group_id uuid,date date,start time,payload jsonb,version int)
 ON CONFLICT(id) DO NOTHING;
 GET DIAGNOSTICS restored_lessons=ROW_COUNT;
 INSERT INTO public.orbita_imports(id,at,source,summary,snapshot)
 SELECT x.id,x.at,x.source,x.summary,x.snapshot FROM jsonb_to_recordset(p_snapshot->'rows'->'imports') AS x(id text,at timestamptz,source text,summary jsonb,snapshot jsonb)
 ON CONFLICT(id) DO NOTHING;
 GET DIAGNOSTICS restored_imports=ROW_COUNT;
 INSERT INTO public.orbita_audit(actor,action,target) VALUES(p_actor,p_action,left('groups='||restored_groups||' lessons='||restored_lessons||' imports='||restored_imports,200));
 RETURN jsonb_build_object('ok',true,'groups',restored_groups,'lessons',restored_lessons,'imports',restored_imports);
END $$;

-- Wrapper avoids jsonb_object_length which PostgreSQL does not provide natively.
CREATE OR REPLACE FUNCTION public.jsonb_object_length_safe(input jsonb) RETURNS integer
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog
AS $$ SELECT CASE WHEN jsonb_typeof(input)='object' THEN (SELECT count(*)::integer FROM jsonb_object_keys(input)) ELSE 0 END $$;

REVOKE ALL ON FUNCTION public.orbita_maintenance(text,text,jsonb,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.orbita_maintenance(text,text,jsonb,text,uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.jsonb_object_length_safe(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.jsonb_object_length_safe(jsonb) TO service_role;
