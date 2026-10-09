-- SOLO LECTURA. Ejecutar antes de la nueva migración y guardar resultados.
select table_name,column_name,data_type,udt_name,column_default
from information_schema.columns where table_schema='public' and (
 (table_name in('peliculas','cine_funciones') and column_name in('idioma','formato','clasificacion')) or
 (table_name='perfiles' and column_name in('id','rol','activo','fecha_nacimiento','grupo_sanguineo','color_ojos','vacaciones_anuales'))
) order by table_name,column_name;

select proname,oid::regprocedure as firma from pg_proc where pronamespace='public'::regnamespace
and proname in('cine_ofertas_admin','cine_guardar_oferta','cine_crear_funcion','cine_guardar_pelicula','cine_cotizar','cine_checkout','cine_comprobante','cine_detalle_reserva','cine_mis_beneficios');

select s.id,s.nombre,s.filas,s.columnas,count(distinct r.id) filter(where f.fin>now() and (r.estado='confirmada' or (r.estado='pendiente' and r.vence>now()))) compras_futuras
from public.cine_salas s left join public.cine_funciones f on f.sala_id=s.id left join public.cine_reservas r on r.funcion_id=f.id group by s.id,s.nombre,s.filas,s.columnas;

select id,titulo,clasificacion,idioma,formato from public.peliculas where clasificacion::text not in('ATP','13','18');

select to_regclass('public.cine_configuracion') configuracion_nueva,
to_regclass('public.cine_eventos_publicos') eventos_nuevos;
