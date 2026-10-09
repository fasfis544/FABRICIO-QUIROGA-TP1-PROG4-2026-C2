/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Admin Peliculas.Component; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AfichesService } from '../../data-access/peliculas/afiches.service';
import { Pelicula } from '../../data-access/peliculas/pelicula.model';
import { PeliculasService } from '../../data-access/peliculas/peliculas.service';
import { AdminPeliculasComponent } from './admin-peliculas.component';

describe('Edición de películas históricas', () => {
  const pelicula: Pelicula = {
    id: 'pelicula-historica',
    titulo: 'El último hilo',
    slug: 'el-ultimo-hilo',
    sinopsis: 'Una presencia misteriosa mueve los hilos de una ciudad.',
    duracion_minutos: 112,
    clasificacion: '16',
    fecha_estreno: '2026-10-03',
    poster_url: '/images/el-ultimo-hilo-peli3.png',
    activa: true,
    generos: [],
    idioma: 'Español',
    formato: '2D',
    precio_preventa: null,
  };

  async function crear(datos = pelicula) {
    const guardar = vi.fn().mockResolvedValue(datos.id);
    const listar = vi.fn().mockResolvedValue([datos]);
    TestBed.configureTestingModule({
      imports: [AdminPeliculasComponent],
      providers: [
        provideRouter([]),
        {
          provide: PeliculasService,
          useValue: {
            listar,
            guardar,
            generos: async () => [
              { id: 'terror', nombre: 'Terror', activo: true },
              { id: 'historico', nombre: 'Género anterior', activo: false },
            ],
          },
        },
        { provide: AfichesService, useValue: { subir: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(AdminPeliculasComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    expect(listar).toHaveBeenCalled();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.textContent).toContain(datos.titulo);
    });
    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.replace(/\s+/g, ' ').trim() === 'Editar ' + datos.titulo)!
      .click();
    await fixture.whenStable();
    return { fixture, el, guardar, listar };
  }

  function elegir(el: HTMLElement, id: string, value: string) {
    const select = el.querySelector<HTMLSelectElement>('#' + id)!;
    if (select.multiple) {
      Array.from(select.options).forEach((option) => {
        option.selected = option.textContent?.trim() === value;
      });
    } else select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function enviar(el: HTMLElement) {
    el.querySelector('form')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  }

  it('muestra la clasificación histórica sin convertirla y enfoca el editor', async () => {
    const { el, guardar } = await crear();
    const clasificacion = el.querySelector<HTMLSelectElement>('#p-clasificacion')!;
    expect(clasificacion.value).toBe('16');
    expect(clasificacion.selectedOptions[0].textContent).toContain('histórica');
    expect(el.querySelector('#p-clasificacion-ayuda')?.textContent).toContain(
      'No se cambia automáticamente',
    );
    expect(document.activeElement).toBe(el.querySelector('#pelicula-editor'));
    expect(guardar).not.toHaveBeenCalled();
    expect(pelicula.clasificacion).toBe('16');
  });

  it('identifica clasificación y géneros faltantes antes de llamar al servidor', async () => {
    const { fixture, el, guardar } = await crear();
    enviar(el);
    await fixture.whenStable();
    expect(guardar).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('ATP, 13 o 18');
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('al menos un género');
    expect(el.querySelector('#p-clasificacion')?.getAttribute('aria-invalid')).toBe('true');
    expect(el.querySelector('#p-generos')?.getAttribute('aria-invalid')).toBe('true');
    expect(el.querySelector('#p-generos-error')?.textContent).toContain('un género');
    expect(document.activeElement).toBe(el.querySelector('#p-clasificacion'));
  });

  it('guarda el mismo ID solo después de elegir explícitamente clasificación y género', async () => {
    const { fixture, el, guardar } = await crear();
    elegir(el, 'p-generos', 'Terror');
    enviar(el);
    await fixture.whenStable();
    expect(guardar).not.toHaveBeenCalled();
    elegir(el, 'p-clasificacion', '18');
    const titulo = el.querySelector<HTMLInputElement>('#p-titulo')!;
    titulo.value = 'El último hilo actualizado';
    titulo.dispatchEvent(new Event('input', { bubbles: true }));
    enviar(el);
    await fixture.whenStable();
    expect(guardar).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        id: pelicula.id,
        titulo: 'El último hilo actualizado',
        clasificacion: '18',
        duracion_minutos: 112,
        poster_url: pelicula.poster_url,
      }),
      ['terror'],
    );
    expect(el.textContent).toContain('Película guardada.');
    expect(pelicula.clasificacion).toBe('16');
    expect(pelicula.generos).toEqual([]);
  });

  it('conserva el formulario y el ID si el servidor rechaza el guardado', async () => {
    const { fixture, el, guardar } = await crear();
    elegir(el, 'p-clasificacion', '18');
    elegir(el, 'p-generos', 'Terror');
    guardar.mockRejectedValueOnce(new Error('Sin conexión'));
    enviar(el);
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Sin conexión');
    expect(el.querySelector<HTMLSelectElement>('#p-clasificacion')?.value).toBe('18');
    expect(el.querySelector<HTMLInputElement>('#p-titulo')?.disabled).toBe(false);
    enviar(el);
    await fixture.whenStable();
    expect(guardar).toHaveBeenCalledTimes(2);
    expect(guardar.mock.calls[1][0].id).toBe(pelicula.id);
  });

  it('conserva 4D y géneros inactivos ya asociados en películas válidas', async () => {
    const { fixture, el, guardar } = await crear({
      ...pelicula,
      clasificacion: '18',
      formato: '4D',
      idioma: 'subtitulada',
      generos: [{ id: 'historico', nombre: 'Género anterior' }],
    });
    expect(el.querySelector<HTMLSelectElement>('#p-formato')?.value).toBe('4D');
    enviar(el);
    await fixture.whenStable();
    expect(guardar).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: pelicula.id, formato: '4D', idioma: 'subtitulada' }),
      ['historico'],
    );
  });

  for (const error of [
    'No se puede cambiar la duración con compras o reservas vigentes en funciones futuras',
    'La nueva duración superpone funciones o no respeta los 30 minutos de limpieza',
  ]) {
    it(`conserva duración, ID y géneros después del rechazo: ${error}`, async () => {
      const { fixture, el, guardar } = await crear({
        ...pelicula, clasificacion: '18', idioma: 'castellano',
        generos: [{ id: 'terror', nombre: 'Terror' }],
      });
      const duracion = el.querySelector<HTMLInputElement>('#p-duracion')!;
      duracion.value = '150';
      duracion.dispatchEvent(new Event('input', { bubbles: true }));
      guardar.mockRejectedValueOnce(new Error(error));
      enviar(el);
      await fixture.whenStable();
      expect(el.querySelector('[role="alert"]')?.textContent).toContain(error);
      expect(duracion.value).toBe('150');
      expect(duracion.disabled).toBe(false);
      duracion.value = '112';
      duracion.dispatchEvent(new Event('input', { bubbles: true }));
      enviar(el);
      await fixture.whenStable();
      expect(guardar).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: pelicula.id, duracion_minutos: 112 }), ['terror'],
      );
    });
  }

  it('limpia los errores al comenzar otra película sin trasladar datos históricos', async () => {
    const { fixture, el } = await crear();
    enviar(el);
    await fixture.whenStable();
    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Nueva película')!
      .click();
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.querySelector<HTMLSelectElement>('#p-clasificacion')?.value).toBe('ATP');
    expect(el.querySelector('#p-clasificacion-ayuda')?.textContent).not.toContain('histórica');
    expect(el.querySelector<HTMLSelectElement>('#p-generos')?.selectedOptions).toHaveLength(0);
  });
});
