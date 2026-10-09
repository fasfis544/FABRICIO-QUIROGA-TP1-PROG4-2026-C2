/**
 * Anotacion de responsabilidad: Componente Angular de Oauth; concentra la responsabilidad de este modulo dentro de app/features/auth. Incluye principalmente: OAuthComponent.
 */
import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CuentaService } from '../../core/auth/cuenta.service';
@Component({
  imports: [RouterLink],
  template: `<section style="max-width:640px;margin:3rem auto;padding:1rem">
    <h1>Acceso con proveedor</h1>
    @if (error()) {
      <p role="alert">{{ error() }}</p>
      <a routerLink="/auth/login">Volver a ingresar</a>
    } @else {
      <p role="status">Validando tu sesión…</p>
    }
  </section>`,
})
export class OAuthComponent implements OnInit {
  private readonly cuenta = inject(CuentaService);
  private readonly router = inject(Router);
  protected readonly error = signal('');
  async ngOnInit(): Promise<void> {
    try {
      await this.cuenta.completarOAuth();
      await this.router.navigateByUrl('/perfil', { replaceUrl: true });
    } catch (e: unknown) {
      // Eliminar parámetros/tokens del callback incluso al fallar, sin exponerlos en mensajes.
      window.history.replaceState(null, '', '/auth/oauth');
      this.error.set(e instanceof Error ? e.message : 'No se pudo completar OAuth.');
    }
  }
}
