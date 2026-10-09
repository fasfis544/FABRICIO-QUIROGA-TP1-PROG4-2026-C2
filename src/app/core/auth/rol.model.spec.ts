/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Rol.Model; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { destinoPorRol, esRol, retornoSeguro } from './rol.model';

describe('Roles y navegación segura', () => {
  it('solo reconoce roles operativos explícitos', () => {
    expect(esRol('administrador')).toBe(true);
    expect(esRol('empleado')).toBe(true);
    expect(esRol('cliente')).toBe(true);
    expect(esRol('otro')).toBe(false);
    expect(esRol(null)).toBe(false);
  });

  it('elige un destino por rol', () => {
    expect(destinoPorRol('empleado')).toBe('/empleados/entrada');
    expect(destinoPorRol('administrador')).toBe('/admin');
    expect(destinoPorRol('cliente')).toBe('/perfil');
  });

  it('rechaza redirecciones externas y rutas sin permiso', () => {
    for (const url of ['https://evil.example', '//evil.example', '/\\evil', '/auth/login', '/admin/usuarios', '/empleados/candy']) {
      expect(retornoSeguro(url, 'cliente')).toBe('/perfil');
    }
    expect(retornoSeguro('/perfil/compras?pagina=2', 'cliente')).toBe('/perfil/compras?pagina=2');
    expect(retornoSeguro('/admin/usuarios', 'administrador')).toBe('/admin/usuarios');
  });
});
