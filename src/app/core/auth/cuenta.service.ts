/**
 * Anotacion de responsabilidad: Servicio Angular de Cuenta; concentra la responsabilidad de este modulo dentro de app/core/auth. Incluye principalmente: DatosRegistro, CuentaService, ruta, query.
 */
import { DOCUMENT, inject, Service, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthService } from './auth.service';
import { SesionService } from './sesion.service';
import { DatosPersonales } from '../../data-access/perfiles/perfil.model';

export interface DatosRegistro extends DatosPersonales {
  nombre: string;
  apellido: string;
  email: string;
  password: string;
}

@Service()
export class CuentaService {
  private readonly supabase = inject(SupabaseService);
  private readonly client = this.supabase.getClient();
  private readonly auth = inject(AuthService);
  private readonly sesion = inject(SesionService);
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  readonly correoPendiente = signal('');
  private enlaceProcesado = false;
  async oauth(proveedor: 'google' | 'github'): Promise<void> {
    const { error } = await this.client.auth.signInWithOAuth({
      provider: proveedor,
      options: { redirectTo: this.urlRetorno('oauth') },
    });
    if (error) throw new Error('No se pudo iniciar OAuth. Revisá el proveedor en Supabase Auth.');
  }
  async completarOAuth(): Promise<void> {
    const original = new URL(this.supabase.urlInicial || this.document.baseURI);
    if (
      original.searchParams.has('error') ||
      new URLSearchParams(original.hash.slice(1)).has('error')
    )
      throw new Error('El proveedor rechazó el acceso. Intentá nuevamente.');
    const { error } = await this.client.auth.initialize();
    if (error) throw new Error('El enlace OAuth no es válido. Iniciá sesión nuevamente.');
    await this.auth.esperarSesion();
    await this.auth.refrescarPerfil();
    if (!this.sesion.autenticado())
      throw new Error(
        this.auth.errorSesion() ?? 'No se pudo validar el perfil de la cuenta OAuth.',
      );
  }

  async registrar(datos: DatosRegistro): Promise<boolean> {
    try {
      const { data, error } = await this.client.auth.signUp({
        email: datos.email.trim(),
        password: datos.password,
        options: {
          data: {
            nombre: datos.nombre.trim(),
            apellido: datos.apellido.trim(),
            fecha_nacimiento: datos.fecha_nacimiento,
            grupo_sanguineo: datos.grupo_sanguineo,
            color_ojos: datos.color_ojos.trim(),
            vacaciones_anuales: datos.vacaciones_anuales,
          },
          emailRedirectTo: this.urlRetorno('confirmacion-email'),
        },
      });
      if (error) throw error;
      this.correoPendiente.set(datos.email.trim());
      if (!data.session) return false;
      await this.auth.refrescarPerfil();
      if (!this.sesion.autenticado())
        throw new Error(
          this.auth.errorSesion() ?? 'Cuenta creada, pero no pudimos validar tu perfil.',
        );
      return true;
    } catch (error: unknown) {
      throw new Error(this.mensaje(error, 'No pudimos completar el registro. Intentá nuevamente.'));
    }
  }

  async recuperar(email: string): Promise<void> {
    try {
      const { error } = await this.client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: this.urlRetorno('restablecer-password'),
      });
      if (error && this.codigo(error) !== 'user_not_found') throw error;
    } catch (error: unknown) {
      throw new Error(
        this.mensaje(error, 'No pudimos solicitar la recuperación. Revisá tu conexión.'),
      );
    }
  }

  async reenviarConfirmacion(email: string): Promise<void> {
    try {
      const { error } = await this.client.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: this.urlRetorno('confirmacion-email') },
      });
      if (error && this.codigo(error) !== 'user_not_found') throw error;
    } catch (error: unknown) {
      throw new Error(this.mensaje(error, 'No pudimos reenviar el correo. Intentá nuevamente.'));
    }
  }

  async confirmarCorreo(): Promise<boolean> {
    return this.procesarEnlace('signup');
  }

  async validarRecuperacion(): Promise<boolean> {
    await this.procesarEnlace('recovery');
    await this.auth.esperarSesion();
    return this.auth.recuperacionActiva();
  }

  async restablecerPassword(password: string): Promise<boolean> {
    await this.auth.esperarSesion();
    if (!this.auth.recuperacionActiva())
      throw new Error('Solicitá un nuevo enlace para cambiar tu contraseña.');
    try {
      const { error } = await this.client.auth.updateUser({ password });
      if (error) throw error;
    } catch (error: unknown) {
      throw new Error(
        this.mensaje(
          error,
          'No pudimos cambiar la contraseña. Solicitá un nuevo enlace si venció.',
        ),
      );
    }
    this.auth.finalizarRecuperacion();
    // El cambio ya fue realizado: un fallo del cierre no es un fallo de contraseña.
    try {
      await this.auth.cerrarSesion();
      return true;
    } catch {
      return false;
    }
  }

  private async procesarEnlace(tipo: 'signup' | 'recovery'): Promise<boolean> {
    if (this.enlaceProcesado) return false;
    const url = new URL(this.supabase.urlInicial || this.document.baseURI);
    const ruta = tipo === 'signup' ? 'confirmacion-email' : 'restablecer-password';
    if (!url.pathname.endsWith(`/auth/${ruta}`)) return false;
    const query = url.searchParams;
    const hash = new URLSearchParams(url.hash.slice(1));
    const esCallback =
      query.has('token_hash') ||
      query.has('code') ||
      hash.has('access_token') ||
      query.has('error') ||
      hash.has('error') ||
      query.has('error_code') ||
      hash.has('error_code');
    if (!esCallback) return false;
    this.enlaceProcesado = true;
    try {
      if (
        query.has('error') ||
        hash.has('error') ||
        query.has('error_code') ||
        hash.has('error_code')
      ) {
        throw new Error('El enlace no es válido o venció. Solicitá uno nuevo.');
      }
      if (query.has('token_hash')) {
        if (query.get('type') !== tipo)
          throw new Error('El enlace no corresponde a esta operación.');
        const { error } = await this.client.auth.verifyOtp({
          token_hash: query.get('token_hash')!,
          type: tipo,
        });
        if (error) throw new Error('El enlace no es válido o venció. Solicitá uno nuevo.');
      } else {
        const { error } = await this.client.auth.initialize();
        if (error) throw new Error('El enlace no es válido o venció. Solicitá uno nuevo.');
      }
      await this.auth.esperarSesion();
      if (tipo === 'recovery') return this.auth.recuperacionActiva();
      const { data, error } = await this.client.auth.getUser();
      if (error || !data.user?.email_confirmed_at)
        throw new Error('No pudimos verificar la confirmación. Solicitá un nuevo enlace.');
      return true;
    } finally {
      await this.router.navigateByUrl(`/auth/${ruta}`, { replaceUrl: true });
    }
  }

  private urlRetorno(ruta: string): string {
    return new URL(`auth/${ruta}`, this.document.baseURI).href;
  }

  private codigo(error: unknown): unknown {
    return typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
  }

  private mensaje(error: unknown, fallback: string): string {
    switch (this.codigo(error)) {
      case 'weak_password':
        return 'La contraseña no cumple los requisitos de seguridad de Supabase.';
      case 'same_password':
        return 'Elegí una contraseña diferente de la anterior.';
      case 'over_request_rate_limit':
      case 'over_email_send_rate_limit':
        return 'Demasiadas solicitudes. Esperá unos minutos y volvé a intentar.';
      case 'signup_disabled':
        return 'El registro está deshabilitado. Contactá al administrador.';
      case 'email_address_invalid':
        return 'Ingresá un correo electrónico válido.';
      case 'user_already_exists':
        return 'No se pudo completar el registro. Revisá tu correo o intentá ingresar.';
      default:
        return error instanceof Error && !('code' in error) && !(error instanceof TypeError)
          ? error.message
          : fallback;
    }
  }
}
