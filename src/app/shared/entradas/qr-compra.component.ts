/**
 * Anotacion de responsabilidad: Componente Angular de Qr Compra; concentra la responsabilidad de este modulo dentro de app/shared/entradas. Incluye principalmente: QrCompraComponent.
 */
import { Component, computed, input } from '@angular/core';
import { ReservaCliente } from '../../data-access/perfiles/cliente.service';
import { QrEntradaComponent } from './qr.component';
@Component({
  selector: 'app-qr-compra',
  imports: [QrEntradaComponent],
  template: `<section aria-label="Código único de compra">
    <h2>QR de la compra</h2>
    <code>{{ compra().qr_compra }}</code>
    <p>Mismo código para todas las butacas y el candy. Cada prestación se valida una sola vez.</p>
    <p>
      Ingreso: {{ ingresoUsado() ? 'Utilizado' : 'Sin utilizar' }} · Candy:
      {{
        !compra().candy.length
          ? 'No contratado'
          : compra().candy_usada_en
            ? 'Retirado'
            : 'Sin retirar'
      }}
    </p>
    @if (compra().estado === 'confirmada' && !agotado()) {
      <app-qr-entrada
        [codigo]="compra().qr_compra"
        descripcion="QR único para ingreso a sala y retiro de candy"
      />
    }
    @if (compra().pelicula.clasificacion !== 'ATP') {
      <p>Debe asistir acompañado de un adulto. La restricción etaria sigue vigente.</p>
    }
    @if (compra().pago_simulado) {
      <p>
        Compra con pago simulado: demostración académica, sin cobro real. No debés pagar en
        boletería. El QR identifica la compra; la validación del ingreso y del candy es independiente.
      </p>
    }
  </section>`,
})
export class QrCompraComponent {
  readonly compra = input.required<ReservaCliente>();
  protected readonly ingresoUsado = computed(
    () =>
      this.compra().entradas.length > 0 && this.compra().entradas.every((e) => e.usada_en !== null),
  );
  protected readonly agotado = computed(
    () =>
      this.ingresoUsado() && (!this.compra().candy.length || this.compra().candy_usada_en !== null),
  );
}
