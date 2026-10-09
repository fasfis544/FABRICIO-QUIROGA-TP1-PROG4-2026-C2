/**
 * Anotacion de responsabilidad: Componente Angular de Accion Catalogo; concentra la responsabilidad de este modulo dentro de app/shared/admin. Incluye principalmente: AccionCatalogoComponent, texto.
 */
import { DOCUMENT } from '@angular/common';
import { Component, inject, input, output } from '@angular/core';

@Component({
  selector: 'app-accion-catalogo',
  template: `<button
    class="btn btn--ghost"
    type="button"
    [disabled]="ocupado()"
    [attr.aria-label]="(activo() ? 'Eliminar ' : 'Restaurar ') + nombre()"
    (click)="solicitar()"
  >
    {{ activo() ? 'Eliminar' : 'Restaurar' }}
  </button>`,
})
export class AccionCatalogoComponent {
  readonly nombre = input.required<string>();
  readonly activo = input.required<boolean>();
  readonly ocupado = input(false);
  readonly cambiar = output<boolean>();
  private readonly document = inject(DOCUMENT);

  protected solicitar(): void {
    if (this.ocupado()) return;
    const texto = this.activo()
      ? `¿Eliminar «${this.nombre()}» del listado activo? El registro y su historial se conservan en la base de datos. Podés restaurarlo desde «Eliminados». No cancela funciones ni compras.`
      : `¿Restaurar «${this.nombre()}» al listado activo? Volverá a estar disponible según sus condiciones y vigencia.`;
    if (this.document.defaultView?.confirm(texto)) this.cambiar.emit(!this.activo());
  }
}
