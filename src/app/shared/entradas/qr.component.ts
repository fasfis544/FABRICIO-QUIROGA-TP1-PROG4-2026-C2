/**
 * Anotacion de responsabilidad: Componente Angular de Qr; concentra la responsabilidad de este modulo dentro de app/shared/entradas. Incluye principalmente: QrEntradaComponent, codigo.
 */
import { Component, effect, input, signal } from '@angular/core';
@Component({
  selector: 'app-qr-entrada',
  template: `@if (imagen()) {
      <img [src]="imagen()" width="220" height="220" [alt]="descripcion()" />
    }
    @if (error()) {
      <p role="alert">{{ error() }}</p>
    }`,
})
export class QrEntradaComponent {
  readonly codigo = input.required<string>();
  readonly descripcion = input('Código QR de entrada');
  protected readonly imagen = signal('');
  protected readonly error = signal('');
  constructor() {
    effect((onCleanup) => {
      const codigo = this.codigo();
      let cancelado = false;
      onCleanup(() => (cancelado = true));
      this.imagen.set('');
      this.error.set('');
      void import('qrcode')
        .then((q) => q.toDataURL(codigo, { width: 220, margin: 2, errorCorrectionLevel: 'M' }))
        .then((img) => {
          if (!cancelado) this.imagen.set(img);
        })
        .catch(() => {
          if (!cancelado) this.error.set('No pudimos generar el QR. Usá el código manual.');
        });
    });
  }
}
