/**
 * Anotacion de responsabilidad: Componente Angular de Escaner; concentra la responsabilidad de este modulo dentro de app/shared/entradas. Incluye principalmente: codigoEntrada, s, EscanerEntradaComponent, rev.
 */
import {
  Component,
  DestroyRef,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { IScannerControls } from '@zxing/browser';
export function codigoEntrada(value: string): string | null {
  const s = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : null;
}
@Component({
  selector: 'app-escaner-entrada',
  template: `<button
      type="button"
      class="btn"
      [disabled]="iniciando() || activo()"
      (click)="iniciar()"
    >
      {{ iniciando() ? 'Abriendo cámara…' : 'Escanear QR con cámara' }}</button
    ><button type="button" class="btn" [disabled]="!activo() && !iniciando()" (click)="detener()">
      Detener cámara</button
    ><video
      #video
      [hidden]="!activo()"
      autoplay
      muted
      playsinline
      aria-label="Vista de cámara para escanear QR"
      style="width:100%;max-width:480px"
    ></video>
    @if (error()) {
      <p role="alert">{{ error() }}</p>
    }
    <p class="hint">
      La lectura completa el código. Confirmá el ingreso con el botón de validación.
    </p>`,
})
export class EscanerEntradaComponent {
  readonly leido = output<string>();
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private controls: IScannerControls | null = null;
  private revision = 0;
  protected readonly iniciando = signal(false);
  protected readonly activo = signal(false);
  protected readonly error = signal('');
  constructor() {
    inject(DestroyRef).onDestroy(() => this.detener());
  }
  protected async iniciar(): Promise<void> {
    if (this.iniciando() || this.activo()) return;
    const rev = ++this.revision;
    this.iniciando.set(true);
    this.error.set('');
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      if (rev !== this.revision) return;
      this.activo.set(true);
      const reader = new BrowserQRCodeReader();
      const video = this.video()?.nativeElement;
      if (!video) throw new Error('Vista no disponible');
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        video,
        (result, _error, ctrl) => {
          if (result && rev === this.revision) {
            const codigo = codigoEntrada(result.getText());
            if (codigo) {
              this.leido.emit(codigo);
              ctrl.stop();
              this.detener();
            } else this.error.set('El QR no contiene un código de entrada válido.');
          }
        },
      );
      if (rev !== this.revision) controls.stop();
      else this.controls = controls;
    } catch {
      if (rev === this.revision) {
        this.error.set(
          'No pudimos acceder a la cámara. Revisá permisos, HTTPS o usá el código manual.',
        );
        this.activo.set(false);
      }
    } finally {
      if (rev === this.revision) this.iniciando.set(false);
    }
  }
  protected detener(): void {
    this.revision++;
    this.controls?.stop();
    this.controls = null;
    this.activo.set(false);
    this.iniciando.set(false);
    const stream = this.video()?.nativeElement.srcObject;
    if (typeof MediaStream !== 'undefined' && stream instanceof MediaStream)
      stream.getTracks().forEach((t) => t.stop());
  }
}
