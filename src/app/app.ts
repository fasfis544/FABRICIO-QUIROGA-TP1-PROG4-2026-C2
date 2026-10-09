/**
 * Anotacion de responsabilidad: Archivo de soporte del sistema de App; concentra la responsabilidad de este modulo dentro de app. Incluye principalmente: App.
 */
import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { SesionService } from './core/auth/sesion.service';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('sistema-cine');
  protected readonly sesion = inject(SesionService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly saliendo = signal(false);
  protected readonly errorSalida = signal<string | null>(null);
  protected readonly destinoCuenta = computed(() =>
    this.sesion.autenticado() ? '/perfil' : '/auth/login',
  );

  constructor() {
    effect(() => {
      if (
        !this.saliendo() &&
        this.sesion.cargada() &&
        !this.sesion.autenticado() &&
        /^\/(perfil|admin|empleados)(\/|$)/.test(this.router.url)
      ) {
        void this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url } });
      }
    });
  }

  protected async salir(): Promise<void> {
    if (this.saliendo()) return;
    this.saliendo.set(true);
    this.errorSalida.set(null);
    try {
      await this.auth.cerrarSesion();
      await this.router.navigateByUrl('/auth/login');
    } catch (error: unknown) {
      this.errorSalida.set(error instanceof Error ? error.message : 'No pudimos cerrar la sesión.');
    } finally {
      this.saliendo.set(false);
    }
  }
}
