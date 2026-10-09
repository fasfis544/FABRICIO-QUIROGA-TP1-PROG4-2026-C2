/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Auth.Service; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { Session } from '@supabase/supabase-js';
import { AuthService } from './auth.service';
import { SesionService } from './sesion.service';
import { SupabaseService } from '../supabase/supabase.service';
import { PerfilesService } from '../../data-access/perfiles/perfiles.service';
import { Perfil } from '../../data-access/perfiles/perfil.model';
import { Rol } from './rol.model';
import { WebPushService } from '../notificaciones/web-push.service';

function perfilPrueba(rol: Rol = 'cliente', activo = true): Perfil {
  return { id: 'usuario-1', nombre: 'Cliente', apellido: null, rol, activo };
}

export function sesionPrueba(rol = 'cliente'): Session {
  return {
    access_token: 'test',
    refresh_token: 'test',
    token_type: 'bearer',
    expires_in: 3600,
    user: {
      id: 'usuario-1',
      aud: 'authenticated',
      email: 'cliente@cine.test',
      app_metadata: { rol },
      user_metadata: {},
      created_at: '2026-01-01T00:00:00Z',
    },
  };
}

describe('AuthService', () => {
  const unsubscribe = vi.fn();
  const obtenerPerfil = vi.fn();
  const antesDeSalir = vi.fn().mockResolvedValue(undefined);
  let callback: (evento: string, sesion: Session | null) => void;
  const client = {
    auth: {
      onAuthStateChange: vi.fn((cb: typeof callback) => {
        callback = cb;
        return { data: { subscription: { unsubscribe } } };
      }),
      getSession: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    client.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    obtenerPerfil.mockResolvedValue(perfilPrueba());
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: { getClient: () => client } },
        { provide: PerfilesService, useValue: { obtenerPerfil } },
        { provide: WebPushService, useValue: { antesDeSalir } },
      ],
    });
  });

  it('restaura la sesión y sincroniza eventos de otras pestañas', async () => {
    obtenerPerfil.mockResolvedValue(perfilPrueba('empleado'));
    client.auth.getSession.mockResolvedValue({
      data: { session: sesionPrueba('empleado') },
      error: null,
    });
    const auth = TestBed.inject(AuthService);
    const sesion = TestBed.inject(SesionService);
    await auth.esperarSesion();
    expect(sesion.cargada()).toBe(true);
    expect(sesion.rol()).toBe('empleado');
    callback('SIGNED_OUT', null);
    expect(sesion.autenticado()).toBe(false);
  });

  it('inicia sesión sin modificar la contraseña', async () => {
    client.auth.signInWithPassword.mockResolvedValue({
      data: { session: sesionPrueba() },
      error: null,
    });
    await TestBed.inject(AuthService).iniciarSesion(' cliente@cine.test ', ' password ');
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'cliente@cine.test',
      password: ' password ',
    });
    expect(TestBed.inject(SesionService).autenticado()).toBe(true);
  });

  it('intenta dar de baja Push antes de cerrar la sesión Auth local', async () => {
    client.auth.signOut.mockResolvedValue({ error: null });
    const auth = TestBed.inject(AuthService);
    await auth.cerrarSesion();
    expect(antesDeSalir).toHaveBeenCalledOnce();
    expect(antesDeSalir.mock.invocationCallOrder[0]).toBeLessThan(
      client.auth.signOut.mock.invocationCallOrder[0],
    );
  });

  it('solo habilita recuperación por evento y la revoca al salir', async () => {
    const auth = TestBed.inject(AuthService);
    await auth.esperarSesion();
    callback('SIGNED_IN', sesionPrueba());
    await auth.esperarSesion();
    expect(auth.recuperacionActiva()).toBe(false);
    callback('PASSWORD_RECOVERY', sesionPrueba());
    await auth.esperarSesion();
    expect(auth.recuperacionActiva()).toBe(true);
    callback('TOKEN_REFRESHED', sesionPrueba());
    await auth.esperarSesion();
    expect(auth.recuperacionActiva()).toBe(true);
    callback('SIGNED_OUT', null);
    expect(auth.recuperacionActiva()).toBe(false);
  });

  it('traduce credenciales inválidas y conserva la sesión si falla el cierre', async () => {
    client.auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { code: 'invalid_credentials' },
    });
    const auth = TestBed.inject(AuthService);
    await expect(auth.iniciarSesion('cliente@cine.test', 'incorrecta')).rejects.toThrow(
      'El correo o la contraseña son incorrectos.',
    );
    TestBed.inject(SesionService).actualizar(sesionPrueba(), perfilPrueba());
    client.auth.signOut.mockResolvedValue({ error: { message: 'network' } });
    await expect(auth.cerrarSesion()).rejects.toThrow('No pudimos cerrar tu sesión');
    expect(TestBed.inject(SesionService).autenticado()).toBe(true);
  });

  it('cierra la sesión local y limpia el estado', async () => {
    const auth = TestBed.inject(AuthService);
    await auth.esperarSesion();
    TestBed.inject(SesionService).actualizar(sesionPrueba(), perfilPrueba());
    client.auth.signOut.mockResolvedValue({ error: null });
    await auth.cerrarSesion();
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(TestBed.inject(SesionService).usuario()).toBeNull();
  });

  it('no concede permisos a partir de metadata editable por el usuario', async () => {
    const auth = TestBed.inject(AuthService);
    await auth.esperarSesion();
    const sesion = sesionPrueba('administrador');
    sesion.user.user_metadata = { rol: 'administrador' };
    callback('SIGNED_IN', sesion);
    await auth.esperarSesion();
    expect(TestBed.inject(SesionService).rol()).toBe('cliente');
  });

  it('finaliza la restauración aunque falle la red, sin conceder acceso', async () => {
    client.auth.getSession.mockRejectedValue(new Error('network'));
    const auth = TestBed.inject(AuthService);
    await auth.esperarSesion();
    expect(TestBed.inject(SesionService).cargada()).toBe(true);
    expect(TestBed.inject(SesionService).autenticado()).toBe(false);
    expect(auth.errorSesion()).toContain('Volvé a ingresar');
  });

  it('no sobrescribe un evento de sesión nuevo con una restauración anterior', async () => {
    obtenerPerfil.mockResolvedValue(perfilPrueba('administrador'));
    let resolver!: (resultado: { data: { session: Session | null }; error: null }) => void;
    client.auth.getSession.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );
    const auth = TestBed.inject(AuthService);
    callback('SIGNED_IN', sesionPrueba('administrador'));
    resolver({ data: { session: null }, error: null });
    await auth.esperarSesion();
    expect(TestBed.inject(SesionService).rol()).toBe('administrador');
  });

  it('rechaza un perfil inactivo aunque Auth permita iniciar sesión', async () => {
    obtenerPerfil.mockResolvedValue(perfilPrueba('administrador', false));
    client.auth.signInWithPassword.mockResolvedValue({
      data: { session: sesionPrueba('administrador') },
      error: null,
    });
    const auth = TestBed.inject(AuthService);
    await expect(auth.iniciarSesion('cliente@cine.test', 'password')).rejects.toThrow(
      'desactivada',
    );
    expect(TestBed.inject(SesionService).autenticado()).toBe(false);
    expect(TestBed.inject(SesionService).rol()).toBeNull();
  });

  it('rechaza el acceso si no puede consultar el perfil, sin recurrir a metadata', async () => {
    obtenerPerfil.mockRejectedValue(new Error('Perfil no disponible'));
    client.auth.signInWithPassword.mockResolvedValue({
      data: { session: sesionPrueba('administrador') },
      error: null,
    });
    await expect(
      TestBed.inject(AuthService).iniciarSesion('cliente@cine.test', 'password'),
    ).rejects.toThrow('Perfil no disponible');
    expect(TestBed.inject(SesionService).autenticado()).toBe(false);
  });

  it('refresca los permisos de la tabla antes de acceder a rutas protegidas', async () => {
    client.auth.getSession.mockResolvedValue({ data: { session: sesionPrueba() }, error: null });
    const auth = TestBed.inject(AuthService);
    await auth.esperarSesion();
    expect(TestBed.inject(SesionService).rol()).toBe('cliente');
    obtenerPerfil.mockResolvedValue(perfilPrueba('empleado'));
    await auth.refrescarPerfil();
    expect(TestBed.inject(SesionService).rol()).toBe('empleado');
    obtenerPerfil.mockResolvedValue(perfilPrueba('empleado', false));
    await auth.refrescarPerfil();
    expect(TestBed.inject(SesionService).autenticado()).toBe(false);
  });

  it('ignora una consulta de perfil que termina después de cerrar sesión', async () => {
    const auth = TestBed.inject(AuthService);
    await auth.esperarSesion();
    let resolver!: (perfil: Perfil) => void;
    const consultaIniciada = new Promise<void>((resolve) => {
      obtenerPerfil.mockImplementationOnce(() => {
        resolve();
        return new Promise<Perfil>((completar) => {
          resolver = completar;
        });
      });
    });
    callback('SIGNED_IN', sesionPrueba('administrador'));
    await consultaIniciada;
    callback('SIGNED_OUT', null);
    resolver(perfilPrueba('administrador'));
    await auth.esperarSesion();
    expect(TestBed.inject(SesionService).usuario()).toBeNull();
    expect(TestBed.inject(SesionService).perfil()).toBeNull();
    expect(TestBed.inject(SesionService).rol()).toBeNull();
  });
});
