/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Editor Butacas.Component; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  OperacionesService,
  PlanoAdministracion,
} from '../../../../data-access/cine/operaciones.service';
import { EditorButacasComponent } from './editor-butacas.component';

describe('Mantenimiento preserva plano del Word y compras', () => {
  const plano: PlanoAdministracion = {
    sala: {
      id: 's',
      nombre: 'Sala prueba',
      filas: 20,
      columnas: 28,
      activa: true,
      distribucion_documento: true,
    },
    butacas: Array.from({ length: 20 }, (_, i) => {
      const accesible = i === 9 || i === 10;
      return Array.from({ length: accesible ? 14 : 28 }, (_, j) => ({
        codigo: String.fromCharCode(65 + i) + (j + 1),
        fila: String.fromCharCode(65 + i),
        columna: j + 1,
        bloque: j < (accesible ? 2 : 4) ? 1 : j < (accesible ? 12 : 24) ? 2 : 3,
        tipo: accesible ? ('accesible' as const) : i >= 17 ? ('vip' as const) : ('normal' as const),
        bloqueada: i === 9 && j === 0,
        motivo: i === 9 && j === 0 ? 'Reparación previa' : '',
        protegida: i === 0 && j === 0,
      }));
    }).flat(),
  };
  async function crear(datos = plano) {
    const mantenerButacas = vi.fn().mockResolvedValue(undefined);
    const planoAdministracion = vi.fn().mockResolvedValue(datos);
    TestBed.configureTestingModule({
      imports: [EditorButacasComponent],
      providers: [
        provideRouter([]),
        {
          provide: OperacionesService,
          useValue: {
            salas: vi.fn().mockResolvedValue([datos.sala]),
            planoAdministracion,
            mantenerButacas,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(EditorButacasComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const sala = el.querySelector<HTMLSelectElement>('select')!;
    sala.value = 's';
    sala.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    const asiento = (codigo: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('.seat')].find((b) =>
        b.textContent?.includes(codigo + ' ·'),
      )!;
    const boton = (texto: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
        b.textContent?.includes(texto),
      )!;
    const motivo = (valor: string) => {
      const input = el.querySelector<HTMLTextAreaElement>('textarea')!;
      input.value = valor;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    return { fixture, el, asiento, boton, motivo, mantenerButacas, planoAdministracion };
  }
  it('muestra 532 butacas, 28 accesibles, 84 VIP y tres bloques por fila', async () => {
    const { el } = await crear();
    expect(el.querySelectorAll('.seat')).toHaveLength(532);
    expect(el.querySelectorAll('.seat.accessible')).toHaveLength(28);
    expect(el.querySelectorAll('.seat.vip')).toHaveLength(84);
    expect(el.querySelectorAll('.seat-block')).toHaveLength(60);
    expect(el.querySelectorAll('.seat-row')).toHaveLength(20);
    expect(el.textContent).not.toContain('works!');
  });
  it('impide bloquear una butaca protegida aunque se invoque guardar directamente', async () => {
    const { fixture, asiento, boton, motivo, mantenerButacas } = await crear();
    asiento('A1').click();
    motivo('Reparación');
    expect(boton('Bloquear por mantenimiento').disabled).toBe(true);
    await fixture.componentInstance['guardar'](new Event('submit'), true);
    expect(mantenerButacas).not.toHaveBeenCalled();
  });
  it('bloquea un lote con motivo y no cambia filas o tipos', async () => {
    const { fixture, asiento, motivo, mantenerButacas } = await crear();
    asiento('A2').click();
    asiento('R2').click();
    motivo('Reparación de tapizado');
    await fixture.componentInstance['guardar'](new Event('submit'), true);
    expect(mantenerButacas).toHaveBeenCalledExactlyOnceWith(
      's',
      ['A2', 'R2'],
      true,
      'Reparación de tapizado',
    );
    expect(fixture.componentInstance['seleccion']()).toEqual([]);
  });
  it('restaura un asiento accesible sin alterar su tipo', async () => {
    const { fixture, asiento, motivo, mantenerButacas } = await crear();
    asiento('J1').click();
    motivo('Reparación finalizada');
    await fixture.componentInstance['guardar'](new Event('submit'), false);
    expect(mantenerButacas).toHaveBeenCalledWith('s', ['J1'], false, 'Reparación finalizada');
    expect(asiento('J1').classList.contains('accessible')).toBe(true);
  });
  it('conserva selección y motivo ante rechazo del servidor', async () => {
    const { fixture, el, asiento, motivo, mantenerButacas } = await crear();
    mantenerButacas.mockRejectedValueOnce(new Error('Compra nueva: butaca comprometida'));
    asiento('A2').click();
    motivo('Reparación');
    await fixture.componentInstance['guardar'](new Event('submit'), true);
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('comprometida');
    expect(fixture.componentInstance['seleccion']()).toEqual(['A2']);
    expect(el.querySelector('textarea')?.value).toBe('Reparación');
  });
  it('no permite mantenimiento de una sala histórica sin adaptar', async () => {
    const { fixture, asiento, motivo, mantenerButacas } = await crear({
      ...plano,
      sala: { ...plano.sala, distribucion_documento: false },
    });
    expect(asiento('A2').disabled).toBe(true);
    motivo('Reparación');
    await fixture.componentInstance['guardar'](new Event('submit'), true);
    expect(mantenerButacas).not.toHaveBeenCalled();
  });
  it('una recarga fallida no deja un plano antiguo editable', async () => {
    const { fixture, el, planoAdministracion } = await crear();
    planoAdministracion.mockRejectedValueOnce(new Error('Sin conexión'));
    await fixture.componentInstance['cargarPlano']();
    fixture.detectChanges();
    expect(el.querySelectorAll('.seat')).toHaveLength(0);
    expect(el.textContent).toContain('Sin conexión');
  });
  for (const valor of ['', '    ', '1234', 'x'.repeat(501)]) {
    it(`rechaza motivo inválido de longitud ${valor.length}`, async () => {
      const { fixture, asiento, motivo, mantenerButacas } = await crear();
      asiento('A2').click();
      motivo(valor);
      await fixture.componentInstance['guardar'](new Event('submit'), true);
      expect(mantenerButacas).not.toHaveBeenCalled();
    });
  }
});
