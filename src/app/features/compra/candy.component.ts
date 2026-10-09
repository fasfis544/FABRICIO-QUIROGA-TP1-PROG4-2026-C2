/**
 * Anotacion de responsabilidad: Componente Angular de Candy; concentra la responsabilidad de este modulo dentro de app/features/compra. Incluye principalmente: CandyComponent, detalle, input, n.
 */
import { PrecioArsPipe } from '../../shared/cine/pipes';
import { ImagenCineComponent } from '../../shared/cine/imagen-cine.component';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CheckoutService, CandyOferta } from '../../data-access/cine/checkout.service';
import { mensaje } from '../../data-access/cine/validacion';
import { Carrito } from './services/carrito.service';
@Component({
  imports: [RouterLink, PrecioArsPipe, ImagenCineComponent],
  styleUrl: '../cine/cine.scss',
  template: `<section class="page">
    <h1>Candy bar</h1>
    <p>
      Opcional. El stock se verifica en el servidor al reservar. La selección no retiene productos.
    </p>
    <p id="candy-cantidad-ayuda" class="hint">
      Usá cantidades enteras entre 0 y 20. Vacío equivale a 0. Corregí los campos inválidos antes de
      continuar.
    </p>
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
    }
    @if (cargando()) {
      <p role="status">Cargando candy…</p>
    }
    @if (carrito.funcion() === id && carrito.butacas().length) {
      <div class="grid">
        @for (p of ofertas(); track p.tipo + ':' + p.id) {
          <article class="card" [class.combo-featured]="p.tipo === 'combo'">
            <h2>{{ p.nombre }}</h2>
            <app-imagen-cine [src]="p.imagen_url" [nombre]="p.nombre" tipo="candy" />
            <p>
              {{ p.tipo === 'combo' ? 'COMBO DESTACADO' : p.categoria }} ·
              {{ p.precio | precioArs }}
            </p>
            @if (p.incluye_entrada) {
              <p>
                Incluye una entrada normal elegida. VIP mantiene el recargo. Máximo un combo con
                entrada por butaca.
              </p>
            }
            @for (i of p.items; track i.nombre) {
              <p>{{ i.cantidad }} × {{ i.nombre }}</p>
            }
            @if (p.stock !== null) {
              <p>Stock físico: {{ p.stock }} (puede haber reservas)</p>
            }
            <label [for]="'cantidad-' + p.tipo + '-' + p.id">Cantidad de {{ p.nombre }}</label
            ><input
              [id]="'cantidad-' + p.tipo + '-' + p.id"
              type="number"
              min="0"
              max="20"
              step="1"
              placeholder="0"
              [disabled]="cargando()"
              [value]="cantidad(p)"
              [attr.aria-invalid]="errorCantidad(p) ? 'true' : null"
              [attr.aria-describedby]="
                errorCantidad(p)
                  ? 'candy-cantidad-ayuda error-cantidad-' + p.tipo + '-' + p.id
                  : 'candy-cantidad-ayuda'
              "
              (input)="elegir(p, $event)"
            />
            @if (errorCantidad(p); as detalle) {
              <p [id]="'error-cantidad-' + p.tipo + '-' + p.id" class="error" role="alert">
                {{ detalle }}
              </p>
            }
          </article>
        } @empty {
          @if (!cargando() && !error()) {
            <p>No hay productos disponibles.</p>
          }
        }
      </div>
      <button class="btn" type="button" [disabled]="!puedeContinuar()" (click)="continuar()">
        Continuar al checkout
      </button>
    } @else {
      <p>Primero seleccioná tus butacas. Al recargar la página el carrito provisional se vacía.</p>
    }
    <a class="btn" [routerLink]="['/compra', id, 'butacas']">Volver a butacas</a>
  </section>`,
})
export class CandyComponent implements OnInit {
  protected readonly carrito = inject(Carrito);
  protected readonly id = inject(ActivatedRoute).snapshot.paramMap.get('funcionId') ?? '';
  private readonly service = inject(CheckoutService);
  private readonly router = inject(Router);
  protected readonly ofertas = signal<CandyOferta[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  private readonly cantidades = signal<Record<string, string>>({});
  private readonly erroresCantidades = signal<Record<string, string>>({});
  protected readonly puedeContinuar = computed(
    () =>
      !this.cargando() &&
      !this.error() &&
      !Object.keys(this.erroresCantidades()).length &&
      this.carrito.funcion() === this.id &&
      this.carrito.butacas().length > 0,
  );
  ngOnInit(): void {
    void this.cargar();
  }
  private async cargar(): Promise<void> {
    try {
      this.ofertas.set(await this.service.catalogo());
    } catch (e: unknown) {
      const detalle = mensaje(e).toLowerCase();
      this.error.set(
        detalle.includes('conexión')
          ? 'No pudimos cargar los productos. Verificá tu conexión e intentá nuevamente.'
          : mensaje(e),
      );
    } finally {
      this.cargando.set(false);
    }
  }
  private clave(p: CandyOferta): string {
    return p.tipo + ':' + p.id;
  }
  protected cantidad(p: CandyOferta): string | number {
    return (
      this.cantidades()[this.clave(p)] ??
      this.carrito.candy().find((x) => x.id === p.id && x.tipo === p.tipo)?.cantidad ??
      0
    );
  }
  protected errorCantidad(p: CandyOferta): string {
    return this.erroresCantidades()[this.clave(p)] ?? '';
  }
  protected elegir(p: CandyOferta, event: Event): void {
    const input = event.target as HTMLInputElement;
    const n = Number(input.value);
    const invalida = input.validity.badInput || !Number.isInteger(n) || n < 0 || n > 20;
    const clave = this.clave(p);
    this.cantidades.update((xs) => ({ ...xs, [clave]: input.value }));
    this.erroresCantidades.update((xs) => {
      const siguientes = { ...xs };
      if (invalida)
        siguientes[clave] = 'Usá una cantidad entera entre 0 y 20 para ' + p.nombre + '.';
      else delete siguientes[clave];
      return siguientes;
    });
    // Un valor inválido nunca deja una cantidad anterior oculta en el pedido.
    this.carrito.candy.update((xs) => [
      ...xs.filter((x) => x.id !== p.id || x.tipo !== p.tipo),
      ...(!invalida && n ? [{ id: p.id, tipo: p.tipo, cantidad: n }] : []),
    ]);
  }
  protected async continuar(): Promise<void> {
    if (!this.puedeContinuar()) return;
    await this.router.navigate(['/compra', this.id, 'checkout']);
  }
}
