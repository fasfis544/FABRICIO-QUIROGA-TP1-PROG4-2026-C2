/**
 * Anotacion de responsabilidad: Componente Angular de Estrellas; concentra la responsabilidad de este modulo dentro de app/shared/cine. Incluye principalmente: EstrellasComponent.
 */
import { Component, input, model } from '@angular/core';
@Component({
  selector: 'app-estrellas',
  template: `<fieldset>
    <legend>{{ etiqueta() }}</legend>
    @for (estrella of estrellas; track estrella) {
      <label
        ><input
          type="radio"
          [name]="nombre"
          [value]="estrella"
          [checked]="valor() === estrella"
          (change)="valor.set(estrella)"
        />
        <span aria-hidden="true">{{ '★'.repeat(estrella) }}</span
        ><span class="sr-only">{{ estrella }} de 5 estrellas</span>
      </label>
    }
  </fieldset>`,
  styles: `
    fieldset {
      border: 1px solid var(--line);
      padding: 1rem;
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
    label {
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    input {
      width: auto;
    }
    input:focus-visible {
      outline: 2px solid white;
    }
    span[aria-hidden] {
      color: #f5d98a;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  `,
})
export class EstrellasComponent {
  private static siguiente = 0;
  protected readonly nombre = `estrellas-${EstrellasComponent.siguiente++}`;
  protected readonly estrellas = [1, 2, 3, 4, 5];
  readonly etiqueta = input('Calificación');
  readonly valor = model(5);
}
