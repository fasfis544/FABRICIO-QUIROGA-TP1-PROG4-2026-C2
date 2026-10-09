/**
 * Anotacion de responsabilidad: Componente Angular de Checkout; concentra la responsabilidad de este modulo dentro de app/features/compra. Incluye principalmente: DatosCheckout, CheckoutComponent, credito, servidor.
 */
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import {
  disabled,
  email,
  form,
  FormField,
  max,
  min,
  maxLength,
  required,
  validate,
} from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SesionService } from '../../core/auth/sesion.service';
import {
  CheckoutService,
  Cotizacion,
  PedidoCheckout,
} from '../../data-access/cine/checkout.service';
import { OperacionesService, Disponibilidad } from '../../data-access/cine/operaciones.service';
import { BeneficiosService } from '../../data-access/perfiles/beneficios.service';
import { PeliculasService } from '../../data-access/peliculas/peliculas.service';
import { Pelicula } from '../../data-access/peliculas/pelicula.model';
import { mensaje } from '../../data-access/cine/validacion';
import { Carrito } from './services/carrito.service';
import { RedService } from '../../core/red.service';

interface DatosCheckout {
  nombre: string;
  email: string;
  edad: boolean;
  cupon: string;
  credito: number | null;
  pago: boolean;
}

@Component({
  imports: [FormField, RouterLink, CurrencyPipe, DatePipe],
  styleUrl: '../cine/cine.scss',
  templateUrl: './checkout.component.html',
})
export class CheckoutComponent implements OnInit {
  protected readonly carrito = inject(Carrito);
  protected readonly sesion = inject(SesionService);
  protected readonly id = inject(ActivatedRoute).snapshot.paramMap.get('funcionId') ?? '';
  private readonly service = inject(CheckoutService);
  private readonly operaciones = inject(OperacionesService);
  private readonly beneficios = inject(BeneficiosService);
  private readonly peliculas = inject(PeliculasService);
  private readonly router = inject(Router);
  protected readonly red = inject(RedService);
  protected readonly listaParaComprar = computed(
    () =>
      !this.cargando() &&
      this.red.online() &&
      this.funcion() !== null &&
      this.pelicula() !== null &&
      this.carrito.funcion() === this.id &&
      this.carrito.butacas().length > 0,
  );
  private solicitud = crypto.randomUUID();
  private ultimoPedido = '';
  protected readonly datos = signal<DatosCheckout>({
    nombre: [this.sesion.perfil()?.nombre, this.sesion.perfil()?.apellido]
      .filter(Boolean)
      .join(' '),
    email: this.sesion.usuario()?.email ?? '',
    edad: false,
    cupon: '',
    credito: 0,
    pago: false,
  });
  protected readonly ocupado = signal(false);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly cotizacion = signal<Cotizacion | null>(null);
  protected readonly firma = signal('');
  protected readonly disponible = signal(0);
  protected readonly funcion = signal<Disponibilidad | null>(null);
  protected readonly pelicula = signal<Pelicula | null>(null);
  private readonly creditoInput = viewChild<ElementRef<HTMLInputElement>>('creditoInput');
  private readonly creditoEntradaInvalida = signal(false);
  private readonly creditoErrorServidor = signal<{ pedido: string; mensaje: string } | null>(null);
  protected readonly formulario = form(this.datos, (f) => {
    required(f.nombre, { when: () => this.sesion.autenticado() });
    maxLength(f.nombre, 200);
    required(f.email);
    email(f.email);
    maxLength(f.email, 254);
    maxLength(f.cupon, 100);
    validate(f.credito, ({ value }) => {
      const credito = value() ?? 0;
      if (this.creditoEntradaInvalida() || !Number.isFinite(credito))
        return { kind: 'numero', message: 'Ingresá un importe numérico válido o dejá el campo vacío.' };
      if (credito !== Number(credito.toFixed(2)))
        return { kind: 'decimales', message: 'Usá como máximo dos decimales para el crédito.' };
      return undefined;
    });
    min(f.credito, 0, { message: 'El crédito a aplicar no puede ser negativo.' });
    max(f.credito, () => this.disponible(), {
      message: 'No podés aplicar más crédito que tu saldo disponible.',
    });
    disabled(f, () => this.ocupado());
  });
  protected readonly pedido = computed<PedidoCheckout>(() => ({
    funcion: this.id,
    butacas: this.carrito.butacas(),
    candy: this.carrito.candy(),
    cupon: this.datos().cupon.trim(),
    credito: this.datos().credito ?? 0,
  }));
  protected readonly errorCredito = computed(() => {
    const servidor = this.creditoErrorServidor();
    if (servidor?.pedido === JSON.stringify(this.pedido())) return servidor.mensaje;
    const campo = this.formulario.credito();
    if (!campo.touched() || !campo.invalid()) return '';
    return (
      campo.errors().find((error) => error.message)?.message ??
      'Ingresá un importe numérico válido o dejá el campo vacío.'
    );
  });
  protected readonly vigente = computed(
    () => this.firma() === JSON.stringify(this.pedido()) && this.cotizacion() !== null,
  );
  ngOnInit(): void {
    void this.cargar();
  }
  private async cargar(): Promise<void> {
    try {
      const d = await this.operaciones.disponibilidad(this.id);
      this.funcion.set(d);
      const ps = await this.peliculas.listar();
      this.pelicula.set(ps.find((p) => p.id === d.funcion.pelicula_id) ?? null);
      if (!this.pelicula()) throw new Error('Película no disponible. Volvé a consultar la cartelera.');
      if (this.sesion.autenticado())
        this.disponible.set((await this.beneficios.obtener()).credito_disponible);
    } catch (e: unknown) {
      this.funcion.set(null);
      this.pelicula.set(null);
      const detalle = mensaje(e);
      this.error.set(
        detalle.toLowerCase().includes('función no disponible')
          ? 'La reserva no puede completarse porque la función ya no está activa.'
          : detalle,
      );
    } finally {
      this.cargando.set(false);
    }
  }
  protected async cotizar(): Promise<void> {
    if (this.ocupado() || !this.listaParaComprar()) return;
    this.error.set('');
    this.creditoErrorServidor.set(null);
    this.cotizacion.set(null);
    if (!this.validarCredito()) return;
    this.ocupado.set(true);
    const p = this.pedido();
    try {
      const c = await this.service.cotizar(p);
      this.cotizacion.set(c);
      this.firma.set(JSON.stringify(p));
    } catch (e: unknown) {
      this.mostrarError(e, p);
    } finally {
      this.ocupado.set(false);
    }
  }
  protected async reservar(event: Event): Promise<void> {
    event.preventDefault();
    const c = this.cotizacion();
    if (this.ocupado() || !this.listaParaComprar() || !this.vigente() || !c) return;
    this.error.set('');
    this.creditoErrorServidor.set(null);
    if (!this.validarCredito()) return;
    const d = this.datos();
    if (
      this.formulario.nombre().invalid() ||
      this.formulario.email().invalid() ||
      (this.sesion.autenticado() && !d.nombre.trim()) ||
      (!this.sesion.autenticado() && this.pelicula()?.clasificacion !== 'ATP' && !d.edad) ||
      !d.pago
    ) {
      this.error.set('Revisá tus datos, la edad mínima y aceptá que el pago es simulado, sin cobro real.');
      return;
    }
    const p = this.pedido();
    const firma = JSON.stringify({ ...p, ...d, credito: p.credito, total: c.total });
    if (this.ultimoPedido !== firma) {
      this.ultimoPedido = firma;
      this.solicitud = crypto.randomUUID();
    }
    this.ocupado.set(true);
    try {
      const token = await this.service.reservar(
        p,
        { nombre: d.nombre.trim(), email: d.email.trim(), edad: d.edad },
        this.solicitud,
        c.total,
      );
      this.carrito.limpiar();
      await this.router.navigate(['/compra/confirmacion', token]);
    } catch (e: unknown) {
      this.mostrarError(e, p);
    } finally {
      this.ocupado.set(false);
    }
  }
  protected revisarEntradaCredito(event: Event): void {
    this.creditoEntradaInvalida.set((event.target as HTMLInputElement).validity.badInput);
  }
  private validarCredito(): boolean {
    const campo = this.formulario.credito();
    campo.markAsTouched();
    if (!campo.invalid()) return true;
    this.creditoInput()?.nativeElement.focus();
    return false;
  }
  private mostrarError(error: unknown, pedido: PedidoCheckout): void {
    const detalle = mensaje(error);
    const normalizado = detalle.toLowerCase();
    const texto =
      detalle === 'Crédito inválido'
        ? 'El crédito no puede superar el total de la compra después de los descuentos. Reducí el importe o dejalo en 0.'
        : detalle === 'Crédito insuficiente'
          ? 'Tu saldo disponible no alcanza para ese crédito. Reducí el importe o dejalo en 0.'
          : normalizado.includes('stock')
            ? 'Uno de los productos seleccionados no tiene stock suficiente. Reducí la cantidad o quitá el producto.'
            : normalizado.includes('no se pudo confirmar') || normalizado.includes('conexión')
               ? 'No pudimos confirmar la compra. Verificá tu conexión e intentá nuevamente sin cambiar el pedido.'
              : normalizado.includes('butaca ya fue reservada') || normalizado.includes('butaca ocupada')
                ? 'Una de las butacas ya fue reservada. Volvé al mapa y elegí otra disponibilidad.'
                : normalizado.includes('función no disponible')
                   ? 'La compra no puede completarse porque la función ya no está disponible.'
          : '';
    if (detalle === 'Crédito inválido' || detalle === 'Crédito insuficiente') {
      this.creditoErrorServidor.set({ pedido: JSON.stringify(pedido), mensaje: texto });
      this.creditoInput()?.nativeElement.focus();
    } else this.error.set(texto || detalle);
  }
}
