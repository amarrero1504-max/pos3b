-- Corre ESTO primero si fix_disk_io_indexes.sql falló con 42P01.
-- Te dice qué tablas existen en el proyecto al que está conectado el SQL Editor.

select c.relname as tabla,
       case when c.relname is not null then 'OK' else 'FALTA' end as estado
from (values
  ('contabilidad_notificaciones'),
  ('pos_presencia_sucursal'),
  ('productos'),
  ('usuarios'),
  ('pos_autorizacion_turno_fh'),
  ('movimientos_inventario'),
  ('ventas'),
  ('logins')
) as needed(tabla)
left join pg_class c
  on c.relname = needed.tabla and c.relkind = 'r'
left join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
order by needed.tabla;

-- Si contabilidad_notificaciones sale FALTA aquí pero el POS en producción sí
-- muestra notificaciones, el SQL Editor está apuntando a OTRO proyecto/branch.
select current_database() as database,
       current_user as db_user,
       inet_server_addr() as server;
