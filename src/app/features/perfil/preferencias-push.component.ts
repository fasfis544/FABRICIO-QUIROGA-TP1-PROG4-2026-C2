import { Component, OnInit, inject } from '@angular/core';
import { WebPushService } from '../../core/notificaciones/web-push.service';

@Component({
  selector: 'app-preferencias-push',
  styles: `
    :host {
      display: block;
      margin-block: 1.5rem;
    }
    .card {
      padding: clamp(1rem, 3vw, 1.5rem);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
    button {
      max-width: 100%;
    }
    p {
      line-height: 1.65;
    }
  `,
  template: `<section aria-labelledby="push-titulo" class="card">
    <h2 id="push-titulo">Notificaciones en este dispositivo</h2>
    <p>
      Activá avisos de venta, recordatorios de 24 h y 2 h, e ingreso o retiro de candy. Son
      opcionales. No muestran tu QR ni enlaces secretos: abren tu cuenta.
    </p>
    @if (!push.disponible) {
      <p>
        Web Push requiere HTTPS, un navegador compatible y la PWA publicada. En iPhone/iPad, instalá
        la PWA en la pantalla de inicio y abrila desde allí.
      </p>
    } @else {
      @if (push.ocupado()) {
        <p role="status">Actualizando notificaciones del dispositivo…</p>
      }
      @if (!push.ocupado() && !push.configurada()) {
        <p>
          El envío Push todavía no está habilitado para esta versión. La bandeja sigue funcionando.
        </p>
      }
      @if (push.permiso() === 'denied') {
        <p>El navegador bloqueó el permiso. Cambialo en sus ajustes si querés recibir avisos.</p>
      }
      <p>
        Estado:
        <strong>{{
          !push.verificada()
            ? 'No verificado'
            : push.activa()
              ? 'Activado para tu cuenta'
              : 'Desactivado para tu cuenta'
        }}</strong
        >.
      </p>
      <div class="actions">
        <button
          type="button"
          class="btn"
          [disabled]="
            push.ocupado() || !push.configurada() || push.activa() || push.permiso() === 'denied'
          "
          (click)="push.activar()"
        >
          Activar Push en este dispositivo
        </button>
        <button
          type="button"
          class="btn btn--ghost"
          [disabled]="push.ocupado()"
          (click)="push.desactivar()"
        >
          Desactivar Push
        </button>
        <button
          type="button"
          class="btn btn--ghost"
          [disabled]="push.ocupado()"
          (click)="push.actualizar()"
        >
          Actualizar estado Push
        </button>
      </div>
    }
    @if (push.error()) {
      <p role="alert">{{ push.error() }}</p>
    }
    @if (push.exito()) {
      <p role="status">{{ push.exito() }}</p>
    }
    <p>
      Cerrar sesión intenta desactivar este dispositivo, no los demás. Cambiar de cuenta requiere
      activarlo nuevamente. El permiso del navegador se cambia desde sus ajustes.
    </p>
  </section>`,
})
export class PreferenciasPushComponent implements OnInit {
  protected readonly push = inject(WebPushService);
  ngOnInit(): void {
    void this.push.actualizar();
  }
}
