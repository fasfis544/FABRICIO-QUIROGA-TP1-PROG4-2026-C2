/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Catalogo.Component; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { CatalogoComponent } from './catalogo.component';
import { PeliculasService } from '../../data-access/peliculas/peliculas.service';
import { OperacionesService } from '../../data-access/cine/operaciones.service';
import { RedService } from '../../core/red.service';

describe('Catálogo con filtros conjuntos', () => {
  async function crear(anterior = false) {
    TestBed.configureTestingModule({ imports: [CatalogoComponent], providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { data: {} } } },
      { provide: RedService, useValue: { online: signal(true) } },
      { provide: OperacionesService, useValue: { observar: () => () => undefined } },
      { provide: PeliculasService, useValue: { listar: async () => [{
        id: 'p', titulo: 'Prueba', clasificacion: 'ATP', duracion_minutos: 90, fecha_estreno: '2020-01-01',
        generos: [{ id: 'g', nombre: 'Drama' }], poster_url: '/icons/icon-512x512.png',
        idiomas: ['castellano','subtitulada'], formatos: ['2D','3D'],
        idioma: 'castellano', formato: '2D',
        modalidades: anterior ? undefined : [{ idioma: 'castellano', formato: '2D' }, { idioma: 'subtitulada', formato: '3D' }],
      }] } },
    ] });
    const fixture = TestBed.createComponent(CatalogoComponent);
    fixture.detectChanges(); await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    await vi.waitFor(() => { fixture.detectChanges(); expect(el.querySelector('article')).not.toBeNull(); });
    const elegir = async (id: string, valor: string) => {
      const input = el.querySelector<HTMLSelectElement>('#' + id)!;
      input.value = valor; input.dispatchEvent(new Event('change', { bubbles: true }));
      await fixture.whenStable(); fixture.detectChanges();
    };
    return { el, elegir };
  }
  it('excluye una pareja inexistente y permite corregir o limpiar el filtro', async () => {
    const { el, elegir } = await crear();
    await elegir('f-idioma','castellano');
    await elegir('f-formato','3D');
    expect(el.querySelector('article')).toBeNull();
    expect(el.textContent).toContain('No hay películas');
    await elegir('f-formato','2D');
    expect(el.querySelector('article h2')?.textContent).toBe('Prueba');
    await elegir('f-formato','3D'); await elegir('f-idioma','');
    expect(el.querySelector('article')).not.toBeNull();
    await elegir('f-idioma','subtitulada');
    expect(el.querySelector('article')).not.toBeNull();
  });
  it('usa la modalidad de la ficha cuando el catálogo todavía no tiene funciones', async () => {
    const { el, elegir } = await crear(true);
    await elegir('f-idioma','castellano'); await elegir('f-formato','2D');
    expect(el.querySelector('article')).not.toBeNull();
    expect(el.textContent).not.toContain('Este catálogo no incluye las combinaciones');
    await elegir('f-formato','');
    expect(el.querySelector('article')).not.toBeNull();
    expect(el.textContent).not.toContain('Este catálogo no incluye las combinaciones');
  });
});
