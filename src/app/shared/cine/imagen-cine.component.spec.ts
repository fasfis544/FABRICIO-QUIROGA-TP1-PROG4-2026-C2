/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Imagen Cine.Component; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { ImagenCineComponent } from './imagen-cine.component';
describe('Imágenes con proporción y respaldo consistente', () => {
  function crear(tipo: 'afiche' | 'candy' = 'afiche', src = '') {
    const f = TestBed.createComponent(ImagenCineComponent);
    f.componentRef.setInput('nombre', 'Prueba');
    f.componentRef.setInput('tipo', tipo);
    f.componentRef.setInput('src', src);
    f.detectChanges();
    return f;
  }
  for (const tipo of ['afiche', 'candy'] as const) {
    it(`reserva la proporción de ${tipo} y muestra respaldo si no hay imagen`, () => {
      const f = crear(tipo);
      expect(f.nativeElement.style.aspectRatio).toBe(tipo === 'afiche' ? '2 / 3' : '4 / 3');
      expect(f.nativeElement.querySelector('img').getAttribute('src')).toBe(
        `/images/${tipo}-respaldo.svg`,
      );
      expect(f.nativeElement.querySelector('img').alt).toContain('Prueba');
    });
  }
  it('si fallan imagen y respaldo muestra texto, sin ciclo de errores', () => {
    const f = crear('afiche', 'https://images.test/afiche.png');
    f.nativeElement.querySelector('img').dispatchEvent(new Event('error'));
    f.detectChanges();
    expect(f.nativeElement.querySelector('img').getAttribute('src')).toContain(
      'afiche-respaldo.svg',
    );
    f.nativeElement.querySelector('img').dispatchEvent(new Event('error'));
    f.detectChanges();
    expect(f.nativeElement.querySelector('img')).toBeNull();
    expect(f.nativeElement.textContent).toContain('Imagen no disponible');
    f.componentRef.setInput('src', 'https://images.test/nueva.png');
    f.detectChanges();
    expect(f.nativeElement.querySelector('img').getAttribute('src')).toContain('nueva.png');
  });
});
