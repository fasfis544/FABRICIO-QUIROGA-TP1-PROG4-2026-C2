/**
 * Anotacion de responsabilidad: Componente Angular de Reserva; concentra la responsabilidad de este modulo dentro de app/features/cine. Incluye principalmente: ReservaComponent, d, ocupadas, bs.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, DOCUMENT, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  Disponibilidad,
  EstadoConexion,
  OperacionesService,
} from '../../data-access/cine/operaciones.service';
import { RedService } from '../../core/red.service';
import { mensaje } from '../../data-access/cine/validacion';
import { Carrito } from '../compra/services/carrito.service';
import { butacasContiguas } from '../../shared/cine/reglas';
import { PrecioArsPipe } from '../../shared/cine/pipes';
import { HighlightButacaDirective } from '../../shared/cine/directivas';
@Component({
  imports: [DatePipe, PrecioArsPipe, ReactiveFormsModule, HighlightButacaDirective],
  styleUrl: './cine.scss',
  template: `<section class="page">
    <h1>Elegí tus butacas</h1>
    <p class="feedback">
      Compra con pago simulado, sin cobro real. Seleccionar butacas no las retiene: el servidor
      vuelve a comprobar precio y disponibilidad al confirmar la compra.
    </p>
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
    }
    @if (cargando()) {
      <p role="status">Consultando disponibilidad…</p>
    }
    <div class="feedback connection-status" role="status" aria-live="polite">
      <strong>{{ estadoConexion() }}</strong>
      @if (ultimaActualizacion(); as fecha) {
        <span
          >Última consulta exitosa:
          {{ fecha | date: 'dd/MM/yyyy HH:mm:ss' : '-0300' }} (Argentina)</span
        >
      } @else {
        <span>Todavía no se consultó la disponibilidad.</span>
      }
    </div>
    <button class="btn" (click)="cargar()" [disabled]="cargando() || !red.online()">
      Actualizar disponibilidad
    </button>
    @if (datos(); as d) {
      <h2>{{ d.sala.nombre }}</h2>
      <p>
        {{ d.funcion.inicio | date: 'dd/MM/yyyy HH:mm' : '-0300' }} (Argentina) ·
        {{ d.funcion.idioma }} ·
        {{ d.funcion.formato }}
      </p>
      <p>
        Normal · Accesible J/K · VIP R/S/T. El precio individual aparece en cada butaca. Máximo 8,
        contiguas en una fila y sin cruzar pasillos.
      </p>
      <p class="feedback">
        Libres: {{ resumen().libres }} · Ocupadas: {{ resumen().ocupadas }} · En mantenimiento:
        {{ resumen().mantenimiento }}
      </p>
      @if (!d.sala.distribucion_documento) {
        <p role="status">
          Sala histórica: el administrador debe adaptarla antes de programar nuevas funciones.
        </p>
      }
      <form [formGroup]="formulario" (ngSubmit)="continuar()">
        <div
          class="seat-map"
          tabindex="0"
          role="region"
          aria-label="Mapa de butacas, desplazable horizontalmente"
        >
          <p class="screen">PANTALLA</p>
          @for (fila of filas(); track fila.nombre) {
            <div class="seat-row" role="group" [attr.aria-label]="'Fila ' + fila.nombre">
              <strong>{{ fila.nombre }}</strong>
              @for (bloque of fila.bloques; track $index) {
                <div class="seat-block">
                  @for (b of bloque; track b.codigo) {
                    <button
                      type="button"
                      class="seat"
                      [class.vip]="b.tipo === 'vip'"
                      [class.accessible]="b.tipo === 'accesible'"
                      [appHighlightButaca]="seleccion().includes(b.codigo)"
                      [disabled]="
                        !red.online() ||
                        d.ocupadas.includes(b.codigo) ||
                        d.bloqueadas?.includes(b.codigo)
                      "
                      [attr.aria-pressed]="seleccion().includes(b.codigo)"
                      [attr.aria-label]="
                        b.codigo +
                        ', ' +
                        b.tipo +
                        ', ' +
                        (b.precio | precioArs) +
                        (d.ocupadas.includes(b.codigo) ? ', ocupada' : '') +
                        (d.bloqueadas?.includes(b.codigo) ? ', mantenimiento' : '')
                      "
                      (click)="elegir(b.codigo)"
                    >
                      <span>{{ b.codigo }}, </span><small>{{ b.tipo }}, </small
                      ><small>{{ b.precio | precioArs }}</small>
                    </button>
                  }
                </div>
              }
            </div>
          }
        </div>
        <p role="status">
          Seleccionadas: {{ seleccion().join(', ') || 'ninguna' }} · Total entradas
          {{ total() | precioArs }}
        </p>
        @if (seleccion().length && formulario.invalid) {
          <p role="alert">Elegí butacas contiguas en una misma fila y bloque.</p>
        }
        <p>
          Actualización por Realtime, con respaldo cada 15 segundos. La disponibilidad final se
          valida en servidor.
        </p>
        <button class="btn" [disabled]="cargando() || !red.online() || formulario.invalid">
          Continuar a candy y checkout
        </button>
      </form>
    }
  </section>`,
})
export class ReservaComponent implements OnInit {
  private readonly service = inject(OperacionesService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('funcionId') ?? '';
  private readonly carrito = inject(Carrito);
  protected readonly red = inject(RedService);
  protected readonly conexion = signal<EstadoConexion>('conectando');
  protected readonly ultimaActualizacion = signal<Date | null>(null);
  protected readonly estadoConexion = computed(() =>
    !this.red.online()
      ? 'Sin conexión: no se pueden elegir ni comprar butacas.'
      : this.conexion() === 'conectada'
        ? 'Avisos en vivo conectados'
        : this.conexion() === 'conectando'
          ? 'Conectando avisos en vivo…'
          : 'Avisos en vivo no disponibles; actualización de respaldo cada 15 segundos.',
  );
  protected readonly resumen = computed(() => {
    const d = this.datos();
    const ocupadas = new Set(d?.ocupadas ?? []),
      mantenimiento = new Set(d?.bloqueadas ?? []);
    return {
      ocupadas: d?.butacas.filter((b) => ocupadas.has(b.codigo)).length ?? 0,
      mantenimiento:
        d?.butacas.filter((b) => !ocupadas.has(b.codigo) && mantenimiento.has(b.codigo)).length ??
        0,
      libres:
        d?.butacas.filter((b) => !ocupadas.has(b.codigo) && !mantenimiento.has(b.codigo)).length ??
        0,
    };
  });
  private cerrada = false;
  protected readonly datos = signal<Disponibilidad | null>(null);
  protected readonly seleccion = signal<string[]>([]);
  protected readonly error = signal('');
  protected readonly cargando = signal(false);
  protected readonly control = new FormControl<string[]>([], {
    nonNullable: true,
    validators: [butacasContiguas(() => this.datos()?.butacas ?? [])],
  });
  protected readonly formulario = new FormGroup({ butacas: this.control });
  protected readonly total = computed(() =>
    (this.datos()?.butacas ?? [])
      .filter((b) => this.seleccion().includes(b.codigo))
      .reduce((s, b) => s + b.precio, 0),
  );
  protected readonly filas = computed(() => {
    const bs = this.datos()?.butacas ?? [];
    return [...new Set(bs.map((b) => b.fila))].map((nombre) => ({
      nombre,
      bloques: [...new Set(bs.filter((b) => b.fila === nombre).map((b) => b.bloque))].map(
        (bloque) => bs.filter((b) => b.fila === nombre && b.bloque === bloque),
      ),
    }));
  });
  ngOnInit(): void {
    if (this.carrito.funcion() === this.id) this.actualizarSeleccion(this.carrito.butacas());
    void this.cargar();
    const dejar = this.service.observar(
      this.id,
      () => {
        if (!this.document.hidden) void this.cargar();
      },
      (estado) => {
        const anterior = this.conexion();
        this.conexion.set(estado);
        if (estado === 'conectada' && anterior !== 'conectada' && !this.document.hidden)
          void this.cargar();
      },
    );
    const visible = () => {
      if (!this.document.hidden) void this.cargar();
    };
    this.document.addEventListener('visibilitychange', visible);
    this.document.defaultView?.addEventListener('online', visible);
    const timer = setInterval(() => {
      if (!this.document.hidden) void this.cargar();
    }, 15000);
    this.destroyRef.onDestroy(() => {
      this.cerrada = true;
      clearInterval(timer);
      dejar();
      this.document.removeEventListener('visibilitychange', visible);
      this.document.defaultView?.removeEventListener('online', visible);
    });
  }
  private actualizarSeleccion(bs: string[]): void {
    this.seleccion.set(bs);
    this.control.setValue(bs);
  }
  protected elegir(codigo: string): void {
    if (
      !this.red.online() ||
      this.cargando() ||
      !this.datos()?.butacas.some((b) => b.codigo === codigo)
    )
      return;
    if (this.datos()?.ocupadas.includes(codigo) || this.datos()?.bloqueadas?.includes(codigo))
      return;
    const bs = this.seleccion();
    if (!bs.includes(codigo) && bs.length === 8) {
      this.error.set('Máximo 8 butacas.');
      return;
    }
    this.error.set('');
    this.actualizarSeleccion(
      bs.includes(codigo) ? bs.filter((b) => b !== codigo) : [...bs, codigo],
    );
  }
  protected async cargar(): Promise<void> {
    if (this.cerrada || this.cargando() || !this.red.online()) return;
    this.cargando.set(true);
    try {
      const d = await this.service.disponibilidad(this.id);
      if (this.cerrada) return;
      this.error.set('');
      this.datos.set(d);
      this.ultimaActualizacion.set(new Date());
      const bs = this.seleccion().filter(
        (b) =>
          !d.ocupadas.includes(b) &&
          !d.bloqueadas?.includes(b) &&
          d.butacas.some((x) => x.codigo === b),
      );
      if (bs.length !== this.seleccion().length)
        this.error.set(
          'Una butaca dejó de estar disponible por compra o mantenimiento. Revisá la selección.',
        );
      this.actualizarSeleccion(bs);
    } catch (e: unknown) {
      if (this.cerrada) return;
      const detalle = mensaje(e);
      const normalizado = detalle.toLowerCase();
      this.error.set(
        normalizado.includes('función no disponible')
          ? 'La reserva no puede completarse porque la función ya no está activa.'
          : normalizado.includes('conexión')
            ? 'No pudimos actualizar las butacas. Verificá tu conexión e intentá nuevamente.'
            : detalle,
      );
      this.datos.set(null);
      this.control.updateValueAndValidity();
    } finally {
      this.cargando.set(false);
    }
  }
  protected async continuar(): Promise<void> {
    if (this.formulario.invalid || this.cargando() || !this.red.online() || !this.datos()) return;
    this.carrito.seleccionar(this.id, this.control.getRawValue());
    await this.router.navigate(['/compra', this.id, 'candy']);
  }
}
