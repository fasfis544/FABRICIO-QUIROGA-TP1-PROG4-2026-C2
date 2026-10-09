/**
 * Anotacion de responsabilidad: Componente Angular de Sin Permiso; concentra la responsabilidad de este modulo dentro de app/features/errores/sin-permiso. Incluye principalmente: SinPermisoComponent.
 */
import { afterRenderEffect, Component, ElementRef, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  host: { 'data-component': 'sin-permiso' },
  imports: [RouterLink],
  styleUrl: './sin-permiso.component.scss',
  templateUrl: './sin-permiso.component.html',
})
export class SinPermisoComponent {
  private readonly titulo = viewChild<ElementRef<HTMLElement>>('titulo');
  constructor() {
    afterRenderEffect(() => this.titulo()?.nativeElement.focus({ preventScroll: true }));
  }
}
