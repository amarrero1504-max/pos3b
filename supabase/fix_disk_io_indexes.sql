-- Índices para bajar Disk IO en consultas frecuentes del POS.
-- Seguro de re-ejecutar. NO falla si falta alguna tabla (CREATE solo si existe).
--
-- Si viste:
--   ERROR: 42P01: relation "public.contabilidad_notificaciones" does not exist
-- usa ESTA versión (la anterior asumía que todas las tablas del POS ya existían).
--
-- Opcional: primero corre diagnostico_disk_io.sql para ver seq scans.

create or replace function public._pos3b_create_index_if_table_exists(
  p_table regclass,
  p_index_name text,
  p_index_sql text
) returns text
language plpgsql
as $$
begin
  if p_table is null then
    return 'SKIP (tabla no existe): ' || p_index_name;
  end if;
  if to_regclass('public.' || p_index_name) is not null
     or exists (
       select 1 from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'i' and c.relname = p_index_name
     )
  then
    return 'OK (ya existe): ' || p_index_name;
  end if;
  execute p_index_sql;
  return 'CREATED: ' || p_index_name;
exception when others then
  return 'ERROR ' || p_index_name || ': ' || SQLERRM;
end;
$$;

-- Reporte de qué se creó / se saltó
do $$
declare
  r text;
  results text[] := array[]::text[];
begin
  -- ---- Notificaciones (si existe la tabla) ----
  select public._pos3b_create_index_if_table_exists(
    to_regclass('public.contabilidad_notificaciones'),
    'idx_cont_notif_estado_tipo_created',
    $i$create index idx_cont_notif_estado_tipo_created
      on public.contabilidad_notificaciones (estado, tipo, created_at desc)$i$
  ) into r; results := array_append(results, r);

  select public._pos3b_create_index_if_table_exists(
    to_regclass('public.contabilidad_notificaciones'),
    'idx_cont_notif_estado_suc_created',
    $i$create index idx_cont_notif_estado_suc_created
      on public.contabilidad_notificaciones (estado, sucursal_id, created_at desc)$i$
  ) into r; results := array_append(results, r);

  -- ---- Presencia ----
  select public._pos3b_create_index_if_table_exists(
    to_regclass('public.pos_presencia_sucursal'),
    'idx_pos_presencia_last_seen',
    $i$create index idx_pos_presencia_last_seen
      on public.pos_presencia_sucursal (last_seen desc)$i$
  ) into r; results := array_append(results, r);

  -- ---- Productos / usuarios / auth turno ----
  select public._pos3b_create_index_if_table_exists(
    to_regclass('public.productos'),
    'idx_productos_nombre',
    $i$create index idx_productos_nombre on public.productos (nombre)$i$
  ) into r; results := array_append(results, r);

  select public._pos3b_create_index_if_table_exists(
    to_regclass('public.usuarios'),
    'idx_usuarios_pin',
    $i$create index idx_usuarios_pin on public.usuarios (pin)$i$
  ) into r; results := array_append(results, r);

  select public._pos3b_create_index_if_table_exists(
    to_regclass('public.pos_autorizacion_turno_fh'),
    'idx_pos_auth_fh_user_suc_exp',
    $i$create index idx_pos_auth_fh_user_suc_exp
      on public.pos_autorizacion_turno_fh (usuario_id, sucursal_id, expira_en)$i$
  ) into r; results := array_append(results, r);

  -- ---- movimientos_inventario (~150k+ filas: la más crítica para Disk IO) ----
  select public._pos3b_create_index_if_table_exists(
    to_regclass('public.movimientos_inventario'),
    'idx_mov_inv_created_id',
    $i$create index idx_mov_inv_created_id
      on public.movimientos_inventario (created_at desc, id desc)$i$
  ) into r; results := array_append(results, r);

  select public._pos3b_create_index_if_table_exists(
    to_regclass('public.movimientos_inventario'),
    'idx_mov_inv_sucursal_created',
    $i$create index idx_mov_inv_sucursal_created
      on public.movimientos_inventario (sucursal_id, created_at desc)$i$
  ) into r; results := array_append(results, r);

  select public._pos3b_create_index_if_table_exists(
    to_regclass('public.movimientos_inventario'),
    'idx_mov_inv_producto_created',
    $i$create index idx_mov_inv_producto_created
      on public.movimientos_inventario (producto_id, created_at desc)$i$
  ) into r; results := array_append(results, r);

  -- ---- ventas / logins (tablas grandes) ----
  select public._pos3b_create_index_if_table_exists(
    to_regclass('public.ventas'),
    'idx_ventas_sucursal_created',
    $i$create index idx_ventas_sucursal_created
      on public.ventas (sucursal_id, created_at desc)$i$
  ) into r; results := array_append(results, r);

  select public._pos3b_create_index_if_table_exists(
    to_regclass('public.logins'),
    'idx_logins_created',
    $i$create index idx_logins_created on public.logins (created_at desc)$i$
  ) into r; results := array_append(results, r);

  raise notice '%', array_to_string(results, E'\n');
end $$;

-- ANALYZE solo si la tabla existe
do $$
begin
  if to_regclass('public.contabilidad_notificaciones') is not null then
    analyze public.contabilidad_notificaciones;
  end if;
  if to_regclass('public.pos_presencia_sucursal') is not null then
    analyze public.pos_presencia_sucursal;
  end if;
  if to_regclass('public.productos') is not null then
    analyze public.productos;
  end if;
  if to_regclass('public.usuarios') is not null then
    analyze public.usuarios;
  end if;
  if to_regclass('public.pos_autorizacion_turno_fh') is not null then
    analyze public.pos_autorizacion_turno_fh;
  end if;
  if to_regclass('public.movimientos_inventario') is not null then
    analyze public.movimientos_inventario;
  end if;
  if to_regclass('public.ventas') is not null then
    analyze public.ventas;
  end if;
  if to_regclass('public.logins') is not null then
    analyze public.logins;
  end if;
end $$;

-- Limpieza del helper (opcional; déjalo si quieres reusar)
drop function if exists public._pos3b_create_index_if_table_exists(regclass, text, text);

-- Verificación rápida: ¿existe contabilidad_notificaciones en ESTE proyecto?
select
  to_regclass('public.contabilidad_notificaciones') as contabilidad_notificaciones,
  to_regclass('public.movimientos_inventario') as movimientos_inventario,
  to_regclass('public.usuarios') as usuarios;
