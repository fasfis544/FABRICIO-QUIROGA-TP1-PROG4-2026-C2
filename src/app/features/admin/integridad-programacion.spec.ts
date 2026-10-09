/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Integridad Programacion; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdministracionService } from '../../data-access/cine/administracion.service';
import { OperacionesService } from '../../data-access/cine/operaciones.service';
import { PeliculasService } from '../../data-access/peliculas/peliculas.service';
import { FuncionAdminComponent } from './funcion-admin.component';
import { ProgramacionRangoComponent } from './programacion-rango.component';

describe('Protecciones de programación en formularios administrativos', () => {
  const editarFuncion = vi.fn(),
    programar = vi.fn(),
    reprogramarFuncion = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    programar.mockResolvedValue(['f']);
    editarFuncion.mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: OperacionesService, useValue: { editarFuncion } },
        { provide: AdministracionService, useValue: { programar, reprogramarFuncion } },
        {
          provide: PeliculasService,
          useValue: { listar: async () => [{ id: 'p', titulo: 'Prueba', activa: true }] },
        },
      ],
    });
  });
  it('conserva modalidad y precio después del rechazo y permite corregir la modalidad', async () => {
    const fixture = TestBed.createComponent(FuncionAdminComponent);
    fixture.componentRef.setInput('funcion', {
      id: 'f',
      pelicula_id: 'p',
      sala_id: 's',
      inicio: '2099-01-01T23:00:00Z',
      fin: '2099-01-02T00:30:00Z',
      precio: 1000,
      activa: true,
      idioma: 'castellano',
      formato: '4D',
      vip_porcentaje: 25,
    });
    fixture.componentRef.setInput('titulo', 'Prueba');
    fixture.componentRef.setInput('sala', 'Sala');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const formato = el.querySelector<HTMLSelectElement>('#formato-f')!;
    formato.value = '5D';
    formato.dispatchEvent(new Event('input', { bubbles: true }));
    formato.dispatchEvent(new Event('change', { bubbles: true }));
    const boton = el.querySelector<HTMLButtonElement>('fieldset button')!;
    editarFuncion.mockRejectedValueOnce(
      new Error('No se puede cambiar idioma o formato con compras o reservas vigentes'),
    );
    boton.click();
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'compras o reservas vigentes',
    );
    expect(formato.value).toBe('5D');
    expect(boton.disabled).toBe(false);
    formato.value = '4D';
    formato.dispatchEvent(new Event('input', { bubbles: true }));
    formato.dispatchEvent(new Event('change', { bubbles: true }));
    const precio = el.querySelector<HTMLInputElement>('#precio-f')!;
    precio.value = '1500';
    precio.dispatchEvent(new Event('input', { bubbles: true }));
    boton.click();
    await fixture.whenStable();
    expect(editarFuncion).toHaveBeenLastCalledWith('f', 1500, 'castellano', '4D', 25);
    expect(el.textContent).toContain('Cambio guardado');
  });
  async function rango(desde: string, hasta = desde, hora = '20:00') {
    const fixture = TestBed.createComponent(ProgramacionRangoComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.textContent).not.toContain('Cargando películas');
    });
    for (const [id, valor] of [
      ['pr-pelicula', 'p'],
      ['pr-desde', desde],
      ['pr-hasta', hasta],
      ['pr-hora', hora],
    ]) {
      const input = el.querySelector<HTMLInputElement | HTMLSelectElement>('#' + id)!;
      input.value = valor;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      if (input.tagName === 'SELECT') input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((input) =>
      input.click(),
    );
    fixture.detectChanges();
    const enviar = async () => {
      el.querySelector('form')!.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
      await fixture.whenStable();
    };
    return { fixture, el, enviar };
  }
  it('rechaza lote con fechas pasadas antes de enviarlo', async () => {
    const { el, enviar } = await rango('2000-01-01');
    await enviar();
    expect(programar).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('hora de Argentina');
  });
  it('usa hora argentina para el límite exacto y permite un horario futuro del mismo día', async () => {
    const { el, enviar } = await rango('2099-01-01');
    const reloj = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2099-01-01T23:00:00Z'));
    try {
      await enviar();
      expect(programar).not.toHaveBeenCalled();
      reloj.mockReturnValue(Date.parse('2099-01-01T22:59:59Z'));
      await enviar();
      expect(programar).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ desde: '2099-01-01', hora: '20:00' }),
      );
      expect(el.textContent).toContain('1 funciones guardadas');
    } finally {
      reloj.mockRestore();
    }
  });
  it('no altera la solicitud al reintentar un lote fallido', async () => {
    const { el, enviar } = await rango('2099-01-01');
    programar.mockRejectedValueOnce(new Error('Conflicto de salas'));
    await enviar();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Conflicto de salas');
    await enviar();
    expect(programar).toHaveBeenCalledTimes(2);
    expect(programar.mock.calls[0][0].solicitud).toBe(programar.mock.calls[1][0].solicitud);
  });
  it('reabre y reprograma en Argentina aunque la máquina esté en otra zona', async () => {
    const f = TestBed.createComponent(FuncionAdminComponent);
    f.componentRef.setInput('funcion', {
      id: 'f',
      pelicula_id: 'p',
      sala_id: 's',
      inicio: '2099-02-01T02:30:00Z',
      fin: '2099-02-01T04:00:00Z',
      precio: 1000,
      activa: true,
    });
    f.componentRef.setInput('titulo', 'Prueba');
    f.componentRef.setInput('sala', 'Sala');
    f.detectChanges();
    expect(f.componentInstance['datos']().inicio).toBe('2099-01-31T23:30');
    f.componentInstance['datos'].update((d) => ({
      ...d,
      motivo: 'Cambio de horario',
      confirmado: true,
      inicio: '2099-02-01T00:30',
    }));
    await f.componentInstance['reprogramar']();
    expect(reprogramarFuncion).toHaveBeenCalledExactlyOnceWith(
      'f',
      '2099-02-01T03:30:00.000Z',
      'Cambio de horario',
    );
  });
});
