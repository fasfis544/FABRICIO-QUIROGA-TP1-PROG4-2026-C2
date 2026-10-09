/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Imagenes Productos.Service; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { ImagenesProductosService, validarImagenProducto } from './imagenes-productos.service';

describe('Imágenes de productos sin sobrescritura ni URLs arbitrarias', () => {
  const uid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const getUser = vi.fn();
  const upload = vi.fn();
  const from = vi.fn();
  const getPublicUrl = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: uid } }, error: null });
    upload.mockResolvedValue({ error: null });
    getPublicUrl.mockImplementation((ruta: string) => ({
      data: { publicUrl: 'https://storage.test/' + ruta },
    }));
    from.mockReturnValue({ upload, getPublicUrl });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: { getClient: () => ({ auth: { getUser }, storage: { from } }) },
        },
      ],
    });
  });
  function imagen(
    bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]),
    type = 'image/png',
  ): File {
    const file = new File([bytes], 'imagen.png', { type });
    const fragment = file.slice(0, 12);
    Object.defineProperty(fragment, 'arrayBuffer', { value: () => Promise.resolve(bytes.buffer) });
    vi.spyOn(file, 'slice').mockReturnValue(fragment);
    return file;
  }
  it('sube a productos-cine con UUID y sin sobrescribir', async () => {
    const file = imagen();
    const ruta = await TestBed.inject(ImagenesProductosService).subir(file);
    expect(ruta).toMatch(new RegExp('^' + uid + '/[0-9a-f-]{36}\\.png$'));
    expect(from).toHaveBeenCalledWith('productos-cine');
    expect(upload).toHaveBeenCalledWith(ruta, file, {
      contentType: 'image/png',
      cacheControl: '31536000',
      upsert: false,
    });
  });
  it('rechaza SVG, archivo vacío y exceso de tamaño', () => {
    expect(() =>
      validarImagenProducto(new File(['svg'], 'x.svg', { type: 'image/svg+xml' })),
    ).toThrow('No se admite SVG');
    expect(() => validarImagenProducto(new File([], 'x.png', { type: 'image/png' }))).toThrow(
      '5 MB',
    );
    const file = imagen();
    Object.defineProperty(file, 'size', { value: 5242881 });
    expect(() => validarImagenProducto(file)).toThrow('5 MB');
  });
  it('rechaza contenido que simula ser PNG sin realizar upload', async () => {
    await expect(
      TestBed.inject(ImagenesProductosService).subir(imagen(new Uint8Array([1, 2, 3]))),
    ).rejects.toThrow('contenido');
    expect(upload).not.toHaveBeenCalled();
  });
  it('rechaza sesión vencida y errores de Storage', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(TestBed.inject(ImagenesProductosService).subir(imagen())).rejects.toThrow(
      'Ingresá',
    );
    expect(upload).not.toHaveBeenCalled();
    upload.mockResolvedValueOnce({ error: { message: 'RLS' } });
    await expect(TestBed.inject(ImagenesProductosService).subir(imagen())).rejects.toThrow(
      'No pudimos subir',
    );
  });
  it('solo genera URL pública para rutas validadas', () => {
    const service = TestBed.inject(ImagenesProductosService);
    for (const ruta of [null, undefined, '', 'https://evil.test/x.svg', '../x.png', uid + '/x.png'])
      expect(service.url(ruta)).toBe('');
    expect(getPublicUrl).not.toHaveBeenCalled();
    expect(service.url(uid + '/' + uid + '.png')).toContain('https://storage.test/');
  });
});
