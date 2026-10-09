/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Inicio.Component; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OperacionesService } from '../../../data-access/cine/operaciones.service';
import { Pelicula } from '../../../data-access/peliculas/pelicula.model';
import { PeliculasService } from '../../../data-access/peliculas/peliculas.service';
import { InicioComponent } from './inicio.component';

describe('Ranking de inicio con afiches y clasificación', () => {
  const movie = (id: string, titulo: string, ventas: number, clasificacion = 'ATP'): Pelicula => ({
    id,
    titulo,
    ventas,
    clasificacion,
    slug: id,
    sinopsis: 'Sinopsis',
    duracion_minutos: 112,
    fecha_estreno: '2020-01-01',
    poster_url: '/images/el-ultimo-hilo-peli3.png',
    activa: true,
    generos: [{ id: 'drama', nombre: 'Drama' }],
  });
  function configurar(listar = vi.fn().mockResolvedValue([])) {
    const dejar = vi.fn();
    const observar = vi.fn().mockReturnValue(dejar);
    TestBed.configureTestingModule({
      imports: [InicioComponent],
      providers: [
        provideRouter([]),
        { provide: PeliculasService, useValue: { listar } },
        { provide: OperacionesService, useValue: { observar } },
      ],
    });
    const fixture = TestBed.createComponent(InicioComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const ranking = () => el.querySelector<HTMLElement>('.ranking-section')!;
    return { fixture, el, ranking, listar, dejar, observar };
  }
  async function crear(movies: Pelicula[]) {
    const result = configurar(vi.fn().mockResolvedValue(movies));
    await result.fixture.whenStable();
    await vi.waitFor(() => {
      result.fixture.detectChanges();
      expect(result.ranking().textContent).not.toContain('Preparando');
    });
    return result;
  }
  it('mantiene el ranking primero, limita a tres y no inventa películas sin ventas', async () => {
    const movies = [
      movie('b', 'B', 2),
      movie('a', 'A', 5),
      movie('c', 'C', 3),
      movie('d', 'D', 1),
      movie('e', 'E', 0),
    ];
    const { el, ranking } = await crear(movies);
    expect(el.firstElementChild?.tagName).toBe('APP-RANKING');
    expect(el.firstElementChild?.contains(ranking())).toBe(true);
    expect(Array.from(ranking().querySelectorAll('h3')).map((h) => h.textContent?.trim())).toEqual([
      'A',
      'C',
      'B',
    ]);
    expect(ranking().querySelectorAll('.ranking-card')).toHaveLength(3);
    expect(movies.map((p) => p.id)).toEqual(['b', 'a', 'c', 'd', 'e']);
    expect(ranking().querySelectorAll('.ranking-card--first')).toHaveLength(1);
    expect(ranking().querySelector('h1')).toBeNull();
  });
  it('resuelve empates de ventas por título sin cambiar los datos originales', async () => {
    const { ranking } = await crear([movie('z', 'Zeta', 3), movie('a', 'Alfa', 3)]);
    expect(Array.from(ranking().querySelectorAll('h3')).map((h) => h.textContent?.trim())).toEqual([
      'Alfa',
      'Zeta',
    ]);
  });
  it('muestra una miniatura, edad histórica, duración y género de la película real', async () => {
    const { ranking } = await crear([movie('hilo', 'El último hilo', 2, '16')]);
    const image = ranking().querySelector<HTMLImageElement>('img')!;
    expect(image.getAttribute('src')).toBe('/images/el-ultimo-hilo-peli3.png');
    expect(image.alt).toBe('Afiche de El último hilo');
    expect(image.getAttribute('width')).toBe('88');
    expect(image.getAttribute('height')).toBe('132');
    expect(image.getAttribute('fetchpriority')).toBe('high');
    expect(ranking().querySelector('.ranking-age')?.textContent).toContain('16');
    expect(ranking().querySelector('.ranking-meta')?.textContent).toContain('112 min');
    expect(ranking().querySelector('.ranking-meta')?.textContent).toContain('Drama');
    expect(ranking().querySelector('.ranking-card')?.getAttribute('href')).toBe('/peliculas/hilo');
  });
  for (const age of ['ATP', '13', '18']) {
    it(`muestra clasificación ${age} sin convertirla`, async () => {
      const { ranking } = await crear([movie('p', 'Prueba', 1, age)]);
      expect(ranking().querySelector('.ranking-age')?.textContent?.trim()).toBe(
        'Clasificación de edad: ' + age,
      );
      expect(ranking().querySelector('.ranking-sales')?.textContent).toContain('entrada vendida');
      expect(ranking().querySelector('.ranking-sales')?.textContent).not.toContain(
        'entradas vendidas',
      );
    });
  }
  it('la tarjeta completa es un enlace cuyo nombre incluye todos los textos visibles', async () => {
    const { ranking } = await crear([movie('p', 'Prueba', 2)]);
    const link = ranking().querySelector('.ranking-card')!;
    expect(link.getAttribute('aria-label')).toBeNull();
    expect(link.getAttribute('aria-labelledby')).toBeNull();
    expect(link.textContent).toContain('Prueba');
    expect(link.textContent).toContain('Ver película');
    expect(link.textContent).toContain('Clasificación de edad');
    expect(ranking().querySelector('.ranking-grid')?.tagName).toBe('OL');
    expect(ranking().querySelector('.ranking-sales')?.textContent).toContain('entradas vendidas');
  });
  it('usa una imagen alternativa si falta la portada o falla su carga', async () => {
    const { fixture, ranking } = await crear([
      movie('p', 'Prueba', 3),
      { ...movie('q', 'Sin afiche', 2), poster_url: '', generos: [] },
    ]);
    const images = ranking().querySelectorAll<HTMLImageElement>('img');
    expect(images[1].getAttribute('src')).toBe('/images/afiche-respaldo.svg');
    images[0].dispatchEvent(new Event('error'));
    await fixture.whenStable();
    expect(images[0].getAttribute('src')).toBe('/images/afiche-respaldo.svg');
    expect(images[0].alt).toBe('Afiche de Prueba');
    expect(ranking().textContent).not.toContain('undefined');
  });
  it('sin ventas muestra un estado vacío y no presenta películas ficticias', async () => {
    const { ranking } = await crear([movie('p', 'Sin ventas', 0)]);
    expect(ranking().querySelector('.ranking-card')).toBeNull();
    expect(ranking().textContent).toContain('cuando haya ventas confirmadas');
  });
  it('distingue carga de falta de ventas y limpia la suscripción al salir', async () => {
    let resolver!: (movies: Pelicula[]) => void;
    const { fixture, ranking, dejar, observar } = configurar(
      vi.fn(
        () =>
          new Promise<Pelicula[]>((resolve) => {
            resolver = resolve;
          }),
      ),
    );
    expect(ranking().querySelector('[role="status"]')?.textContent).toContain('Preparando');
    expect(ranking().textContent).not.toContain('cuando haya ventas confirmadas');
    resolver([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(ranking().textContent).toContain('cuando haya ventas confirmadas');
    expect(observar).toHaveBeenCalledWith('cartelera', expect.any(Function));
    fixture.destroy();
    expect(dejar).toHaveBeenCalledOnce();
  });
  it('un error no se confunde con falta de ventas y permite reintentar', async () => {
    const listar = vi
      .fn()
      .mockRejectedValueOnce(new Error('Sin conexión'))
      .mockResolvedValueOnce([movie('p', 'Prueba', 2)]);
    const { fixture, ranking } = configurar(listar);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(ranking().textContent).toContain('No pudimos cargar');
    });
    expect(ranking().textContent).not.toContain('cuando haya ventas confirmadas');
    ranking().querySelector<HTMLButtonElement>('button')!.click();
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(ranking().querySelectorAll('.ranking-card')).toHaveLength(1);
    });
    expect(listar).toHaveBeenCalledTimes(2);
  });
});
