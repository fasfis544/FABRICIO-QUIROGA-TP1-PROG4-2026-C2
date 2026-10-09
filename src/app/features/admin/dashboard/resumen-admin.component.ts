/**
 * Anotacion de responsabilidad: Componente Angular de Resumen Admin; concentra la responsabilidad de este modulo dentro de app/features/admin/dashboard. Incluye principalmente: ResumenAdmin, ResumenAdminComponent, hasta.
 */
import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdministracionService } from '../../../data-access/cine/administracion.service';
import { OperacionesService } from '../../../data-access/cine/operaciones.service';
import { PrecioArsPipe } from '../../../shared/cine/pipes';

interface ResumenAdmin {
  compras: number;
  entradas: number;
  neto: number;
  salas: number;
  funciones: number;
  fecha: Date;
}
@Component({
  selector: 'app-resumen-admin',
  imports: [DatePipe, PrecioArsPipe, RouterLink],
  styles: `
    :host {
      display: block;
      margin-bottom: 2rem;
    }
    .indicadores {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
      gap: 1rem;
    }
    article {
      min-width: 0;
      padding: 1.2rem;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--surface);
    }
    h2 {
      font-size: 1.1rem;
    }
    h3 {
      font-size: 0.85rem;
      margin-top: 0;
      color: var(--muted);
    }
    strong {
      font-size: 1.3rem;
      overflow-wrap: anywhere;
    }
    p {
      color: var(--muted);
      line-height: 1.6;
    }
    .error {
      color: var(--danger);
    }
    button {
      margin-block: 1rem;
    }
  `,
  template: `<section aria-labelledby="resumen-admin-titulo">
    <h2 id="resumen-admin-titulo">Un vistazo a la operación</h2>
    <p>Compras confirmadas de los últimos siete días. Pagos simulados, sin cobro real.</p>
    @if (cargando()) {
      <p role="status">Consultando indicadores…</p>
    }
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
    }
    @if (datos(); as d) {
      <div class="indicadores">
        <article>
          <h3>Compras · 7 días</h3>
          <strong>{{ d.compras }}</strong>
          <p>{{ d.entradas }} entradas activas</p>
        </article>
        <article>
          <h3>Neto simulado · 7 días</h3>
          <strong>{{ d.neto | precioArs }}</strong>
          <p>Después del crédito aplicado</p>
        </article>
        <article>
          <h3>Salas activas</h3>
          <strong>{{ d.salas }}</strong>
          <p><a routerLink="/admin/salas">Gestionar salas</a></p>
        </article>
        <article>
          <h3>Funciones futuras activas</h3>
          <strong>{{ d.funciones }}</strong>
          <p><a routerLink="/admin/funciones">Ver programación</a></p>
        </article>
      </div>
      <p>
        Consultado el {{ d.fecha | date: 'dd/MM/yyyy HH:mm' : '-0300' }} (Argentina). Función activa
        no garantiza venta habilitada ni butacas libres.
      </p>
    }
    <button class="btn btn--ghost" type="button" [disabled]="cargando()" (click)="cargar()">
      Actualizar indicadores
    </button>
    <a routerLink="/admin/reportes/ventas">Ver reportes completos</a>
  </section>`,
})
export class ResumenAdminComponent implements OnInit {
  private readonly admin = inject(AdministracionService);
  private readonly operaciones = inject(OperacionesService);
  protected readonly cargando = signal(false);
  protected readonly error = signal('');
  protected readonly datos = signal<ResumenAdmin | null>(null);
  ngOnInit(): void {
    void this.cargar();
  }
  protected async cargar(): Promise<void> {
    if (this.cargando()) return;
    this.cargando.set(true);
    this.error.set('');
    this.datos.set(null);
    const hasta = new Date();
    try {
      const [reporte, salas, funciones] = await Promise.all([
        this.admin.reporte(
          new Date(hasta.getTime() - 7 * 86400000).toISOString(),
          hasta.toISOString(),
        ),
        this.operaciones.salas(),
        this.operaciones.funcionesAdministracion(),
      ]);
      this.datos.set({
        compras: reporte.compras,
        entradas: reporte.entradas,
        neto: reporte.abonado,
        salas: salas.filter((s) => s.activa).length,
        funciones: funciones.filter((f) => f.activa && Date.parse(f.inicio) > hasta.getTime())
          .length,
        fecha: hasta,
      });
    } catch {
      this.error.set(
        'No pudimos consultar los indicadores. Verificá tu acceso y conexión e intentá nuevamente.',
      );
    } finally {
      this.cargando.set(false);
    }
  }
}
