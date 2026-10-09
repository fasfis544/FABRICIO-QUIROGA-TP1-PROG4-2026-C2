/**
 * Anotacion de responsabilidad: Componente Angular de Detalle Reserva; concentra la responsabilidad de este modulo dentro de app/features/perfil. Incluye principalmente: DetalleReservaComponent, reserva, actual, base.
 */
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ClienteService, ReservaCliente } from '../../data-access/perfiles/cliente.service';
import { mensaje } from '../../data-access/cine/validacion';
import { QrCompraComponent } from '../../shared/entradas/qr-compra.component';
import { EstrellasComponent } from '../../shared/cine/estrellas.component';
import { EntradasPdfService } from '../../shared/entradas/pdf.service';
import { BeneficiosService } from '../../data-access/perfiles/beneficios.service';
import { form, FormField, max, min, maxLength, required } from '@angular/forms/signals';
@Component({
  imports: [RouterLink, DatePipe, CurrencyPipe, QrCompraComponent, FormField, EstrellasComponent],
  styleUrl: '../cine/cine.scss',
  template: `<section class="page">
    <a routerLink="/perfil/compras">Mi historial</a>
    <h1>Detalle de reserva</h1>
    @if (cargando()) {
      <p role="status">Cargando…</p>
    }
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
    }
    @if (exito()) {
      <p role="status">{{ exito() }}</p>
    }
    @if (reserva(); as r) {
      <h2>{{ r.pelicula.titulo }}</h2>
      <p>{{ r.sala }} · {{ r.funcion.inicio | date: 'dd/MM/yyyy HH:mm' : '-0300' }} (Argentina)</p>
      <p>Estado: {{ r.estado }} · Total {{ r.total | currency: 'ARS' }}</p>
      <app-qr-compra [compra]="r" />
      @if (r.estado === 'pendiente') {
        <p>
          Reserva histórica: el flujo presencial fue retirado. No realices un pago por esta reserva;
          vence el {{ r.vence | date: 'dd/MM/yyyy HH:mm' : '-0300' }} (Argentina). Todavía no
          habilita el ingreso.
        </p>
      }
      <p>
        Descuento {{ r.descuento | currency: 'ARS' }} · Crédito {{ r.credito | currency: 'ARS' }} ·
        {{ r.pago_simulado ? 'Pago simulado' : 'Importe histórico' }}
        {{ r.a_pagar | currency: 'ARS' }}
      </p>
      <div class="grid">
        @for (e of r.entradas; track e.codigo) {
          <article class="card">
            <h3>Butaca {{ e.butaca }}</h3>
            <p>
              {{
                e.usada_en
                  ? 'Utilizada'
                  : r.estado === 'confirmada'
                    ? 'Entrada habilitada'
                    : 'No habilitada'
              }}
            </p>
          </article>
        }
      </div>
      @if (r.candy.length) {
        <article class="card">
          <h2>Candy bar</h2>
          @for (i of r.candy; track $index) {
            <p>{{ i.cantidad }} × {{ i.nombre }}</p>
          }
          <p>{{ r.candy_usada_en ? 'Retirado' : 'Sin retirar' }}</p>
        </article>
      }
      <button class="btn" [disabled]="descargando()" (click)="descargar()">
        {{ descargando() ? 'Generando PDF…' : 'Descargar PDF' }}
      </button>
      <section class="card" aria-labelledby="mi-resena-titulo">
        <h2 id="mi-resena-titulo">Mi reseña</h2>
        <p id="resena-ayuda">
          Calificá la película de 1 a 5 estrellas y dejá un comentario. Las reseñas y el promedio
          pueden consultarse en la ficha de la película antes de comprar.
        </p>
        @if (resenaPorPelicula()) {
          <p class="hint">
            Una única reseña y calificación por cuenta y película, aunque tengas varias compras o
            funciones. Al editarla, actualizás la misma opinión; tu cuenta cuenta una sola vez en el
            promedio.
          </p>
        }
        @if (puedeResenar() && !resenaPorPelicula()) {
          <p role="status">
            Falta activar la reseña única por película en Supabase. El editor está protegido para no
            crear otra reseña por compra. Actualizá el estado después de activar la migración.
          </p>
        } @else if (puedeResenar() && resenaCompleta()) {
          @if (resenaExistente()) {
            <p class="hint">Tu reseña guardada está precargada. Podés editarla sin crear otra.</p>
          }
          <form (submit)="resenar($event)" aria-describedby="resena-ayuda">
            <fieldset [disabled]="ocupado() || cargando()">
              <legend>Estrellas y comentario</legend>
              <app-estrellas
                [valor]="datos().calificacion"
                (valorChange)="datos.update(calificar($event))"
              />
              <label for="resena-texto">Comentario</label>
              <textarea
                id="resena-texto"
                rows="4"
                [formField]="formulario.texto"
                aria-describedby="resena-limite"
              ></textarea>
              <p id="resena-limite" class="hint">Hasta 2000 caracteres.</p>
              <button class="btn" [disabled]="ocupado() || cargando()">
                {{
                  ocupado()
                    ? 'Guardando…'
                    : resenaExistente()
                      ? 'Actualizar reseña'
                      : 'Guardar reseña'
                }}
              </button>
            </fieldset>
          </form>
        } @else if (puedeResenar() && !resenaCompleta()) {
          <p role="status">
            Tu reseña existe, pero el servidor no devolvió el comentario. Para evitar
            sobrescribirlo, actualizá después de activar el bloque de reseña única por película.
          </p>
        } @else {
          <p class="hint">{{ motivoResena() }}</p>
          @if (resenaPorPelicula() && resenaExistente() && resenaCompleta()) {
            <h3>Tu opinión guardada sobre esta película</h3>
            <p>{{ r.calificacion_propia }} / 5 estrellas · {{ r.texto_propio }}</p>
            <p class="hint">
              Podés editarla desde una compra de esta película con ingreso validado.
            </p>
          }
        }
        <a class="text-link" [routerLink]="['/peliculas', r.pelicula.id]">
          Ver reseñas de {{ r.pelicula.titulo }}
        </a>
      </section>
      @if (r.estado === 'pendiente' || r.estado === 'confirmada') {
        <h2>Cancelar reserva o compra</h2>
        <p>
          Hasta dos horas antes, sin entradas ni candy utilizados. Una compra pagada se convierte en
          crédito; no se devuelve dinero.
        </p>
        <label for="aceptar-cancelacion"
          ><input id="aceptar-cancelacion" type="checkbox" [formField]="formulario.cancelacion" />
          Entiendo las condiciones de cancelación.</label
        ><button class="btn" [disabled]="ocupado() || !datos().cancelacion" (click)="cancelar()">
          Cancelar esta reserva
        </button>
      }
    }
    <button class="btn" [disabled]="cargando() || ocupado()" (click)="cargar()">
      Actualizar estado
    </button>
  </section>`,
})
export class DetalleReservaComponent implements OnInit {
  protected calificar(calificacion: number): (d: {
    cancelacion: boolean;
    calificacion: number;
    texto: string;
  }) => {
    cancelacion: boolean;
    calificacion: number;
    texto: string;
  } {
    return (d) => ({ ...d, calificacion });
  }
  private readonly service = inject(ClienteService);
  private readonly pdf = inject(EntradasPdfService);
  private readonly token = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  private readonly beneficios = inject(BeneficiosService);
  protected readonly ocupado = signal(false);
  protected readonly exito = signal('');
  protected readonly datos = signal({ cancelacion: false, calificacion: 5, texto: '' });
  protected readonly formulario = form(this.datos, (f) => {
    required(f.texto);
    maxLength(f.texto, 2000);
    min(f.calificacion, 1);
    max(f.calificacion, 5);
  });
  protected readonly reserva = signal<ReservaCliente | null>(null);
  protected readonly error = signal('');
  protected readonly cargando = signal(true);
  protected readonly descargando = signal(false);
  protected readonly resenaExistente = signal(false);
  protected readonly resenaPorPelicula = computed(
    () => this.reserva()?.resena_por_pelicula === true,
  );
  protected readonly resenaCompleta = computed(
    () =>
      this.reserva()?.calificacion_propia == null ||
      typeof this.reserva()?.texto_propio === 'string',
  );
  private resenaInicializada = false;
  private enCarga = false;
  private borradorBase = { calificacion: 5, texto: '' };
  ngOnInit(): void {
    void this.cargar();
  }
  protected async cargar(): Promise<void> {
    if (this.enCarga) return;
    this.enCarga = true;
    this.cargando.set(true);
    this.error.set('');
    this.reserva.set(null);
    try {
      const reserva = await this.service.reserva(this.token);
      this.reserva.set(reserva);
      const actual = this.datos();
      if (
        !this.resenaInicializada ||
        (actual.texto === this.borradorBase.texto &&
          actual.calificacion === this.borradorBase.calificacion)
      ) {
        const base = {
          calificacion: reserva.calificacion_propia ?? 5,
          texto: reserva.texto_propio ?? '',
        };
        this.datos.update((d) => ({ ...d, ...base }));
        this.borradorBase = base;
        this.resenaInicializada = true;
      }
      this.resenaExistente.set(reserva.calificacion_propia != null);
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.enCarga = false;
      this.cargando.set(false);
    }
  }
  protected async descargar(): Promise<void> {
    const r = this.reserva();
    if (!r || this.descargando()) return;
    this.descargando.set(true);
    this.error.set('');
    try {
      await this.pdf.descargar(r);
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.descargando.set(false);
    }
  }
  protected readonly puedeResenar = computed(
    () =>
      this.reserva()?.estado === 'confirmada' &&
      this.reserva()?.entradas.some((e) => e.usada_en !== null) === true,
  );
  protected readonly motivoResena = computed(() => {
    const r = this.reserva();
    if (!r) return 'Cargá el detalle de la compra para consultar la disponibilidad de la reseña.';
    if (r.estado === 'cancelada') return 'No podés reseñar desde esta compra porque fue cancelada.';
    if (r.estado === 'pendiente')
      return 'Esta reserva histórica no está confirmada. No habilita una reseña ni requiere un nuevo pago.';
    if (r.estado !== 'confirmada')
      return 'Esta compra no está confirmada y no habilita una reseña.';
    return 'Tu compra está confirmada, pero todavía no se registró el ingreso a la sala. La reseña se habilita cuando el personal valida una de tus entradas. Retirar candy no habilita la reseña. Después, pulsá «Actualizar estado».';
  });
  protected async cancelar(): Promise<void> {
    if (this.ocupado() || !this.datos().cancelacion) return;
    this.ocupado.set(true);
    this.error.set('');
    try {
      await this.beneficios.cancelar(this.token);
      await this.cargar();
      this.exito.set('Reserva cancelada. Consultá los movimientos en Mi crédito.');
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }
  protected async resenar(event: Event): Promise<void> {
    event.preventDefault();
    const d = this.datos();
    if (this.ocupado() || this.cargando()) return;
    if (this.puedeResenar() && !this.resenaPorPelicula()) {
      this.error.set('Activá la migración de reseña única por película antes de guardar.');
      return;
    }
    if (!this.puedeResenar() || !this.resenaCompleta()) {
      this.error.set(
        this.resenaCompleta()
          ? this.motivoResena()
          : 'No se recibió el comentario guardado. Actualizá el bloque de reseña única por película antes de editar.',
      );
      return;
    }
    if (
      !d.texto.trim() ||
      d.texto.length > 2000 ||
      !Number.isInteger(d.calificacion) ||
      d.calificacion < 1 ||
      d.calificacion > 5
    ) {
      this.error.set('Escribí un comentario de hasta 2000 caracteres y una calificación de 1 a 5.');
      return;
    }
    this.ocupado.set(true);
    this.error.set('');
    this.exito.set('');
    try {
      await this.beneficios.resenar(this.token, d.calificacion, d.texto);
      this.borradorBase = { calificacion: d.calificacion, texto: d.texto };
      this.resenaExistente.set(true);
      this.exito.set(
        'Reseña guardada. Tu cuenta cuenta una sola vez en el promedio de esta película.',
      );
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
