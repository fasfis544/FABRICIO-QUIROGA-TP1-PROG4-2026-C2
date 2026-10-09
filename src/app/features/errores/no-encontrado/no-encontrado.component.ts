/**
 * Anotacion de responsabilidad: Componente Angular de No Encontrado; concentra la responsabilidad de este modulo dentro de app/features/errores/no-encontrado. Incluye principalmente: NoEncontradoComponent.
 */
import { afterRenderEffect, Component, ElementRef, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  host: { 'data-component': 'no-encontrado' },
  imports: [RouterLink],
  styleUrl: './no-encontrado.component.scss',
  templateUrl: './no-encontrado.component.html',
})
export class NoEncontradoComponent {
  private readonly titulo = viewChild<ElementRef<HTMLElement>>('titulo');
  constructor() {
    afterRenderEffect(() => this.titulo()?.nativeElement.focus({ preventScroll: true }));
  }
}
