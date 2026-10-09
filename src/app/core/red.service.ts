/**
 * Anotacion de responsabilidad: Servicio Angular de Red; concentra la responsabilidad de este modulo dentro de app/core. Incluye principalmente: RedService, actualizar.
 */
import { DestroyRef, DOCUMENT, inject, Service, signal } from '@angular/core';
@Service()
export class RedService {
  private readonly window = inject(DOCUMENT).defaultView;
  readonly online = signal(this.window?.navigator.onLine ?? true);
  constructor() {
    const actualizar = () => this.online.set(this.window?.navigator.onLine ?? true);
    this.window?.addEventListener('online', actualizar);
    this.window?.addEventListener('offline', actualizar);
    inject(DestroyRef).onDestroy(() => {
      this.window?.removeEventListener('online', actualizar);
      this.window?.removeEventListener('offline', actualizar);
    });
  }
}
