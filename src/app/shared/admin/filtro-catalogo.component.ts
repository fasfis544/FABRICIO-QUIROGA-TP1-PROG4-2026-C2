/**
 * Anotacion de responsabilidad: Componente Angular de Filtro Catalogo; concentra la responsabilidad de este modulo dentro de app/shared/admin. Incluye principalmente: FiltroCatalogoComponent.
 */
import { Component, ElementRef, input, model, viewChild } from '@angular/core';

@Component({
  selector: 'app-filtro-catalogo',
  styles: `
    :host {
      display: block;
      margin-block: 1rem;
    }
    .filtros {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
      gap: 1rem;
    }
    label {
      display: block;
      margin-bottom: 0.5rem;
    }
    input,
    select {
      width: 100%;
      box-sizing: border-box;
    }
  `,
  template: `<div class="filtros">
      <div>
        <label [for]="prefijo() + '-buscar'">Buscar nombre o código</label>
        <input
          #buscador
          [id]="prefijo() + '-buscar'"
          type="search"
          [value]="busqueda()"
          (input)="buscar($event)"
        />
      </div>
      <div>
        <label [for]="prefijo() + '-estado'">Mostrar registros</label>
        <select [id]="prefijo() + '-estado'" [value]="estado()" (change)="filtrar($event)">
          <option value="activo">Activos</option>
          <option value="inactivo">Eliminados (recuperables)</option>
          <option value="">Todos</option>
        </select>
      </div>
    </div>
    <p role="status">
      {{ visibles() }} de {{ total() }} registros. Eliminar conserva el historial.
    </p>`,
})
export class FiltroCatalogoComponent {
  readonly prefijo = input.required<string>();
  readonly total = input.required<number>();
  readonly visibles = input.required<number>();
  readonly busqueda = model('');
  readonly estado = model('activo');
  private readonly buscador = viewChild<ElementRef<HTMLInputElement>>('buscador');

  enfocar(): void {
    this.buscador()?.nativeElement.focus();
  }
  protected buscar(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
  }
  protected filtrar(event: Event): void {
    this.estado.set((event.target as HTMLSelectElement).value);
  }
}
