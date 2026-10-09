/**
 * Anotacion de responsabilidad: Modelos, tipos y reglas compartidas de Rol.Model; concentra la responsabilidad de este modulo dentro de app/core/auth. Incluye principalmente: Rol, esRol, destinoPorRol, retornoSeguro.
 */
export type Rol = 'cliente' | 'empleado' | 'administrador';

export function esRol(rol: unknown): rol is Rol {
  return rol === 'cliente' || rol === 'empleado' || rol === 'administrador';
}

export function destinoPorRol(rol: Rol | null): string {
  switch (rol) {
    case 'administrador':
      return '/admin';
    case 'empleado':
      return '/empleados/entrada';
    default:
      return '/perfil';
  }
}

export function retornoSeguro(url: string | null, rol: Rol | null): string {
  if (!url || !url.startsWith('/') || url.startsWith('//') || /[\\\s]/.test(url)) {
    return destinoPorRol(rol);
  }
  const ruta = url.split(/[?#]/)[0];
  if (
    /^\/auth(?:\/|$)/.test(ruta) ||
    (/^\/admin(?:\/|$)/.test(ruta) && rol !== 'administrador') ||
    (/^\/empleados(?:\/|$)/.test(ruta) && rol !== 'empleado')
  ) {
    return destinoPorRol(rol);
  }
  return url;
}
