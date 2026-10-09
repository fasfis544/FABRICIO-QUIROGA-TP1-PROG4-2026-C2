/**
 * Anotacion de responsabilidad: Servicio Angular de Dia Cine; concentra la responsabilidad de este modulo dentro de app/core. Incluye principalmente: DiaCineService, actualizar, visible, timer.
 */
import { DestroyRef, DOCUMENT, inject, Service, signal } from '@angular/core';
import { fechaArgentina } from '../shared/cine/fecha-argentina';

/** Día del establecimiento: se renueva tras medianoche y al volver a la pestaña. */
@Service()
export class DiaCineService {
  private readonly dia = signal(fechaArgentina());
  readonly hoy = this.dia.asReadonly();
  constructor() {
    const document = inject(DOCUMENT);
    const actualizar = () => this.dia.set(fechaArgentina());
    const visible = () => {
      if (!document.hidden) actualizar();
    };
    const timer = setInterval(visible, 60000);
    document.addEventListener('visibilitychange', visible);
    document.defaultView?.addEventListener('focus', visible);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      document.defaultView?.removeEventListener('focus', visible);
    });
  }
}
