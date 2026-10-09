/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Checkout.Component; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { SesionService } from '../../core/auth/sesion.service';
import { CheckoutService, Cotizacion, PedidoCheckout } from '../../data-access/cine/checkout.service';
import { OperacionesService } from '../../data-access/cine/operaciones.service';
import { PeliculasService } from '../../data-access/peliculas/peliculas.service';
import { BeneficiosService } from '../../data-access/perfiles/beneficios.service';
import { CheckoutComponent } from './checkout.component';
import { Carrito } from './services/carrito.service';
import { RedService } from '../../core/red.service';

describe('Crédito opcional en checkout', () => {
  async function crear(saldo = 0, registrado = true) {
    const cotizar = vi.fn(async (p: PedidoCheckout): Promise<Cotizacion> => ({
      subtotal: 1000,
      descuento: 0,
      total: 1000,
      credito: p.credito,
      a_pagar: 1000 - p.credito,
      candy: [],
      entradas: [{ butaca: 'A1', tipo: 'normal', precio: 1000 }],
    }));
    const reservar = vi.fn().mockRejectedValue(new Error('Sin conexión'));
    TestBed.configureTestingModule({
      imports: [CheckoutComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: new Map([['funcionId', 'funcion-prueba']]) } },
        },
        {
          provide: SesionService,
          useValue: {
            autenticado: () => registrado,
            perfil: () => registrado ? { nombre: 'Ana', apellido: 'Cine' } : null,
            usuario: () => registrado ? { email: 'ana@cine.test' } : null,
          },
        },
        { provide: CheckoutService, useValue: { cotizar, reservar } },
        {
          provide: OperacionesService,
          useValue: {
            disponibilidad: async () => ({
              funcion: {
                id: 'funcion-prueba', pelicula_id: 'pelicula', sala_id: 'sala',
                inicio: '2030-01-01T20:00:00Z', fin: '2030-01-01T22:00:00Z',
                precio: 1000, activa: true, idioma: 'castellano', formato: '2D',
              },
              sala: { id: 'sala', nombre: 'Sala', filas: 20, columnas: 28, activa: true },
              ocupadas: [], butacas: [],
            }),
          },
        },
        {
          provide: PeliculasService,
          useValue: { listar: async () => [{ id: 'pelicula', titulo: 'Prueba', clasificacion: 'ATP' }] },
        },
        { provide: BeneficiosService, useValue: { obtener: async () => ({ credito_disponible: saldo }) } },
      ],
    });
    TestBed.inject(Carrito).seleccionar('funcion-prueba', ['A1']);
    const fixture = TestBed.createComponent(CheckoutComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(boton(el, 'Calcular total en servidor').disabled).toBe(false);
    });
    return { fixture, el, cotizar, reservar };
  }

  function boton(el: HTMLElement, texto: string): HTMLButtonElement {
    return Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.replace(/\s+/g, ' ').trim() === texto,
    )!;
  }
  function escribir(el: HTMLElement, valor: string) {
    const input = el.querySelector<HTMLInputElement>('#checkout-credito')!;
    input.value = valor;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return input;
  }
  function confirmar(el: HTMLElement) {
    el.querySelector('form')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  }

  for (const saldo of [0, 500]) {
    it(`trata el campo vacío como cero con saldo ${saldo}`, async () => {
      const { fixture, el, cotizar } = await crear(saldo);
      escribir(el, '');
      boton(el, 'Calcular total en servidor').click();
      await fixture.whenStable();
      expect(cotizar).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ credito: 0 }));
      expect(el.querySelector('#checkout-credito-error')).toBeNull();
      expect(el.querySelector('#checkout-credito-ayuda')?.textContent).toContain('campo vacío');
    });
  }

  for (const [valor, esperado] of [['0', 0], ['0.29', 0.29], ['250.50', 250.5]] as const) {
    it(`cotiza el crédito válido ${valor} sin redondearlo ni alterar el resto del pedido`, async () => {
      const { fixture, el, cotizar } = await crear(500);
      escribir(el, valor);
      boton(el, 'Calcular total en servidor').click();
      await fixture.whenStable();
      expect(cotizar).toHaveBeenCalledExactlyOnceWith({
        funcion: 'funcion-prueba', butacas: ['A1'], candy: [], cupon: '', credito: esperado,
      });
      expect(el.querySelector('#checkout-credito-error')).toBeNull();
    });
  }

  for (const [valor, error] of [
    ['-1', 'no puede ser negativo'],
    ['501', 'saldo disponible'],
    ['1.234', 'dos decimales'],
  ]) {
    it(`rechaza ${valor} en el campo sin enviar cotización ni compra`, async () => {
      const { fixture, el, cotizar, reservar } = await crear(500);
      const input = escribir(el, valor);
      boton(el, 'Calcular total en servidor').click();
      await fixture.whenStable();
      expect(cotizar).not.toHaveBeenCalled();
      expect(reservar).not.toHaveBeenCalled();
      expect(el.querySelector('#checkout-credito-error')?.textContent).toContain(error);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toContain('checkout-credito-error');
      expect(document.activeElement).toBe(input);
      expect(boton(el, 'Confirmar compra simulada').disabled).toBe(true);
      escribir(el, '0');
      boton(el, 'Calcular total en servidor').click();
      await fixture.whenStable();
      expect(cotizar).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ credito: 0 }));
      expect(el.querySelector('#checkout-credito-error')).toBeNull();
    });
  }

  it('deja al servidor validar el total después del descuento y explica su rechazo', async () => {
    const { fixture, el, cotizar } = await crear(2000);
    cotizar.mockRejectedValueOnce(new Error('Crédito inválido'));
    const input = escribir(el, '1500');
    boton(el, 'Calcular total en servidor').click();
    await fixture.whenStable();
    expect(cotizar).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ credito: 1500 }));
    expect(el.querySelector('#checkout-credito-error')?.textContent).toContain('descuentos');
    expect(input.value).toBe('1500');
    expect(document.activeElement).toBe(input);
    escribir(el, '500');
    await fixture.whenStable();
    expect(el.querySelector('#checkout-credito-error')).toBeNull();
    boton(el, 'Calcular total en servidor').click();
    await fixture.whenStable();
    expect(cotizar).toHaveBeenLastCalledWith(expect.objectContaining({ credito: 500 }));
  });

  it('explica saldo insuficiente al confirmar sin perder el importe ni permitir confirmar de nuevo', async () => {
    const { fixture, el, reservar } = await crear(500);
    escribir(el, '200');
    boton(el, 'Calcular total en servidor').click();
    await fixture.whenStable();
    el.querySelector<HTMLInputElement>('#checkout-pago')!.click();
    reservar.mockRejectedValueOnce(new Error('Crédito insuficiente'));
    confirmar(el);
    await fixture.whenStable();
    expect(reservar).toHaveBeenCalledOnce();
    expect(el.querySelector('#checkout-credito-error')?.textContent).toContain('saldo disponible no alcanza');
    expect(el.querySelector<HTMLInputElement>('#checkout-credito')?.value).toBe('200');
    expect(boton(el, 'Confirmar compra simulada').disabled).toBe(true);
  });

  it('mantiene la misma solicitud al reintentar usando cero o vacío', async () => {
    const { fixture, el, reservar } = await crear();
    boton(el, 'Calcular total en servidor').click();
    await fixture.whenStable();
    el.querySelector<HTMLInputElement>('#checkout-pago')!.click();
    confirmar(el);
    await fixture.whenStable();
    escribir(el, '');
    confirmar(el);
    await fixture.whenStable();
    expect(reservar).toHaveBeenCalledTimes(2);
    expect(reservar.mock.calls[0][0].credito).toBe(0);
    expect(reservar.mock.calls[1][0].credito).toBe(0);
    expect(reservar.mock.calls[0][2]).toBe(reservar.mock.calls[1][2]);
  });

  it('no muestra crédito al invitado y cotiza con cero', async () => {
    const { fixture, el, cotizar } = await crear(500, false);
    expect(el.querySelector('#checkout-credito')).toBeNull();
    boton(el, 'Calcular total en servidor').click();
    await fixture.whenStable();
    expect(cotizar).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ credito: 0 }));
  });

  it('explica la simulación y la gestión del comprobante al invitado antes de confirmar', async () => {
    const { el } = await crear(0, false);
    expect(el.textContent).toContain('Checkout · compra con pago simulado');
    expect(el.textContent).toContain('sin cobro real');
    expect(el.textContent).toContain('guardá el enlace privado del comprobante');
    expect(el.textContent).toContain('No se envía automáticamente por correo');
    expect(el.textContent).not.toContain('Pago presencial:');
    expect(boton(el, 'Confirmar compra simulada')).toBeDefined();
  });
  it('no cotiza ni compra sin red, ni con carrito de otra función aunque se llame al método', async () => {
    const { fixture, el, cotizar, reservar } = await crear(); TestBed.inject(RedService).online.set(false);
    await fixture.componentInstance['cotizar'](); fixture.detectChanges(); expect(cotizar).not.toHaveBeenCalled();
    expect(boton(el, 'Calcular total en servidor').disabled).toBe(true);
    TestBed.inject(RedService).online.set(true); TestBed.inject(Carrito).seleccionar('otra', ['A1']);
    await fixture.componentInstance['cotizar'](); await fixture.componentInstance['reservar'](new Event('submit'));
    expect(cotizar).not.toHaveBeenCalled(); expect(reservar).not.toHaveBeenCalled();
  });
  it('sin función o película válida no ofrece confirmar una compra parcialmente cargada', async () => {
    const { fixture, cotizar } = await crear(); fixture.componentInstance['pelicula'].set(null);
    await fixture.componentInstance['cotizar'](); expect(cotizar).not.toHaveBeenCalled();
    fixture.componentInstance['funcion'].set(null); expect(fixture.componentInstance['listaParaComprar']()).toBe(false);
  });

  for (const registrado of [true, false]) {
    for (const [detalle, aviso] of [
      ['Stock insuficiente', 'no tiene stock suficiente'],
      ['Sin conexión', 'Verificá tu conexión'],
      ['Butaca ocupada', 'Volvé al mapa'],
      ['Función no disponible', 'función ya no está disponible'],
    ]) {
      it(`muestra ${detalle} como error de compra, no de crédito (${registrado ? 'registrado' : 'invitado'})`, async () => {
        const { fixture, el, cotizar } = await crear(0, registrado);
        cotizar.mockRejectedValueOnce(new Error(detalle));
        boton(el, 'Calcular total en servidor').click();
        await fixture.whenStable(); fixture.detectChanges();
        expect(el.querySelector('[role="alert"]')?.textContent).toContain(aviso);
        expect(el.querySelector('#checkout-credito-error')).toBeNull();
        expect(el.querySelector('#checkout-credito')?.getAttribute('aria-invalid')).not.toBe('true');
      });
    }
  }
});
