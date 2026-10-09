/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Ofertas.Component; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { OfertasComponent } from './ofertas.component';
import { OfertasAdminService } from '../../data-access/cine/ofertas-admin.service';
import { PeliculasService } from '../../data-access/peliculas/peliculas.service';
import { ImagenesProductosService } from '../../data-access/cine/imagenes-productos.service';

describe('Gestión de imágenes en productos sin cambiar precios ni stock', () => {
  const ruta = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png';
  async function crear() {
    const oferta = {
      id: 'p',
      nombre: 'Pochoclos',
      datos: {
        nombre: 'Pochoclos',
        precio: 200,
        stock: 10,
        activo: true,
        categoria: 'Comida',
        imagen_path: ruta,
      },
    };
    const guardar = vi.fn().mockResolvedValue(undefined);
    const subir = vi.fn().mockResolvedValue(ruta);
    TestBed.configureTestingModule({
      imports: [OfertasComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: { tipo: 'producto' } } } },
        {
          provide: OfertasAdminService,
          useValue: {
            listar: vi
              .fn()
              .mockResolvedValue({ producto: [oferta], combo: [], cupon: [], recompensa: [] }),
            bienvenidaActual: vi.fn().mockResolvedValue(20),
            guardar,
          },
        },
        { provide: PeliculasService, useValue: { listar: vi.fn().mockResolvedValue([]) } },
        {
          provide: ImagenesProductosService,
          useValue: {
            subir,
            url: (path: unknown) => (path ? 'https://storage.test/producto.png' : ''),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(OfertasComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    fixture.componentInstance['editar'](oferta);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const archivo = new File(['imagen'], 'producto.png', { type: 'image/png' });
    const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [archivo], configurable: true });
    return { fixture, el, guardar, subir, input, archivo };
  }
  it('presenta imagen actual y vista previa con texto alternativo', async () => {
    const { el } = await crear();
    expect(el.querySelectorAll('img')).toHaveLength(2);
    expect([...el.querySelectorAll('img')].every((img) => !!img.alt)).toBe(true);
    expect(el.querySelector('input[type="file"]')?.getAttribute('accept')).toBe(
      'image/jpeg,image/png,image/webp',
    );
  });
  it('quitar imagen requiere guardar y no solicita borrar el objeto histórico', async () => {
    const { fixture, guardar } = await crear();
    fixture.componentInstance['quitarImagen']();
    expect(guardar).not.toHaveBeenCalled();
    await fixture.componentInstance['guardar'](new Event('submit'));
    expect(guardar).toHaveBeenCalledWith(
      'producto',
      expect.objectContaining({ id: 'p', precio: 200, stock: 10, imagen_path: '' }),
    );
  });
  it('subir prepara la ruta sin guardar automáticamente el producto', async () => {
    const { fixture, subir, guardar, input, archivo } = await crear();
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(subir).toHaveBeenCalledWith(archivo);
    expect(guardar).not.toHaveBeenCalled();
    expect(fixture.componentInstance['datos']().imagen_path).toContain('.png');
    expect(input.value).toBe('');
  });
  it('si falla subir conserva la imagen anterior y muestra error', async () => {
    const { fixture, el, subir, input } = await crear();
    subir.mockRejectedValueOnce(new Error('Storage no disponible'));
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Storage');
    expect(fixture.componentInstance['datos']().imagen_path).toBe(ruta);
  });
  it('si falla guardar conserva imagen, nombre, stock y precio para reintentar', async () => {
    const { fixture, guardar } = await crear();
    guardar.mockRejectedValueOnce(new Error('Sin conexión'));
    await fixture.componentInstance['guardar'](new Event('submit'));
    expect(fixture.componentInstance['datos']()).toMatchObject({
      imagen_path: ruta,
      nombre: 'Pochoclos',
      precio: 200,
      stock: 10,
    });
  });
  it('buscar y filtrar no modifica el producto que se está editando', async () => {
    const { fixture } = await crear();
    fixture.componentInstance['datos'].update((d) => ({ ...d, nombre: 'Borrador' }));
    fixture.componentInstance['busqueda'].set('inexistente');
    expect(fixture.componentInstance['visibles']()).toHaveLength(0);
    expect(fixture.componentInstance['datos']().nombre).toBe('Borrador');
    fixture.componentInstance['busqueda'].set('');
    fixture.componentInstance['estadoFiltro'].set('inactivo');
    expect(fixture.componentInstance['visibles']()).toHaveLength(0);
    fixture.componentInstance['estadoFiltro'].set('activo');
    expect(fixture.componentInstance['visibles']()).toHaveLength(1);
  });
  it('muestra vigencia Argentina y conserva segundos históricos si no se editaron las fechas', async () => {
    const { fixture, guardar } = await crear();
    fixture.componentInstance['tipo'].set('cupon');
    fixture.componentInstance['editar']({
      id: 'c',
      nombre: 'PROMO',
      datos: {
        codigo: 'PROMO',
        activo: true,
        tipo: 'porcentaje',
        porcentaje: 10,
        desde: '2030-02-01T02:30:12.123Z',
        hasta: '2030-02-02T02:30:45.456Z',
      },
    });
    expect(fixture.componentInstance['datos']().desde).toBe('2030-01-31T23:30');
    await fixture.componentInstance['guardar'](new Event('submit'));
    expect(guardar).toHaveBeenCalledWith(
      'cupon',
      expect.objectContaining({
        desde: '2030-02-01T02:30:12.123Z',
        hasta: '2030-02-02T02:30:45.456Z',
      }),
    );
  });
  it('un componente inválido elimina la cantidad oculta y bloquea el guardado hasta corregirla', async () => {
    const { fixture, guardar } = await crear();
    fixture.componentInstance['tipo'].set('combo');
    fixture.componentInstance['datos'].update((d) => ({ ...d, nombre: 'Combo' }));
    fixture.componentInstance['componentes'].set({ p: 2 }); fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#componente-p');
    input.value = '1.5'; input.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(fixture.componentInstance['componentes']()['p']).toBe(0);
    await fixture.componentInstance['guardar'](new Event('submit')); expect(guardar).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('#componente-error-p')?.textContent).toContain('entera');
    input.value = '3'; input.dispatchEvent(new Event('input')); fixture.detectChanges();
    await fixture.componentInstance['guardar'](new Event('submit'));
    expect(guardar).toHaveBeenCalledWith('combo', expect.objectContaining({ items: [{ producto_id: 'p', cantidad: 3 }] }));
  });
  it('nombre excesivo bloquea guardar y no permite cambiar editor durante subida', async () => {
    const { fixture, guardar } = await crear(); fixture.componentInstance['datos'].update((d) => ({ ...d, nombre: 'N'.repeat(101) }));
    fixture.detectChanges(); await fixture.componentInstance['guardar'](new Event('submit')); expect(guardar).not.toHaveBeenCalled();
    fixture.componentInstance['ocupado'].set(true); fixture.componentInstance['nueva'](); expect(fixture.componentInstance['datos']().nombre).toHaveLength(101);
  });
});
