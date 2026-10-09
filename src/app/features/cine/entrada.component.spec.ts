/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Entrada.Component; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { EntradaComponent } from './entrada.component';
import { OperacionesService } from '../../data-access/cine/operaciones.service';
import { BeneficiosService } from '../../data-access/perfiles/beneficios.service';

describe('Aviso de validación de prestaciones', () => {
  const codigo = '11111111-1111-4111-8111-111111111111';
  async function crear() {
    const validar = vi.fn().mockResolvedValue({ mensaje: 'Ingreso autorizado: A1', candy: '' });
    TestBed.configureTestingModule({
      imports: [EntradaComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { data: {} } } },
        { provide: OperacionesService, useValue: {
          funcionesOperativas: vi.fn().mockResolvedValue([]), salas: vi.fn().mockResolvedValue([]),
        } },
        { provide: BeneficiosService, useValue: { validar } },
      ],
    });
    const fixture = TestBed.createComponent(EntradaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance['formulario'].setValue({ funcion: 'funcion', tipo: 'entrada', codigo });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    return { fixture, el, validar };
  }

  it('confirma ingreso junto al botón en una región accesible persistente', async () => {
    const { fixture, el, validar } = await crear();
    const region = el.querySelector('[role="status"]');
    expect(el.textContent).toContain('No se cobra ni se confirma un nuevo pago');
    expect(el.textContent).not.toContain('confirmar el pago en boletería');
    await fixture.componentInstance['validar']();
    fixture.detectChanges();
    expect(validar).toHaveBeenCalledExactlyOnceWith(codigo, 'entrada', 'funcion');
    expect(el.querySelector('[role="status"]')).toBe(region);
    expect(region?.textContent).toContain('Validación completada.');
    expect(region?.textContent).toContain('Ingreso a sala registrado correctamente.');
    expect(region?.textContent).toContain('A1');
    expect(el.querySelector('form')?.contains(region)).toBe(true);
  });

  it('confirma candy incluyendo los productos retirados', async () => {
    const { fixture, el, validar } = await crear();
    fixture.componentInstance['formulario'].controls.tipo.setValue('candy');
    validar.mockResolvedValue({ mensaje: 'Retiro autorizado', candy: '2 × Pochoclos' });
    await fixture.componentInstance['validar']();
    fixture.detectChanges();
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Retiro de candy registrado correctamente.');
    expect(el.querySelector('[role="status"]')?.textContent).toContain('2 × Pochoclos');
  });

  it('indica que está validando y bloquea envíos repetidos hasta finalizar', async () => {
    const { fixture, el, validar } = await crear();
    let completar!: (resultado: { mensaje: string; candy: string }) => void;
    validar.mockReturnValue(new Promise(resolve => { completar = resolve; }));
    const pendiente = fixture.componentInstance['validar']();
    fixture.detectChanges();
    const boton = el.querySelector<HTMLButtonElement>('form button')!;
    expect(boton.textContent).toContain('Validando…');
    expect(boton.disabled).toBe(true);
    expect(el.querySelector('form')?.getAttribute('aria-busy')).toBe('true');
    await fixture.componentInstance['validar']();
    expect(validar).toHaveBeenCalledTimes(1);
    completar({ mensaje: 'Ingreso autorizado: A1', candy: '' });
    await pendiente;
    fixture.detectChanges();
    expect(boton.disabled).toBe(false);
    expect(boton.textContent).toContain('Validar y registrar prestación');
  });

  it('muestra rechazo junto al botón sin conservar un aviso de éxito anterior', async () => {
    const { fixture, el, validar } = await crear();
    await fixture.componentInstance['validar']();
    validar.mockRejectedValueOnce(new Error('Ingreso ya utilizado'));
    await fixture.componentInstance['validar']();
    fixture.detectChanges();
    expect(el.querySelector('[role="status"]')?.textContent?.trim()).toBe('');
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Ingreso ya utilizado');
    expect(el.querySelector<HTMLButtonElement>('form button')?.disabled).toBe(false);
  });

  it('no llama al servidor con un código inválido', async () => {
    const { fixture, validar } = await crear();
    fixture.componentInstance['formulario'].controls.codigo.setValue('inválido');
    await fixture.componentInstance['validar']();
    expect(validar).not.toHaveBeenCalled();
  });
});
