/**
 * Anotacion de responsabilidad: Archivo de soporte del sistema de Auth Frame; concentra la responsabilidad de este modulo dentro de app/features/auth/ui. Incluye principalmente: AuthFrameComponent.
 */
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-auth-frame', imports: [RouterLink], styleUrl: './auth-frame.scss',
  template: `
    <section class="auth-page" aria-labelledby="auth-title">
      <div class="auth-card">
        <a class="auth-brand" routerLink="/" aria-label="Cine Aurora, inicio"><span aria-hidden="true">✦</span> CINE AURORA</a>
        <span class="eyebrow">TU CUENTA AURORA</span>
        <h1 id="auth-title">{{ titulo() }}</h1>
        <p class="description">{{ descripcion() }}</p>
        <ng-content />
      </div>
    </section>
  `,
})
export class AuthFrameComponent {
  readonly titulo = input.required<string>();
  readonly descripcion = input.required<string>();
}
