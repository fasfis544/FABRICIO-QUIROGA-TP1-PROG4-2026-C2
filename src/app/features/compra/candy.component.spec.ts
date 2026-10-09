/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Candy.Component; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { CheckoutService, CandyOferta } from '../../data-access/cine/checkout.service';
import { CandyComponent } from './candy.component';
import { Carrito } from './services/carrito.service';

describe('Cantidades visibles y pedido de candy coherentes', () => {
  const ofertas: CandyOferta[] = [
    { id: 'p', tipo: 'producto', nombre: 'Pochoclos', precio: 100, categoria: 'Comida',
      incluye_entrada: false, stock: 20, items: [] },
    { id: 'c', tipo: 'combo', nombre: 'Combo', precio: 200, categoria: 'Combos',
      incluye_entrada: true, stock: null, items: [{ nombre: 'Bebida', cantidad: 1 }] },
  ];
  async function crear(catalogo = vi.fn().mockResolvedValue(ofertas), butacas = true) {
    TestBed.configureTestingModule({
      imports: [CandyComponent],
      providers: [provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['funcionId', 'f']]) } } },
        { provide: CheckoutService, useValue: { catalogo } }],
    });
    const carrito = TestBed.inject(Carrito);
    if (butacas) carrito.seleccionar('f', ['A1']);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(CandyComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.textContent).not.toContain('Cargando candy');
    });
    const escribir = (valor: string, id = 'producto-p') => {
      const input = el.querySelector<HTMLInputElement>('#cantidad-' + id)!;
      input.value = valor;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      return input;
    };
    const continuar = () => el.querySelector<HTMLButtonElement>('button')!;
    return { fixture, el, carrito, navigate, escribir, continuar };
  }
  for (const valor of ['-1', '21', '1.5']) {
    it(`rechaza ${valor}, elimina la cantidad anterior y bloquea continuar`, async () => {
      const { el, carrito, navigate, escribir, continuar } = await crear();
      escribir('2');
      expect(carrito.candy()).toEqual([{ id: 'p', tipo: 'producto', cantidad: 2 }]);
      const input = escribir(valor);
      expect(input.value).toBe(valor);
      expect(carrito.candy()).toEqual([]);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(el.querySelector('#error-cantidad-producto-p')?.textContent).toContain('entera entre 0 y 20');
      expect(continuar().disabled).toBe(true);
      continuar().click();
      expect(navigate).not.toHaveBeenCalled();
      escribir('3');
      expect(continuar().disabled).toBe(false);
      expect(el.querySelector('#error-cantidad-producto-p')).toBeNull();
      continuar().click();
      expect(navigate).toHaveBeenCalledWith(['/compra', 'f', 'checkout']);
      expect(carrito.candy()).toEqual([{ id: 'p', tipo: 'producto', cantidad: 3 }]);
    });
  }
  for (const valor of ['', '0', '1', '20']) {
    it(`acepta ${JSON.stringify(valor)} y sincroniza la cantidad sin residuos`, async () => {
      const { carrito, escribir, continuar } = await crear();
      escribir('2');
      escribir(valor);
      expect(carrito.candy()).toEqual(Number(valor) ? [{ id: 'p', tipo: 'producto', cantidad: Number(valor) }] : []);
      expect(continuar().disabled).toBe(false);
    });
  }
  it('corregir otro producto no oculta el error pendiente ni permite navegar', async () => {
    const { el, carrito, escribir, continuar } = await crear();
    escribir('21');
    escribir('2', 'combo-c');
    expect(continuar().disabled).toBe(true);
    expect(el.querySelector('#error-cantidad-producto-p')).not.toBeNull();
    expect(carrito.candy()).toEqual([{ id: 'c', tipo: 'combo', cantidad: 2 }]);
    escribir('');
    expect(continuar().disabled).toBe(false);
    expect(carrito.candy()).toEqual([{ id: 'c', tipo: 'combo', cantidad: 2 }]);
  });
  it('distingue producto y combo aun si comparten ID', async () => {
    const { carrito, escribir } = await crear(vi.fn().mockResolvedValue([
      ofertas[0], { ...ofertas[1], id: 'p' },
    ]));
    escribir('2');
    escribir('3', 'combo-p');
    escribir('-1');
    expect(carrito.candy()).toEqual([{ id: 'p', tipo: 'combo', cantidad: 3 }]);
  });
  it('permite continuar sin candy cuando el catálogo está vacío', async () => {
    const { continuar, navigate } = await crear(vi.fn().mockResolvedValue([]));
    expect(continuar().disabled).toBe(false);
    continuar().click();
    expect(navigate).toHaveBeenCalledOnce();
  });
  it('bloquea continuar si falla la carga del catálogo', async () => {
    const { el, continuar, navigate } = await crear(vi.fn().mockRejectedValue(new Error('Sin conexión')));
    expect(el.textContent).toContain('No pudimos cargar los productos');
    expect(continuar().disabled).toBe(true);
    continuar().click();
    expect(navigate).not.toHaveBeenCalled();
  });
  it('no permite continuar sin seleccionar butacas', async () => {
    const { el } = await crear(undefined, false);
    expect(el.querySelector('button')).toBeNull();
    expect(el.textContent).toContain('Primero seleccioná tus butacas');
  });
});
