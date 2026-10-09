/**
 * Anotacion de responsabilidad: Componente Angular de Imagen Cine; concentra la responsabilidad de este modulo dentro de app/shared/cine. Incluye principalmente: ImagenCineComponent.
 */
import { NgOptimizedImage } from '@angular/common';
import { Component, computed, input, linkedSignal } from '@angular/core';

@Component({
  selector: 'app-imagen-cine',
  imports: [NgOptimizedImage],
  host: { '[style.aspect-ratio]': "tipo() === 'afiche' ? '2 / 3' : '4 / 3'" },
  styles: `
    :host {
      display: block;
      position: relative;
      width: 100%;
      overflow: hidden;
      border-radius: 10px;
      background: var(--surface-raised, #1c1c1f);
    }
    img {
      object-fit: contain;
    }
    p {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      margin: 0;
      padding: 1rem;
      text-align: center;
      color: var(--muted, #a1a1aa);
    }
  `,
  template: `@if (!agotada()) {
      <img [ngSrc]="imagen()" [alt]="descripcion()" fill [sizes]="sizes()" (error)="fallo()" />
    } @else {
      <p>{{ descripcion() }} · Imagen no disponible</p>
    }`,
})
export class ImagenCineComponent {
  readonly src = input<string | null | undefined>('');
  readonly nombre = input.required<string>();
  readonly tipo = input<'afiche' | 'candy'>('afiche');
  readonly sizes = input('(max-width: 600px) 90vw, 30vw');
  private readonly respaldo = computed(
    () => `/images/${this.tipo() === 'afiche' ? 'afiche' : 'candy'}-respaldo.svg`,
  );
  protected readonly imagen = linkedSignal(() => this.src()?.trim() || this.respaldo());
  protected readonly agotada = linkedSignal(() => {
    this.src();
    this.tipo();
    return false;
  });
  protected readonly descripcion = computed(
    () => `${this.tipo() === 'afiche' ? 'Afiche de' : 'Imagen de'} ${this.nombre()}`,
  );
  protected fallo(): void {
    if (this.imagen() === this.respaldo()) this.agotada.set(true);
    else this.imagen.set(this.respaldo());
  }
}
