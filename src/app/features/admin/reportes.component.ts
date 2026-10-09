/**
 * Anotacion de responsabilidad: Componente Angular de Reportes; concentra la responsabilidad de este modulo dentro de app/features/admin. Incluye principalmente: TipoReporte, ReportesComponent, r, end.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AdministracionService, ReporteAdmin } from '../../data-access/cine/administracion.service';
import { errorRango } from '../../data-access/cine/validacion-admin';
import { mensaje } from '../../data-access/cine/validacion';
import { fechaHoraArgentina, instanteArgentina } from '../../shared/cine/fecha-argentina';
import { PrecioArsPipe } from '../../shared/cine/pipes';
import {
  Celda,
  crearExcel,
  descargarArchivo,
  exportarPdf,
} from '../../shared/reportes/exportaciones';

type TipoReporte = 'ventas' | 'peliculas' | 'candy';
@Component({
  imports: [FormField, RouterLink, PrecioArsPipe],
  styleUrl: '../cine/cine.scss',
  template: `<section class="page">
    <a routerLink="/admin">Panel</a>
    <h1>Reporte de {{ titulo }}</h1>
    <nav aria-label="Tipos de reporte">
      <a routerLink="/admin/reportes/ventas">Ventas</a
      ><a routerLink="/admin/reportes/peliculas">Películas</a
      ><a routerLink="/admin/reportes/candy">Candy</a>
    </nav>
    <p class="feedback">
      Resumen operativo de compras con pago simulado, sin cobro real. No es una factura fiscal. Las
      ventas incluyen únicamente compras confirmadas y no canceladas.
    </p>
    <form (submit)="consultar($event)">
      <label for="r-desde">Desde (Argentina, incluido)</label
      ><input id="r-desde" type="datetime-local" [formField]="campos.desde" />
      <label for="r-hasta">Hasta (Argentina, excluido)</label
      ><input
        id="r-hasta"
        type="datetime-local"
        [formField]="campos.hasta"
        [attr.aria-invalid]="rangoError() ? true : null"
        aria-describedby="r-rango-error"
      />
      <p id="r-rango-error" class="error" aria-live="polite">{{ rangoError() }}</p>
      <button class="btn" [disabled]="ocupado()">Consultar</button
      ><button class="btn" type="button" [disabled]="ocupado()" (click)="periodo('semana')">
        Últimos 7 días</button
      ><button class="btn" type="button" [disabled]="ocupado()" (click)="periodo('mes')">
        Mes actual
      </button>
    </form>
    @if (ocupado()) {
      <p role="status">Procesando reporte…</p>
    }
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
    }
    @if (reporte(); as r) {
      <h2>Resultado consultado</h2>
      <p>{{ periodoConsultado() }}</p>
      <div class="grid" aria-label="Resumen del reporte">
        <article class="card">
          <h3>Total de compras</h3>
          <p>{{ r.compras }}</p>
        </article>
        <article class="card">
          <h3>Total recaudado</h3>
          <p>{{ r.abonado | precioArs }}</p>
          <small>Importe de pago simulado, sin cobro real</small>
        </article>
        <article class="card">
          <h3>Cantidad de entradas</h3>
          <p>{{ r.entradas }}</p>
        </article>
        <article class="card">
          <h3>Total de ventas</h3>
          <p>{{ r.total | precioArs }}</p>
          <small>Incluye crédito aplicado: {{ r.credito | precioArs }}</small>
        </article>
      </div>
      @if (tipo === 'peliculas' || tipo === 'candy') {
        <h2>Top {{ tipo === 'peliculas' ? 'películas' : 'productos' }}</h2>
        <ol
          [attr.aria-label]="
            tipo === 'peliculas' ? 'Ranking de ingresos validados' : 'Ranking de ventas candy'
          "
        >
          @for (f of filas(); track $index; let i = $index) {
            @if (i < 5) {
              <li>
                <strong>{{ f.nombre }}</strong> · {{ valorGrafico(f.cantidad, f.vistas) }}
                {{ tipo === 'peliculas' ? 'ingresos validados' : 'unidades' }}
              </li>
            }
          } @empty {
            <li>No hay ventas en este período.</li>
          }
        </ol>
      }
      <button class="btn" [disabled]="ocupado()" (click)="excel()">Exportar Excel (.xlsx)</button
      ><button class="btn" [disabled]="ocupado()" (click)="pdf()">Exportar PDF</button>
      <h2>
        Gráfico de
        {{
          tipo === 'ventas'
            ? 'entradas por día'
            : tipo === 'peliculas'
              ? 'ingresos validados por película'
              : 'unidades vendidas'
        }}
      </h2>
      @for (f of filas(); track $index) {
        <div class="report-bar">
          <label [for]="'grafico-' + $index"
            >{{ f.nombre }} · {{ valorGrafico(f.cantidad, f.vistas) }}</label
          ><meter
            [id]="'grafico-' + $index"
            min="0"
            [max]="maximo()"
            [value]="valorGrafico(f.cantidad, f.vistas)"
          >
            {{ valorGrafico(f.cantidad, f.vistas) }}
          </meter>
        </div>
      }
      <div
        class="table-scroll"
        tabindex="0"
        role="region"
        aria-label="Tabla del reporte, desplazable horizontalmente"
      >
        <table>
          <caption>
            Detalle de
            {{
              titulo
            }}
          </caption>
          <thead>
            <tr>
              @for (c of columnas(); track c) {
                <th scope="col">{{ c }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (f of tabla(); track $index) {
              <tr>
                @for (c of f; track $index) {
                  <td>{{ c }}</td>
                }
              </tr>
            } @empty {
              <tr>
                <td [attr.colspan]="columnas().length">No hay datos en este período.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  </section>`,
})
export class ReportesComponent {
  private readonly admin = inject(AdministracionService);
  protected readonly tipo = (inject(ActivatedRoute).snapshot.data['tipo'] ??
    'ventas') as TipoReporte;
  protected readonly titulo =
    this.tipo === 'ventas' ? 'ventas' : this.tipo === 'peliculas' ? 'películas' : 'candy';
  protected readonly datos = signal({ desde: '', hasta: '' });
  protected readonly campos = form(this.datos);
  protected readonly reporte = signal<ReporteAdmin | null>(null);
  protected readonly ocupado = signal(false);
  protected readonly error = signal('');
  protected readonly rangoError = signal('');
  protected readonly periodoConsultado = signal('');
  protected readonly filas = computed(() => {
    const r = this.reporte();
    return !r
      ? []
      : this.tipo === 'ventas'
        ? r.diarios
        : this.tipo === 'peliculas'
          ? r.peliculas
          : r.candy;
  });
  protected readonly columnas = computed(() =>
    this.tipo === 'ventas'
      ? ['Fecha (Argentina)', 'Entradas', 'Total ARS']
      : this.tipo === 'peliculas'
        ? ['Película', 'Entradas vendidas', 'Ingresos validados']
        : ['Producto', 'Unidades vendidas'],
  );
  protected readonly tabla = computed<Celda[][]>(() =>
    this.filas().map((f) =>
      this.tipo === 'ventas'
        ? [f.nombre, f.cantidad, f.importe]
        : this.tipo === 'peliculas'
          ? [f.nombre, f.cantidad, f.vistas]
          : [f.nombre, f.cantidad],
    ),
  );
  protected readonly maximo = computed(() =>
    Math.max(1, ...this.filas().map((f) => this.valorGrafico(f.cantidad, f.vistas))),
  );
  protected valorGrafico(cantidad: number, vistas: number): number {
    return this.tipo === 'peliculas' ? vistas : cantidad;
  }
  protected periodo(tipo: 'semana' | 'mes'): void {
    const end = new Date();
    const hasta = fechaHoraArgentina(end);
    const desde =
      tipo === 'semana'
        ? fechaHoraArgentina(new Date(end.getTime() - 7 * 86400000))
        : hasta.slice(0, 7) + '-01T00:00';
    this.datos.set({ desde, hasta });
  }
  protected async consultar(event: Event): Promise<void> {
    event.preventDefault();
    if (this.ocupado()) return;
    const d = this.datos();
    let error = errorRango(d.desde, d.hasta);
    if (
      !error &&
      Date.parse(instanteArgentina(d.hasta)) - Date.parse(instanteArgentina(d.desde)) >
        366 * 86400000
    )
      error = 'El período máximo es de 366 días.';
    this.rangoError.set(error);
    if (error) return;
    this.ocupado.set(true);
    this.error.set('');
    this.reporte.set(null);
    try {
      this.reporte.set(
        await this.admin.reporte(instanteArgentina(d.desde), instanteArgentina(d.hasta)),
      );
      this.periodoConsultado.set(
        `Desde ${d.desde.replace('T', ' ')} hasta ${d.hasta.replace('T', ' ')} (excluido), hora de Argentina (UTC−03).`,
      );
    } catch (e: unknown) {
      const detalle = mensaje(e).toLowerCase();
      this.error.set(
        detalle.includes('período') || detalle.includes('periodo')
          ? 'Elegí un período válido de hasta 366 días.'
          : detalle.includes('acceso denegado')
            ? 'Solo un administrador puede consultar reportes.'
            : 'No pudimos cargar el reporte. Verificá la conexión e intentá nuevamente.',
      );
    } finally {
      this.ocupado.set(false);
    }
  }
  private resumen(): string[] {
    const r = this.reporte()!;
    return [
      this.periodoConsultado(),
      'Compras con pago simulado, sin cobro real. No es factura fiscal.',
      `Compras: ${r.compras}; entradas: ${r.entradas}; total ARS: ${r.total}; crédito: ${r.credito}; recaudado: ${r.abonado}`,
      'Ventas por creación de compra; vistas por ingreso validado; se excluyen cancelaciones.',
    ];
  }
  protected excel(): void {
    if (!this.reporte()) return;
    try {
      const bytes = crearExcel([
        { nombre: 'Resumen', filas: this.resumen().map((s) => [s]) },
        { nombre: 'Detalle', filas: [this.columnas(), ...this.tabla()] },
      ]);
      descargarArchivo(
        new Blob([bytes], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        `cine-${this.tipo}.xlsx`,
      );
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    }
  }
  protected async pdf(): Promise<void> {
    if (!this.reporte() || this.ocupado()) return;
    this.ocupado.set(true);
    this.error.set('');
    try {
      await exportarPdf(
        `Reporte de ${this.titulo}`,
        this.resumen(),
        this.columnas(),
        this.tabla(),
        `cine-${this.tipo}.pdf`,
      );
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
