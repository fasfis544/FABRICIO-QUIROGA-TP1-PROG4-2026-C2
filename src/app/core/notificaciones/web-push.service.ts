import { DOCUMENT, inject, InjectionToken, Service, computed, signal } from '@angular/core';
import { SesionService } from '../auth/sesion.service';
import { SupabaseService } from '../supabase/supabase.service';

export interface NavegadorPush {
  disponible: boolean;
  origen: string;
  permiso: () => NotificationPermission;
  pedirPermiso: () => Promise<NotificationPermission>;
  registro: () => Promise<ServiceWorkerRegistration | undefined>;
}
export const NAVEGADOR_PUSH = new InjectionToken<NavegadorPush>('Navegador Web Push', {
  providedIn: 'root',
  factory: () => {
    const doc = inject(DOCUMENT),
      win = doc.defaultView;
    const notification =
      win && 'Notification' in win ? (win.Notification as typeof Notification) : null;
    const nav = win?.navigator;
    return {
      disponible: !!(
        win?.isSecureContext &&
        notification &&
        nav &&
        'serviceWorker' in nav &&
        'PushManager' in win
      ),
      origen: doc.location?.origin ?? '',
      permiso: () => notification?.permission ?? 'default',
      pedirPermiso: () =>
        notification ? notification.requestPermission() : Promise.resolve('denied'),
      registro: async () => {
        const r = await nav?.serviceWorker?.getRegistration(doc.baseURI);
        return r?.active?.scriptURL === new URL('cine-sw.js', doc.baseURI).href ? r : undefined;
      },
    };
  },
});
interface ConfiguracionPush {
  habilitado: boolean;
  clave_publica: string;
  origen: string;
}
export function clavePush(clave: string): Uint8Array<ArrayBuffer> {
  if (!/^B[A-Za-z0-9_-]{86}$/.test(clave)) throw new Error('Clave Push inválida');
  const bytes = Uint8Array.from(atob(clave.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
    c.charCodeAt(0),
  );
  if (bytes.length !== 65 || bytes[0] !== 4) throw new Error('Clave Push inválida');
  return bytes;
}
function mismaClave(s: PushSubscription, clave: string): boolean {
  const actual = s.options.applicationServerKey;
  const esperada = clavePush(clave);
  return (
    actual !== null &&
    actual.byteLength === esperada.length &&
    new Uint8Array(actual).every((n, i) => n === esperada[i])
  );
}
function leerConfiguracion(d: unknown): ConfiguracionPush {
  if (
    !d ||
    typeof d !== 'object' ||
    !('habilitado' in d) ||
    typeof d.habilitado !== 'boolean' ||
    !('clave_publica' in d) ||
    typeof d.clave_publica !== 'string' ||
    !('origen' in d) ||
    typeof d.origen !== 'string'
  ) {
    throw new Error('Configuración Push inválida');
  }
  if (d.habilitado) clavePush(d.clave_publica);
  return { habilitado: d.habilitado, clave_publica: d.clave_publica, origen: d.origen };
}
@Service()
export class WebPushService {
  private readonly client = inject(SupabaseService).getClient();
  private readonly sesion = inject(SesionService);
  private readonly navegador = inject(NAVEGADOR_PUSH);
  private readonly configuracion = signal<ConfiguracionPush | null>(null);
  private readonly cuenta = signal<string | null>(null);
  private readonly suscrita = signal(false);
  private readonly estadoConsultado = signal(false);
  private revision = 0;
  readonly disponible = this.navegador.disponible;
  readonly permiso = signal<NotificationPermission>(this.navegador.permiso());
  readonly ocupado = signal(false);
  readonly error = signal('');
  readonly exito = signal('');
  readonly activa = computed(
    () =>
      this.sesion.autenticado() && this.cuenta() === this.sesion.usuario()?.id && this.suscrita(),
  );
  readonly verificada = computed(
    () =>
      this.estadoConsultado() &&
      this.cuenta() === this.sesion.usuario()?.id &&
      this.sesion.autenticado(),
  );
  readonly configurada = computed(
    () =>
      this.configuracion()?.habilitado === true &&
      this.configuracion()?.origen === this.navegador.origen &&
      this.cuenta() === this.sesion.usuario()?.id &&
      this.sesion.autenticado(),
  );
  private async rpc(nombre: string, datos: Record<string, unknown> = {}): Promise<unknown> {
    const { data, error } = await this.client.rpc(nombre, datos);
    if (error) throw new Error('Web Push no disponible');
    return data as unknown;
  }
  private actual(usuario: string, revision: number): boolean {
    return (
      revision === this.revision &&
      this.sesion.usuario()?.id === usuario &&
      this.sesion.autenticado()
    );
  }
  async actualizar(): Promise<void> {
    if (this.ocupado()) return;
    const usuario = this.sesion.usuario()?.id;
    this.error.set('');
    this.exito.set('');
    this.permiso.set(this.navegador.permiso());
    if (!this.disponible || !usuario || !this.sesion.autenticado()) return;
    const revision = ++this.revision;
    this.ocupado.set(true);
    this.configuracion.set(null);
    this.suscrita.set(false);
    this.estadoConsultado.set(false);
    this.cuenta.set(usuario);
    try {
      const config = leerConfiguracion(await this.rpc('cine_push_configuracion'));
      const registro = await this.navegador.registro();
      const s = await registro?.pushManager.getSubscription();
      const activa =
        s &&
        config.habilitado &&
        mismaClave(s, config.clave_publica) &&
        this.navegador.permiso() === 'granted'
          ? await this.rpc('cine_push_estado', { p_endpoint: s.endpoint })
          : false;
      if (this.actual(usuario, revision)) {
        this.configuracion.set(config);
        this.suscrita.set(activa === true);
        this.estadoConsultado.set(true);
      }
    } catch {
      if (this.actual(usuario, revision))
        this.error.set(
          'Web Push todavía no está disponible en el servidor. Podés seguir usando la bandeja.',
        );
    } finally {
      if (revision === this.revision) this.ocupado.set(false);
    }
  }
  async activar(): Promise<void> {
    if (this.ocupado() || !this.disponible || !this.configurada() || this.activa()) return;
    if (this.navegador.permiso() === 'denied') {
      this.permiso.set('denied');
      this.error.set('El navegador bloqueó Push. Habilitá el permiso desde sus ajustes.');
      return;
    }
    const usuario = this.sesion.usuario()!.id,
      config = this.configuracion()!;
    const revision = ++this.revision;
    this.ocupado.set(true);
    this.error.set('');
    this.exito.set('');
    let nueva: PushSubscription | null = null;
    try {
      // El permiso se solicita SOLO aquí, directamente desde el botón, antes de otra espera.
      const permiso =
        this.navegador.permiso() === 'granted' ? 'granted' : await this.navegador.pedirPermiso();
      this.permiso.set(permiso);
      if (permiso !== 'granted')
        throw new Error(
          'No diste permiso. Podés habilitarlo desde la configuración del navegador; la bandeja sigue disponible.',
        );
      if (!this.actual(usuario, revision))
        throw new Error('La cuenta cambió. Actualizá la pantalla antes de activar.');
      const registro = await this.navegador.registro();
      if (!registro)
        throw new Error(
          'El worker todavía no está activo. Abrí la versión publicada de la PWA y actualizá esta pantalla.',
        );
      let s = await registro.pushManager.getSubscription();
      if (s && !mismaClave(s, config.clave_publica)) {
        if (!(await s.unsubscribe()))
          throw new Error(
            'No se pudo actualizar la clave del dispositivo. Desactivá Push desde los ajustes del navegador y reintentá.',
          );
        s = null;
      }
      if (!s) {
        s = await registro.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: clavePush(config.clave_publica),
        });
        nueva = s;
      }
      const datos = s.toJSON();
      if (!datos.keys?.['p256dh'] || !datos.keys['auth'])
        throw new Error('El navegador no devolvió una suscripción válida.');
      if (!this.actual(usuario, revision))
        throw new Error('La cuenta cambió. Actualizá la pantalla antes de activar.');
      await this.rpc('cine_push_suscribir', {
        p_usuario: usuario,
        p_endpoint: s.endpoint,
        p_p256dh: datos.keys['p256dh'],
        p_auth: datos.keys['auth'],
        p_clave: config.clave_publica,
      });
      if (this.actual(usuario, revision)) {
        this.suscrita.set(true);
        this.estadoConsultado.set(true);
        this.exito.set('Notificaciones Push activadas para esta cuenta en este dispositivo.');
      } else {
        await s.unsubscribe();
      }
    } catch (e: unknown) {
      if (nueva) {
        try {
          await nueva.unsubscribe();
        } catch {
          /* La baja remota/410 también invalida el endpoint. */
        }
      }
      if (this.actual(usuario, revision)) {
        this.estadoConsultado.set(false);
        this.error.set(e instanceof Error ? e.message : 'No pudimos activar Push. Reintentá.');
      }
    } finally {
      if (revision === this.revision) this.ocupado.set(false);
    }
  }
  async desactivar(): Promise<void> {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    this.error.set('');
    this.exito.set('');
    try {
      await this.bajaDispositivo();
      this.suscrita.set(false);
      this.estadoConsultado.set(true);
      this.cuenta.set(this.sesion.usuario()?.id ?? null);
      this.exito.set(
        'Push desactivado en este dispositivo. Las alertas y la bandeja se conservan.',
      );
    } catch {
      this.estadoConsultado.set(false);
      this.error.set(
        'No pudimos completar la baja. Actualizá y reintentá; no se borraron tus alertas.',
      );
    } finally {
      this.ocupado.set(false);
    }
  }
  private async bajaDispositivo(): Promise<void> {
    if (!this.disponible) return;
    const usuario = this.sesion.usuario()?.id,
      registro = await this.navegador.registro();
    const s = await registro?.pushManager.getSubscription();
    if (!s) return;
    if (this.sesion.usuario()?.id !== usuario) return;
    let remoto = false,
      local = false;
    try {
      local = await s.unsubscribe();
    } catch {
      /* Mantener información sobre baja incompleta. */
    }
    if (usuario) {
      try {
        await this.rpc('cine_push_desuscribir', { p_usuario: usuario, p_endpoint: s.endpoint });
        remoto = true;
      } catch {
        /* La baja local también detiene los avisos sin conexión a Supabase. */
      }
    }
    if (!remoto && !local) throw new Error('Baja no completada');
  }
  async antesDeSalir(): Promise<void> {
    ++this.revision;
    this.configuracion.set(null);
    this.suscrita.set(false);
    this.estadoConsultado.set(false);
    this.cuenta.set(null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.bajaDispositivo(),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 5000);
        }),
      ]);
    } catch {
      /* Nunca impedir logout por indisponibilidad de Push. */
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    this.ocupado.set(false);
  }
}
