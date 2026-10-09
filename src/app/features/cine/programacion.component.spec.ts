/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Programacion.Component; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { OperacionesService } from '../../data-access/cine/operaciones.service';
import { PeliculasService } from '../../data-access/peliculas/peliculas.service';
import { ProgramacionComponent } from './programacion.component';

describe('Creación de funciones con fecha futura', () => {
  async function crear() {
    const crearFuncion = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      imports: [ProgramacionComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: { vista: 'funciones' } } } },
        {
          provide: OperacionesService,
          useValue: {
            salas: async () => [],
            funcionesAdministracion: async () => [],
            crearFuncion,
          },
        },
        {
          provide: PeliculasService,
          useValue: {
            listar: async () => [{ id: 'p', titulo: 'Prueba', activa: true }],
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(ProgramacionComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.textContent).not.toContain('Cargando…');
    });
    const escribir = (valor: string, id = 'f-inicio') => {
      const input = el.querySelector<HTMLInputElement | HTMLSelectElement>('#' + id)!;
      input.value = valor;
      input.dispatchEvent(
        new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }),
      );
      fixture.detectChanges();
      return input;
    };
    escribir('p', 'f-pelicula');
    const enviar = async () => {
      el.querySelector('form')!.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
      await fixture.whenStable();
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(el.querySelector<HTMLButtonElement>('form button')?.disabled).toBe(false);
      });
    };
    return { fixture, el, escribir, enviar, crearFuncion };
  }
  for (const inicio of ['', '2000-01-01T20:00']) {
    it(`rechaza ${JSON.stringify(inicio)} junto al campo, da foco y no llama a la RPC`, async () => {
      const { el, escribir, enviar, crearFuncion } = await crear();
      const input = escribir(inicio);
      await enviar();
      expect(crearFuncion).not.toHaveBeenCalled();
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toContain('f-inicio-error');
      expect(document.activeElement).toBe(input);
      expect(el.querySelector('#f-inicio-error')?.textContent).toContain(
        inicio ? 'futuras' : 'Completá',
      );
    });
  }
  it('corrige el pasado, envía hora Argentina como ISO y restablece solo después del éxito', async () => {
    const { el, escribir, enviar, crearFuncion } = await crear();
    escribir('2000-01-01T20:00');
    await enviar();
    escribir('2099-01-01T20:00');
    expect(el.querySelector('#f-inicio-error')).toBeNull();
    await enviar();
    expect(crearFuncion).toHaveBeenCalledExactlyOnceWith(
      'p',
      '2099-01-01T23:00:00.000Z',
      1000,
      'castellano',
      '2D',
    );
    expect(el.querySelector<HTMLInputElement>('#f-inicio')?.value).toBe('');
    expect(el.textContent).toContain('La sala disponible fue asignada automáticamente');
  });
  it('conserva todos los datos ante rechazo del servidor para poder corregir o reintentar', async () => {
    const { el, escribir, enviar, crearFuncion } = await crear();
    escribir('2099-01-01T20:00');
    escribir('4D', 'f-formato');
    crearFuncion.mockRejectedValueOnce(
      new Error('No hay una sala adaptada disponible en ese horario'),
    );
    await enviar();
    expect(el.textContent).toContain('No hay una sala disponible para ese horario');
    expect(el.querySelector<HTMLInputElement>('#f-inicio')?.value).toBe('2099-01-01T20:00');
    expect(el.querySelector<HTMLSelectElement>('#f-pelicula')?.value).toBe('p');
    expect(el.querySelector<HTMLSelectElement>('#f-formato')?.value).toBe('4D');
    await enviar();
    expect(crearFuncion).toHaveBeenCalledTimes(2);
  });
  it('revalida cuando el horario venció mientras el formulario estaba abierto', async () => {
    const { escribir, enviar, crearFuncion } = await crear();
    const reloj = vi
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2099-01-01T19:59-03:00').getTime());
    try {
      escribir('2099-01-01T20:00');
      reloj.mockReturnValue(new Date('2099-01-01T20:00-03:00').getTime());
      await enviar();
      expect(crearFuncion).not.toHaveBeenCalled();
    } finally {
      reloj.mockRestore();
    }
  });
  it('no envía una fecha correcta con precio vacío o negativo', async () => {
    const { escribir, enviar, crearFuncion } = await crear();
    escribir('2099-01-01T20:00');
    for (const precio of ['', '-1']) {
      escribir(precio, 'f-precio');
      await enviar();
    }
    expect(crearFuncion).not.toHaveBeenCalled();
  });
});
