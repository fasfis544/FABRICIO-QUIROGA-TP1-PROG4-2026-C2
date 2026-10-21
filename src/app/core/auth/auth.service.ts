/**
 * coordina Supabase Auth con el perfil de la aplicación. 
 * Lo más importante es evitar que consultas lentas restauren datos de una sesión que ya cambió.
 */
import { computed, DestroyRef, inject, Service, signal } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';
import { SesionService } from './sesion.service';
import { Session } from '@supabase/supabase-js';
import { PerfilesService } from '../../data-access/perfiles/perfiles.service';
import { WebPushService } from '../notificaciones/web-push.service';

@Service()
export class AuthService {
  private readonly client = inject(SupabaseService).getClient();
  private readonly sesion = inject(SesionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly perfiles = inject(PerfilesService);
  private readonly push = inject(WebPushService);
  private sincronizacion: Promise<void> = Promise.resolve();
  private revision = 0;
  private readonly errorRestauracion = signal<string | null>(null);
  readonly errorSesion = this.errorRestauracion.asReadonly();
  private readonly usuarioRecuperacion = signal<string | null>(null);
  readonly recuperacionActiva = computed(
    () =>
      this.usuarioRecuperacion() !== null &&
      this.usuarioRecuperacion() === this.sesion.usuario()?.id,
  );

  finalizarRecuperacion(): void {
    this.usuarioRecuperacion.set(null);
  }
  private readonly inicializacion = this.inicializar();

  async esperarSesion(): Promise<void> {
    await this.inicializacion;
    await this.esperarSincronizacion();
  }

  async refrescarPerfil(): Promise<void> {
    await this.esperarSesion();
    this.programarSincronizacion(this.sesion.sesion());
    await this.esperarSincronizacion();
  }

  async iniciarSesion(email: string, password: string): Promise<void> {
    await this.esperarSesion();
    this.finalizarRecuperacion();
    let nuevaSesion: Session;
    try {
      const { data, error } = await this.client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      if (!data.session) throw new Error('No se pudo iniciar la sesión. Intentá nuevamente.');
      nuevaSesion = data.session;
    } catch (error: unknown) {
      throw new Error(this.mensajeError(error));
    }
    this.programarSincronizacion(nuevaSesion);
    await this.esperarSincronizacion();
    if (!this.sesion.autenticado()) {
      throw new Error(this.errorSesion() ?? 'No pudimos validar tu perfil. Intentá nuevamente.');
    }
  }

  async cerrarSesion(): Promise<void> {
    await this.esperarSesion();
    await this.push.antesDeSalir();
    try {
      const { error } = await this.client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      this.finalizarRecuperacion();
      this.programarSincronizacion(null);
    } catch {
      throw new Error('No pudimos cerrar tu sesión. Revisá tu conexión e intentá nuevamente.');
    }
  }

  private async inicializar(): Promise<void> {
    // Consultar perfiles fuera del callback: el SDK mantiene un lock de Auth aquí.
    const { data } = this.client.auth.onAuthStateChange((_evento, sesion) => {
      if (_evento === 'PASSWORD_RECOVERY' && sesion) {
        this.usuarioRecuperacion.set(sesion.user.id);
      } else if (!sesion || sesion.user.id !== this.usuarioRecuperacion()) {
        this.usuarioRecuperacion.set(null);
      }
      this.programarSincronizacion(sesion);
    });
    this.destroyRef.onDestroy(() => {
      this.revision++;
      data.subscription.unsubscribe();
    });
    const revision = this.revision;
    try {
      const { data, error } = await this.client.auth.getSession();
      if (error) throw error;
      if (revision === this.revision) this.programarSincronizacion(data.session);
    } catch {
      if (revision === this.revision) {
        this.programarSincronizacion(null);
        this.errorRestauracion.set('No pudimos recuperar tu sesión. Volvé a ingresar.');
      }
    }
    await this.esperarSincronizacion();
  }

  private programarSincronizacion(sesion: Session | null): void {
    const revision = ++this.revision;
    this.errorRestauracion.set(null);
    this.sesion.iniciarCarga(sesion);
    if (!sesion) {
      this.sesion.marcarCargada();
      this.sincronizacion = Promise.resolve();
      return;
    }
    this.sincronizacion = new Promise<void>((resolve) => {
      setTimeout(() => {
        void this.cargarPerfil(sesion, revision).then(resolve);
      }, 0);
    });
  }

  private async cargarPerfil(sesion: Session, revision: number): Promise<void> {
    if (revision !== this.revision) return;
    try {
      const perfil = await this.perfiles.obtenerPerfil(sesion.user.id);
      if (revision !== this.revision) return;
      this.sesion.actualizar(sesion, perfil);
      if (!perfil.activo) {
        this.errorRestauracion.set('Tu cuenta está desactivada. Contactá al administrador.');
      }
    } catch (error: unknown) {
      if (revision !== this.revision) return;
      this.sesion.actualizar(sesion);
      this.errorRestauracion.set(
        error instanceof Error ? error.message : 'No pudimos consultar tu perfil.',
      );
    } finally {
      if (revision === this.revision) this.sesion.marcarCargada();
    }
  }

  private async esperarSincronizacion(): Promise<void> {
    let pendiente: Promise<void>;
    do {
      pendiente = this.sincronizacion;
      await pendiente;
    } while (pendiente !== this.sincronizacion);
  }

  private mensajeError(error: unknown): string {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
    switch (code) {
      case 'invalid_credentials':
        return 'El correo o la contraseña son incorrectos.';
      case 'email_not_confirmed':
        return 'Confirmá tu correo electrónico antes de ingresar.';
      case 'over_request_rate_limit':
      case 'over_email_send_rate_limit':
        return 'Demasiados intentos. Esperá unos minutos y volvé a intentar.';
      case 'user_banned':
        return 'No se pudo acceder a esta cuenta. Contactá al administrador.';
      default:
        return 'No pudimos iniciar sesión. Revisá tu conexión e intentá nuevamente.';
    }
  }
}
