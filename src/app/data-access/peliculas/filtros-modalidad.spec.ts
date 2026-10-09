/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Filtros Modalidad; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { coincideModalidad } from './filtros-modalidad';
import { Pelicula } from './pelicula.model';

describe('Filtros de una misma función', () => {
  const pelicula: Pelicula = {
    id: 'p', titulo: 'Prueba', slug: 'prueba', sinopsis: '', poster_url: '/icons/icon-512x512.png',
    duracion_minutos: 90, clasificacion: 'ATP', fecha_estreno: '2020-01-01', activa: true, generos: [],
    idioma: 'castellano', formato: '5D', idiomas: ['castellano', 'subtitulada'], formatos: ['2D', '3D'],
    modalidades: [{ idioma: 'castellano', formato: '2D' }, { idioma: 'subtitulada', formato: '3D' }],
  };
  for (const [idioma, formato, esperado] of [
    ['', '', true], ['castellano', '', true], ['', '3D', true],
    ['castellano', '2D', true], ['subtitulada', '3D', true],
    ['castellano', '3D', false], ['subtitulada', '2D', false], ['', '5D', false],
    ['Español', '', false],
  ] as const) {
    it(`${idioma || 'Todos'} / ${formato || 'Todos'} devuelve ${esperado}`, () => {
      expect(coincideModalidad(pelicula, idioma, formato)).toBe(esperado);
    });
  }
  it('sin funciones solo aparece sin filtros de modalidad', () => {
    const sinFunciones = { ...pelicula, formato: '2D', modalidades: [] };
    expect(coincideModalidad(sinFunciones, '', '')).toBe(true);
    expect(coincideModalidad(sinFunciones, 'castellano', '')).toBe(true);
    expect(coincideModalidad(sinFunciones, '', '2D')).toBe(true);
    expect(coincideModalidad(sinFunciones, 'castellano', '2D')).toBe(true);
    expect(coincideModalidad(sinFunciones, 'subtitulada', '')).toBe(false);
    expect(coincideModalidad(sinFunciones, '', '3D')).toBe(false);
  });
  it('usa la ficha mientras no hay funciones y luego exige una pareja real', () => {
    const sinFunciones = { ...pelicula, formato: '2D', modalidades: undefined };
    expect(coincideModalidad(sinFunciones, 'castellano', '2D')).toBe(true);
    expect(coincideModalidad(sinFunciones, 'castellano', '3D')).toBe(false);
    expect(coincideModalidad(sinFunciones, 'castellano', '')).toBe(true);
    expect(coincideModalidad(sinFunciones, '', '2D')).toBe(true);
    expect(coincideModalidad(sinFunciones, '', '')).toBe(true);
  });
});
