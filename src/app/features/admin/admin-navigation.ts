/**
 * Anotacion de responsabilidad: Archivo de soporte del sistema de Admin Navigation; concentra la responsabilidad de este modulo dentro de app/features/admin. Incluye principalmente: areasAdmin.
 */
export const areasAdmin = [
  {
    id: 'catalogo',
    numero: '01',
    titulo: 'Catálogo',
    descripcion: 'Todo lo que tu público va a descubrir en pantalla.',
    enlaces: [
      {
        titulo: 'Películas',
        ruta: '/admin/peliculas',
        detalle: 'Fichas, afiches, clasificación y preventa',
      },
      { titulo: 'Géneros', ruta: '/admin/peliculas/generos', detalle: 'Organización del catálogo' },
    ],
  },
  {
    id: 'programacion',
    numero: '02',
    titulo: 'Salas y programación',
    descripcion: 'Organizá el espacio, los horarios y el valor de cada función.',
    enlaces: [
      { titulo: 'Salas', ruta: '/admin/salas', detalle: 'Distribución, nombres y disponibilidad' },
      {
        titulo: 'Funciones',
        ruta: '/admin/funciones',
        detalle: 'Altas, reprogramaciones y cancelaciones',
      },
      {
        titulo: 'Programación por días',
        ruta: '/admin/funciones/programacion',
        detalle: 'Funciones dentro de un rango de fechas',
      },
      {
        titulo: 'Precios y formatos',
        ruta: '/admin/precios',
        detalle: 'Tarifas, VIP, formato e idioma',
      },
    ],
  },
  {
    id: 'candy',
    numero: '03',
    titulo: 'Candy',
    descripcion: 'Gestioná los productos y combos que acompañan la experiencia.',
    enlaces: [
      {
        titulo: 'Productos',
        ruta: '/admin/candy/productos',
        detalle: 'Categorías, precios y stock',
      },
      { titulo: 'Combos', ruta: '/admin/candy/combos', detalle: 'Componentes y entrada opcional' },
    ],
  },
  {
    id: 'promociones',
    numero: '04',
    titulo: 'Promociones',
    descripcion: 'Beneficios para la primera visita y para quienes vuelven.',
    enlaces: [
      {
        titulo: 'Cupones y bienvenida',
        ruta: '/admin/cupones',
        detalle: 'Descuentos, vigencia y segmentación',
      },
      {
        titulo: 'Recompensas',
        ruta: '/admin/recompensas',
        detalle: 'Canjes de entradas y productos por puntos',
      },
    ],
  },
  {
    id: 'operacion',
    numero: '05',
    titulo: 'Operación y accesos',
    descripcion: 'Controlá las prestaciones y los permisos de tu equipo.',
    enlaces: [
      {
        titulo: 'Validación de compras',
        ruta: '/admin/entradas',
        detalle: 'Ingreso a sala y retiro de candy',
      },
      {
        titulo: 'Usuarios y roles',
        ruta: '/admin/usuarios',
        detalle: 'Estado y acceso de cuentas existentes',
      },
      { titulo: 'Auditoría', ruta: '/admin/auditoria', detalle: 'Acciones, responsables y fechas' },
    ],
  },
  {
    id: 'reportes',
    numero: '06',
    titulo: 'Reportes',
    descripcion: 'Consultá resultados y llevá los datos a PDF o Excel.',
    enlaces: [
      {
        titulo: 'Ventas',
        ruta: '/admin/reportes/ventas',
        detalle: 'Compras, entradas y totales por período',
      },
      {
        titulo: 'Películas',
        ruta: '/admin/reportes/peliculas',
        detalle: 'Ventas e ingresos validados',
      },
      {
        titulo: 'Candy',
        ruta: '/admin/reportes/candy',
        detalle: 'Unidades vendidas, incluidos combos',
      },
    ],
  },
] as const;
