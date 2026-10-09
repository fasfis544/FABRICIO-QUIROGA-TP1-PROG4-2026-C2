/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Cuenta.Service; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { CuentaService } from './cuenta.service';
import { SesionService } from './sesion.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('CuentaService', () => {
  const api = {
    signUp: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    resend: vi.fn(),
    verifyOtp: vi.fn(),
    initialize: vi.fn(),
    getUser: vi.fn(),
    updateUser: vi.fn(),
    signInWithOAuth: vi.fn(),
  };
  const auth = {
    esperarSesion: vi.fn(),
    refrescarPerfil: vi.fn(),
    cerrarSesion: vi.fn(),
    recuperacionActiva: vi.fn(),
    finalizarRecuperacion: vi.fn(),
    errorSesion: vi.fn(),
  };
  const navigateByUrl = vi.fn();
  const autenticado = vi.fn();
  const supabase = {
    urlInicial: 'http://localhost/auth/registro',
    getClient: () => ({ auth: api }),
  };
  const personales = {
    fecha_nacimiento: '1990-01-01',
    grupo_sanguineo: 'O+',
    color_ojos: 'Marrones',
    vacaciones_anuales: 14,
  };
  const datos = {
    ...personales,
    nombre: ' Ana ',
    apellido: ' Pérez ',
    email: ' ana@cine.test ',
    password: ' password-seguro ',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    supabase.urlInicial = 'http://localhost/auth/registro';
    auth.esperarSesion.mockResolvedValue(undefined);
    auth.refrescarPerfil.mockResolvedValue(undefined);
    auth.cerrarSesion.mockResolvedValue(undefined);
    auth.recuperacionActiva.mockReturnValue(false);
    autenticado.mockReturnValue(true);
    navigateByUrl.mockResolvedValue(true);
    api.initialize.mockResolvedValue({ error: null });
    api.verifyOtp.mockResolvedValue({ error: null });
    api.getUser.mockResolvedValue({
      data: { user: { email_confirmed_at: '2026-10-07' } },
      error: null,
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: supabase },
        { provide: AuthService, useValue: auth },
        { provide: SesionService, useValue: { autenticado } },
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });
  });

  it('registra datos sin roles ni alterar la contraseña y espera confirmación', async () => {
    api.signUp.mockResolvedValue({ data: { session: null }, error: null });
    const cuenta = TestBed.inject(CuentaService);
    expect(await cuenta.registrar(datos)).toBe(false);
    expect(api.signUp).toHaveBeenCalledWith({
      email: 'ana@cine.test',
      password: datos.password,
      options: {
        data: { ...personales, nombre: 'Ana', apellido: 'Pérez' },
        emailRedirectTo: expect.stringMatching(/\/auth\/confirmacion-email$/),
      },
    });
    expect(cuenta.correoPendiente()).toBe('ana@cine.test');
    expect(auth.refrescarPerfil).not.toHaveBeenCalled();
  });

  it('inicia OAuth con retorno local sin enviar roles ni secretos', async () => {
    api.signInWithOAuth.mockResolvedValue({ error: null });
    await TestBed.inject(CuentaService).oauth('google');
    expect(api.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: expect.stringMatching(/\/auth\/oauth$/) },
    });
  });

  it('exige un perfil válido cuando el registro devuelve sesión', async () => {
    api.signUp.mockResolvedValue({ data: { session: {} }, error: null });
    autenticado.mockReturnValue(false);
    auth.errorSesion.mockReturnValue('Perfil no disponible');
    await expect(TestBed.inject(CuentaService).registrar(datos)).rejects.toThrow(
      'Perfil no disponible',
    );
    expect(auth.refrescarPerfil).toHaveBeenCalled();
  });

  it('no revela un correo inexistente en recuperación', async () => {
    api.resetPasswordForEmail.mockResolvedValue({ error: { code: 'user_not_found' } });
    await expect(
      TestBed.inject(CuentaService).recuperar(' ana@cine.test '),
    ).resolves.toBeUndefined();
    expect(api.resetPasswordForEmail).toHaveBeenCalledWith('ana@cine.test', {
      redirectTo: expect.stringMatching(/\/auth\/restablecer-password$/),
    });
  });

  it('traduce los límites de reenvío', async () => {
    api.resend.mockResolvedValue({ error: { code: 'over_email_send_rate_limit' } });
    await expect(
      TestBed.inject(CuentaService).reenviarConfirmacion('ana@cine.test'),
    ).rejects.toThrow('Demasiadas solicitudes');
  });

  it('no confirma un correo por tener una sesión en un acceso directo', async () => {
    supabase.urlInicial = 'http://localhost/auth/confirmacion-email';
    expect(await TestBed.inject(CuentaService).confirmarCorreo()).toBe(false);
    expect(api.getUser).not.toHaveBeenCalled();
  });

  it('verifica token_hash y no reutiliza el enlace', async () => {
    supabase.urlInicial = 'http://localhost/auth/confirmacion-email?token_hash=prueba&type=signup';
    const cuenta = TestBed.inject(CuentaService);
    expect(await cuenta.confirmarCorreo()).toBe(true);
    expect(api.verifyOtp).toHaveBeenCalledWith({ token_hash: 'prueba', type: 'signup' });
    expect(navigateByUrl).toHaveBeenCalledWith('/auth/confirmacion-email', { replaceUrl: true });
    expect(await cuenta.confirmarCorreo()).toBe(false);
    expect(api.verifyOtp).toHaveBeenCalledTimes(1);
  });

  it('limpia la URL aunque el enlace haya vencido', async () => {
    supabase.urlInicial =
      'http://localhost/auth/restablecer-password#error=access_denied&error_code=otp_expired';
    await expect(TestBed.inject(CuentaService).validarRecuperacion()).rejects.toThrow('venció');
    expect(navigateByUrl).toHaveBeenCalledWith('/auth/restablecer-password', { replaceUrl: true });
    expect(api.updateUser).not.toHaveBeenCalled();
  });

  it('delega callbacks estándar al SDK y exige evento de recuperación', async () => {
    supabase.urlInicial =
      'http://localhost/auth/restablecer-password#access_token=prueba&type=recovery';
    expect(await TestBed.inject(CuentaService).validarRecuperacion()).toBe(false);
    expect(api.initialize).toHaveBeenCalledTimes(1);
    expect(api.verifyOtp).not.toHaveBeenCalled();
  });

  it('rechaza una contraseña nueva sin sesión de recuperación', async () => {
    await expect(
      TestBed.inject(CuentaService).restablecerPassword('password-seguro'),
    ).rejects.toThrow('nuevo enlace');
    expect(api.updateUser).not.toHaveBeenCalled();
  });

  it('cambia la contraseña y finaliza la recuperación antes de cerrar sesión', async () => {
    auth.recuperacionActiva.mockReturnValue(true);
    api.updateUser.mockResolvedValue({ error: null });
    expect(await TestBed.inject(CuentaService).restablecerPassword(' nueva-password ')).toBe(true);
    expect(api.updateUser).toHaveBeenCalledWith({ password: ' nueva-password ' });
    expect(auth.finalizarRecuperacion).toHaveBeenCalledTimes(1);
    expect(auth.cerrarSesion).toHaveBeenCalledTimes(1);
  });

  it('conserva el resultado exitoso si solo falla el cierre de sesión', async () => {
    auth.recuperacionActiva.mockReturnValue(true);
    api.updateUser.mockResolvedValue({ error: null });
    auth.cerrarSesion.mockRejectedValue(new Error('network'));
    expect(await TestBed.inject(CuentaService).restablecerPassword('password-seguro')).toBe(false);
    expect(auth.finalizarRecuperacion).toHaveBeenCalled();
  });

  it('traduce contraseña repetida sin finalizar la recuperación', async () => {
    auth.recuperacionActiva.mockReturnValue(true);
    api.updateUser.mockResolvedValue({ error: { code: 'same_password' } });
    await expect(
      TestBed.inject(CuentaService).restablecerPassword('password-seguro'),
    ).rejects.toThrow('diferente');
    expect(auth.finalizarRecuperacion).not.toHaveBeenCalled();
    expect(auth.cerrarSesion).not.toHaveBeenCalled();
  });
});
