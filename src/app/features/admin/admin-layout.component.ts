/**
 * Anotacion de responsabilidad: Componente Angular de Admin Layout; concentra la responsabilidad de este modulo dentro de app/features/admin. Incluye principalmente: AdminLayoutComponent, titulo.
 */
import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { areasAdmin } from './admin-navigation';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss',
})
export class AdminLayoutComponent {
  protected readonly areas = areasAdmin;
  protected readonly abierto = signal(false);
  private readonly injector = inject(Injector);
  private readonly contenido = viewChild<ElementRef<HTMLElement>>('contenido');
  protected vistaActivada(): void {
    this.abierto.set(false);
    afterNextRender(
      () => {
        const titulo = this.contenido()?.nativeElement.querySelector('h1');
        if (titulo) {
          titulo.tabIndex = -1;
          titulo.focus({ preventScroll: true });
        }
      },
      { injector: this.injector },
    );
  }
}
