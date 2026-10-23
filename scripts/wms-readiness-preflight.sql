-- Read-only production preflight. Fails closed; never creates locations, stock or permissions.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $$
DECLARE outlet_row record; division_name text; kind_name text; location_row record; outlet_count integer := 0; issue_count integer := 0; valid_count integer;
BEGIN
  FOR outlet_row IN SELECT DISTINCT o.id, o.code FROM outlets o JOIN staff_profiles s ON s.outlet_id=o.id WHERE o.status='active' AND s.status='active' AND s.role IN ('Owner','Manajer') LOOP
    outlet_count := outlet_count + 1;
    FOR division_name IN SELECT unnest(ARRAY['bar','dapur']) LOOP
      FOREACH kind_name IN ARRAY ARRAY['main',division_name,'transit','damaged'] LOOP
        SELECT count(*) INTO valid_count FROM wms_closing_location l JOIN wms_warehouse w ON w.id=l.warehouse_id WHERE l.outlet_id=outlet_row.id AND l.kind=kind_name AND l.area IN (division_name,'umum');
        IF valid_count=0 THEN
          issue_count := issue_count + 1;
          RAISE WARNING 'WMS readiness: outlet %, division %, missing location kind %',outlet_row.code,division_name,kind_name;
        END IF;
      END LOOP;
      FOR location_row IN SELECT l.* FROM wms_closing_location l JOIN wms_warehouse w ON w.id=l.warehouse_id WHERE l.outlet_id=outlet_row.id AND l.kind IN ('main',division_name) AND l.area IN (division_name,'umum') LOOP
        SELECT count(*) INTO valid_count FROM wms_closing_access a JOIN staff_profiles s ON s.user_id=a.user_id WHERE a.outlet_id=outlet_row.id AND a.warehouse_id=location_row.warehouse_id AND s.outlet_id=outlet_row.id AND s.status='active' AND s.role='Kasir' AND ((location_row.kind='main' AND a.capability='warehouse') OR (location_row.kind=division_name AND a.capability=division_name AND s.workstation IN (division_name,'all','helper_'||division_name,'helper_all')));
        IF valid_count=0 THEN
          issue_count := issue_count + 1;
          RAISE WARNING 'WMS readiness: outlet %, division %, mapped % location has no compatible active staff assignment',outlet_row.code,division_name,location_row.kind;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  IF outlet_count=0 THEN RAISE EXCEPTION 'WMS release blocked: no active outlet with management profile'; END IF;
  IF issue_count>0 THEN RAISE EXCEPTION 'WMS release blocked: % location/access readiness checks failed; no configuration or stock was changed',issue_count; END IF;
  RAISE NOTICE 'WMS location/access preflight passed for % active outlets; read-only inspection',outlet_count;
END $$;
COMMIT;
