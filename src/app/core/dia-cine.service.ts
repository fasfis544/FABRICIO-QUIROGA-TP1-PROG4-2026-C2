/**
 * Guarda la fecha argentina en una signal y la expone como hoy mediante asReadonly(), sin permitir modificarla desde otros componentes.
setInterval(..., 60000) la actualiza cada minuto si la pestaña está visible; también al recuperar foco o cambiar visibilidad.
DestroyRef.onDestroy() elimina el temporizador y los listeners; así las pantallas pueden actualizar estrenos al cambiar el día sin dejar recursos activos.
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
