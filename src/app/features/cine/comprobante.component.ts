/**
 * Anotacion de responsabilidad: Componente Angular de Comprobante; concentra la responsabilidad de este modulo dentro de app/features/cine. Incluye principalmente: ComprobanteComponent, r.
 */
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ClienteService, ReservaCliente } from '../../data-access/perfiles/cliente.service';
import { QrCompraComponent } from '../../shared/entradas/qr-compra.component';
import { EntradasPdfService } from '../../shared/entradas/pdf.service';
import { mensaje } from '../../data-access/cine/validacion';
@Component({
  imports: [CurrencyPipe, DatePipe, RouterLink, QrCompraComponent],
  styleUrl: './cine.scss',
  template: `<section class="page">
    <h1>Comprobante de compra</h1>
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
    }
    @if (cargando()) {
      <p role="status">Consultando reserva…</p>
    }
    @if (datos(); as r) {
      <h2>{{ r.pelicula.titulo }}</h2>
      <p>{{ r.sala }}</p>
      <p>
        Descuento {{ r.descuento | currency: 'ARS' }} · Crédito {{ r.credito | currency: 'ARS' }} ·
        {{ r.pago_simulado ? 'Importe del pago simulado (sin cobro real)' : 'Importe histórico' }}
        {{ r.a_pagar | currency: 'ARS' }}
      </p>
      <p
        class="feedback"
        role="status"
        [attr.data-estado]="r.estado"
        [attr.aria-label]="'Estado de la reserva: ' + estadoTexto(r.estado)"
      >
        {{ estadoTexto(r.estado) }}
      </p>
      <p>
        Función: {{ r.funcion.inicio | date: 'dd/MM/yyyy HH:mm' : '-0300' }} (Argentina) · Total
        {{ r.total | currency: 'ARS' }}
      </p>
      @if (r.estado === 'pendiente') {
        <p class="feedback">
          Reserva histórica pendiente, no confirmada. El flujo de pago presencial fue retirado:
          no realices un nuevo pago por esta reserva. Vencimiento:
          {{ r.vence | date: 'dd/MM/yyyy HH:mm' : '-0300' }} (Argentina).
          Estos códigos no autorizan el ingreso.
        </p>
      }
      @if (r.estado === 'confirmada') {
        <p class="feedback">
          Compra confirmada. Consultá el estado de cada prestación debajo; el ingreso y el retiro
          de candy se validan de forma independiente.
        </p>
      }
      @if (r.estado === 'vencida') {
        <p role="alert" class="feedback">
          La reserva venció a las {{ r.vence | date: 'dd/MM/yyyy HH:mm' : '-0300' }} (Argentina). Las butacas fueron
          liberadas y debés volver a consultar disponibilidad.
        </p>
      }
      @if (r.estado === 'cancelada') {
        <p class="feedback">Compra cancelada. Este comprobante es histórico y no habilita ingreso ni retiro de candy.</p>
      }
      <app-qr-compra [compra]="r" />
      <p class="hint">
        Guardá este comprobante. El enlace y los códigos son privados; quien los tenga puede acceder
        a la reserva.
      </p>
      @for (e of r.entradas; track e.codigo) {
        <article class="card">
          <h3>Butaca {{ e.butaca }}</h3>
          <p>
            {{
              e.usada_en
                ? 'Utilizada'
                : r.estado === 'confirmada'
                  ? 'Entrada habilitada'
                  : estadoTexto(r.estado)
            }}
          </p>
        </article>
      }
      @if (r.candy.length) {
        <article class="card">
          <h2>Candy bar</h2>
          @for (i of r.candy; track $index) {
            <p>{{ i.cantidad }} × {{ i.nombre }}</p>
          }
          <p>{{ r.candy_usada_en ? 'Retirado' : r.estado === 'confirmada' ? 'Sin retirar' : estadoTexto(r.estado) }}</p>
        </article>
      }
      <button class="btn" [disabled]="descargando()" (click)="descargar()">Descargar PDF</button>
    }
    <button class="btn" (click)="cargar()" [disabled]="cargando()">Actualizar estado</button
    ><a class="btn" routerLink="/peliculas">Volver a cartelera</a>
  </section>`,
})
export class ComprobanteComponent implements OnInit {
  private readonly service = inject(ClienteService);
  private readonly pdf = inject(EntradasPdfService);
  protected readonly descargando = signal(false);
  private readonly token = inject(ActivatedRoute).snapshot.paramMap.get('compraId') ?? '';
  protected readonly datos = signal<ReservaCliente | null>(null);
  private enCarga = false;
  protected async descargar(): Promise<void> {
    const r = this.datos();
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
  protected readonly error = signal('');
  protected readonly cargando = signal(true);
  protected estadoTexto(estado: ReservaCliente['estado']): string {
    if (estado === 'pendiente') return 'Pendiente (reserva histórica)';
    if (estado === 'confirmada') return 'Confirmada';
    if (estado === 'cancelada') return 'Cancelada';
    return 'Vencida';
  }
  ngOnInit(): void {
    void this.cargar();
  }
  protected async cargar(): Promise<void> {
    if (this.enCarga) return;
    this.enCarga = true;
    this.cargando.set(true);
    this.error.set('');
    this.datos.set(null);
    try {
      this.datos.set(await this.service.comprobante(this.token));
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.enCarga = false;
      this.cargando.set(false);
    }
  }
}
