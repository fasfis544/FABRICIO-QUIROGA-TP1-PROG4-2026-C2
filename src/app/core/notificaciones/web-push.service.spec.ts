import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { NAVEGADOR_PUSH, NavegadorPush, WebPushService, clavePush } from './web-push.service';
import { SupabaseService } from '../supabase/supabase.service';
import { SesionService } from '../auth/sesion.service';

const clave = btoa(String.fromCharCode(4, ...new Array<number>(64).fill(1)))
  .replaceAll('+', '-')
  .replaceAll('/', '_')
  .replaceAll('=', '');
const endpoint = 'https://fcm.googleapis.com/fcm/send/dispositivo-local';
describe('Web Push: consentimiento y dispositivo', () => {
  function preparar({
    disponible = true,
    existe = false,
    habilitado = true,
    origen = 'https://cine.example',
    permisoInicial = 'default' as NotificationPermission,
  } = {}) {
    const usuario = signal<string | null>('cliente-local'),
      activo = signal(true);
    let permiso: NotificationPermission = permisoInicial;
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const s = {
      endpoint,
      options: { applicationServerKey: clavePush(clave).buffer, userVisibleOnly: true },
      unsubscribe,
      toJSON: () => ({ endpoint, keys: { p256dh: clave, auth: 'AQEBAQEBAQEBAQEBAQEBAQ' } }),
    } as unknown as PushSubscription;
    const getSubscription = vi.fn().mockResolvedValue(existe ? s : null);
    const subscribe = vi.fn().mockResolvedValue(s);
    const registro = {
      pushManager: { getSubscription, subscribe },
    } as unknown as ServiceWorkerRegistration;
    const navegador: NavegadorPush = {
      disponible,
      origen: 'https://cine.example',
      permiso: () => permiso,
      pedirPermiso: vi.fn(async () => {
        permiso = 'granted';
        return permiso;
      }),
      registro: vi.fn().mockResolvedValue(registro),
    };
    const rpc = vi.fn(
      async (
        nombre: string,
        _datos?: Record<string, unknown>,
      ): Promise<{ data: unknown; error: unknown }> => ({
        data:
          nombre === 'cine_push_configuracion'
            ? { habilitado, clave_publica: habilitado ? clave : '', origen }
            : nombre === 'cine_push_estado'
              ? false
              : null,
        error: null,
      }),
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: { getClient: () => ({ rpc }) } },
        {
          provide: SesionService,
          useValue: {
            usuario: () => (usuario() ? { id: usuario() } : null),
            autenticado: () => !!usuario() && activo(),
          },
        },
        { provide: NAVEGADOR_PUSH, useValue: navegador },
      ],
    });
    const service = TestBed.inject(WebPushService);
    return {
      service,
      rpc,
      usuario,
      activo,
      navegador,
      s,
      registro,
      getSubscription,
      subscribe,
      unsubscribe,
      setPermiso: (p: NotificationPermission) => {
        permiso = p;
      },
    };
  }
  it('decodifica la VAPID pública uncompressed y rechaza formatos inválidos', () => {
    expect(clavePush(clave)).toHaveLength(65);
    expect(clavePush(clave)[0]).toBe(4);
    for (const mal of ['', 'secret', clave + '=', 'A'.repeat(87)])
      expect(() => clavePush(mal)).toThrow();
  });
  it('consultar estado nunca pide permiso ni suscribe', async () => {
    const t = preparar();
    await t.service.actualizar();
    expect(t.navegador.pedirPermiso).not.toHaveBeenCalled();
    expect(t.subscribe).not.toHaveBeenCalled();
    expect(t.service.configurada()).toBe(true);
    expect(t.service.activa()).toBe(false);
  });
  it('navegador incompatible no llama backend ni permiso', async () => {
    const t = preparar({ disponible: false });
    await t.service.actualizar();
    await t.service.activar();
    expect(t.rpc).not.toHaveBeenCalled();
    expect(t.navegador.pedirPermiso).not.toHaveBeenCalled();
  });
  it('sesión inactiva no habilita suscripción', async () => {
    const t = preparar();
    t.activo.set(false);
    await t.service.actualizar();
    await t.service.activar();
    expect(t.rpc).not.toHaveBeenCalled();
  });
  it('sin configuración no ofrece activar aunque el permiso exista', async () => {
    const t = preparar({ habilitado: false, permisoInicial: 'granted' });
    await t.service.actualizar();
    await t.service.activar();
    expect(t.service.configurada()).toBe(false);
    expect(t.subscribe).not.toHaveBeenCalled();
  });
  it('un origen diferente bloquea activación', async () => {
    const t = preparar({ origen: 'https://otro.example' });
    await t.service.actualizar();
    await t.service.activar();
    expect(t.service.configurada()).toBe(false);
    expect(t.subscribe).not.toHaveBeenCalled();
  });
  it('migración ausente conserva la bandeja y muestra estado no disponible', async () => {
    const t = preparar();
    t.rpc.mockResolvedValueOnce({ data: null, error: { message: 'RPC ausente' } });
    await t.service.actualizar();
    expect(t.service.error()).toContain('bandeja');
    expect(t.service.configurada()).toBe(false);
    expect(t.service.verificada()).toBe(false);
    expect(t.service.ocupado()).toBe(false);
  });
  it('activación explícita pide permiso y registra solo datos del dispositivo y usuario esperado', async () => {
    const t = preparar();
    await t.service.actualizar();
    await t.service.activar();
    expect(t.navegador.pedirPermiso).toHaveBeenCalledOnce();
    expect(t.subscribe).toHaveBeenCalledExactlyOnceWith({
      userVisibleOnly: true,
      applicationServerKey: clavePush(clave),
    });
    expect(t.rpc).toHaveBeenCalledWith('cine_push_suscribir', {
      p_usuario: 'cliente-local',
      p_endpoint: endpoint,
      p_p256dh: clave,
      p_auth: 'AQEBAQEBAQEBAQEBAQEBAQ',
      p_clave: clave,
    });
    expect(t.service.activa()).toBe(true);
  });
  it('permiso ya concedido no vuelve a pedirlo', async () => {
    const t = preparar({ permisoInicial: 'granted' });
    await t.service.actualizar();
    await t.service.activar();
    expect(t.navegador.pedirPermiso).not.toHaveBeenCalled();
  });
  it('permiso denegado no pide nuevamente ni persiste', async () => {
    const t = preparar({ permisoInicial: 'denied' });
    await t.service.actualizar();
    await t.service.activar();
    expect(t.navegador.pedirPermiso).not.toHaveBeenCalled();
    expect(t.subscribe).not.toHaveBeenCalled();
    expect(t.service.error()).toContain('ajustes');
  });
  for (const permiso of ['default', 'denied'] as const)
    it('cancelar/rechazar el diálogo no registra ' + permiso, async () => {
      const t = preparar();
      vi.mocked(t.navegador.pedirPermiso).mockResolvedValue(permiso);
      await t.service.actualizar();
      await t.service.activar();
      expect(t.subscribe).not.toHaveBeenCalled();
      expect(t.service.activa()).toBe(false);
      expect(t.service.error()).toContain('permiso');
    });
  it('PWA sin worker activo explica cómo recuperarse', async () => {
    const t = preparar();
    vi.mocked(t.navegador.registro).mockResolvedValue(undefined);
    await t.service.actualizar();
    await t.service.activar();
    expect(t.service.error()).toContain('worker');
    expect(t.subscribe).not.toHaveBeenCalled();
  });
  it('suscripción existente se reutiliza sin crear otra', async () => {
    const t = preparar({ existe: true, permisoInicial: 'granted' });
    await t.service.actualizar();
    await t.service.activar();
    expect(t.subscribe).not.toHaveBeenCalled();
    expect(t.rpc).toHaveBeenCalledWith(
      'cine_push_suscribir',
      expect.objectContaining({ p_endpoint: endpoint }),
    );
  });
  it('suscripción ya asociada no duplica registro', async () => {
    const t = preparar({ existe: true, permisoInicial: 'granted' });
    t.rpc.mockImplementation(async (n) => ({
      data:
        n === 'cine_push_estado'
          ? true
          : { habilitado: true, clave_publica: clave, origen: 'https://cine.example' },
      error: null,
    }));
    await t.service.actualizar();
    await t.service.activar();
    expect(t.service.activa()).toBe(true);
    expect(t.rpc).not.toHaveBeenCalledWith('cine_push_suscribir', expect.anything());
  });
  it('fallo al registrar una nueva suscripción intenta revertir el navegador', async () => {
    const t = preparar();
    await t.service.actualizar();
    t.rpc.mockResolvedValueOnce({ data: null, error: { message: 'network' } });
    await t.service.activar();
    expect(t.unsubscribe).toHaveBeenCalledOnce();
    expect(t.service.activa()).toBe(false);
    expect(t.service.error()).not.toContain(endpoint);
  });
  it('fallo al registrar una existente no elimina otro registro consentido', async () => {
    const t = preparar({ existe: true, permisoInicial: 'granted' });
    await t.service.actualizar();
    t.rpc.mockResolvedValueOnce({ data: null, error: { message: 'network' } });
    await t.service.activar();
    expect(t.unsubscribe).not.toHaveBeenCalled();
  });
  it('doble clic solo ejecuta una activación', async () => {
    const t = preparar();
    await t.service.actualizar();
    let resolver!: (p: NotificationPermission) => void;
    vi.mocked(t.navegador.pedirPermiso).mockImplementation(
      () => new Promise((r) => (resolver = r)),
    );
    const p = t.service.activar();
    await t.service.activar();
    resolver('granted');
    await p;
    expect(t.subscribe).toHaveBeenCalledOnce();
  });
  it('cambio de cuenta durante permiso evita asociar datos al nuevo usuario', async () => {
    const t = preparar();
    await t.service.actualizar();
    vi.mocked(t.navegador.pedirPermiso).mockImplementation(async () => {
      t.usuario.set('otra');
      return 'granted';
    });
    await t.service.activar();
    expect(t.subscribe).not.toHaveBeenCalled();
    expect(t.service.activa()).toBe(false);
  });
  it('logout durante suscripción impide registro tardío y revierte la nueva', async () => {
    const t = preparar();
    await t.service.actualizar();
    t.subscribe.mockImplementation(async () => {
      t.usuario.set(null);
      return t.s;
    });
    await t.service.activar();
    expect(t.rpc).not.toHaveBeenCalledWith('cine_push_suscribir', expect.anything());
    expect(t.unsubscribe).toHaveBeenCalledOnce();
  });
  it('consulta tardía de otra cuenta no habilita estado viejo', async () => {
    const t = preparar();
    let resolver!: (v: { data: unknown; error: null }) => void;
    t.rpc.mockImplementationOnce(() => new Promise((r) => (resolver = r)));
    const p = t.service.actualizar();
    t.usuario.set('otra');
    resolver({
      data: { habilitado: true, clave_publica: clave, origen: 'https://cine.example' },
      error: null,
    });
    await p;
    expect(t.service.configurada()).toBe(false);
    expect(t.service.activa()).toBe(false);
  });
  it('baja desactiva navegador y RPC propia sin quitar alertas', async () => {
    const t = preparar({ existe: true });
    await t.service.desactivar();
    expect(t.unsubscribe).toHaveBeenCalledOnce();
    expect(t.rpc).toHaveBeenCalledExactlyOnceWith('cine_push_desuscribir', {
      p_usuario: 'cliente-local',
      p_endpoint: endpoint,
    });
    expect(t.service.exito()).toContain('bandeja');
  });
  it('baja local funciona aunque Supabase falle', async () => {
    const t = preparar({ existe: true });
    t.rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await t.service.desactivar();
    expect(t.unsubscribe).toHaveBeenCalledOnce();
    expect(t.service.error()).toBe('');
  });
  it('baja remota funciona aunque el navegador falle', async () => {
    const t = preparar({ existe: true });
    t.unsubscribe.mockRejectedValue(new Error('browser'));
    await t.service.desactivar();
    expect(t.service.exito()).toContain('desactivado');
  });
  it('doble fallo de baja no afirma éxito', async () => {
    const t = preparar({ existe: true });
    t.unsubscribe.mockRejectedValue(new Error('browser'));
    t.rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await t.service.desactivar();
    expect(t.service.error()).toContain('baja');
    expect(t.service.exito()).toBe('');
  });
  it('Push no impide salir aunque falle toda la baja', async () => {
    const t = preparar({ existe: true });
    t.unsubscribe.mockRejectedValue(new Error('browser'));
    t.rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await expect(t.service.antesDeSalir()).resolves.toBeUndefined();
    expect(t.service.activa()).toBe(false);
    expect(t.service.ocupado()).toBe(false);
  });
  it('la espera por Push al salir está acotada a cinco segundos', async () => {
    vi.useFakeTimers();
    try {
      const t = preparar({ existe: true });
      vi.mocked(t.navegador.registro).mockImplementation(() => new Promise(() => {}));
      const p = t.service.antesDeSalir();
      await vi.advanceTimersByTimeAsync(5000);
      await p;
      expect(t.service.ocupado()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
  it('permiso revocado se refleja al actualizar', async () => {
    const t = preparar({ existe: true, permisoInicial: 'granted' });
    await t.service.actualizar();
    t.setPermiso('denied');
    await t.service.actualizar();
    expect(t.service.permiso()).toBe('denied');
    expect(t.service.activa()).toBe(false);
  });
  it('clave del navegador anterior requiere resuscripción consentida', async () => {
    const t = preparar({ existe: true, permisoInicial: 'granted' });
    Object.defineProperty(t.s, 'options', {
      value: { applicationServerKey: new Uint8Array(65).buffer },
    });
    await t.service.actualizar();
    await t.service.activar();
    expect(t.unsubscribe).toHaveBeenCalledOnce();
    expect(t.subscribe).toHaveBeenCalledOnce();
  });
});
