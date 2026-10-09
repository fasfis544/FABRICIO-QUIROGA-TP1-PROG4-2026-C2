/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Afiches.Service; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { AfichesService, validarAfiche } from './afiches.service';
describe('AfichesService', () => {
  const getUser = vi.fn();
  const upload = vi.fn();
  const getPublicUrl = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'usuario' } }, error: null });
    upload.mockResolvedValue({ error: null });
    getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://storage.test/afiche.png' } });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: {
            getClient: () => ({
              auth: { getUser },
              storage: { from: () => ({ upload, getPublicUrl }) },
            }),
          },
        },
      ],
    });
  });
  function png(): File {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    const file = new File([bytes], 'afiche.png', { type: 'image/png' });
    const fragment = file.slice(0, 12);
    Object.defineProperty(fragment, 'arrayBuffer', { value: () => Promise.resolve(bytes.buffer) });
    vi.spyOn(file, 'slice').mockReturnValue(fragment);
    return file;
  }
  it('rechaza SVG y archivos vacíos', () => {
    expect(() => validarAfiche(new File(['svg'], 'afiche.svg', { type: 'image/svg+xml' }))).toThrow(
      'JPG',
    );
    expect(() => validarAfiche(new File([], 'afiche.png', { type: 'image/png' }))).toThrow('5 MB');
  });
  it('rechaza un archivo mayor a 5 MB', () => {
    const file = png();
    Object.defineProperty(file, 'size', { value: 5242881 });
    expect(() => validarAfiche(file)).toThrow('5 MB');
  });
  it('sube sin sobrescribir y devuelve la URL pública', async () => {
    const file = png();
    expect(await TestBed.inject(AfichesService).subir(file)).toBe(
      'https://storage.test/afiche.png',
    );
    expect(upload).toHaveBeenCalledWith(expect.stringMatching(/^usuario\/[0-9a-f-]+\.png$/), file, {
      contentType: 'image/png',
      cacheControl: '31536000',
      upsert: false,
    });
  });
  it('no sube si falta una sesión', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(TestBed.inject(AfichesService).subir(png())).rejects.toThrow('Ingresá');
    expect(upload).not.toHaveBeenCalled();
  });
  it('informa error de Storage sin devolver una URL exitosa', async () => {
    upload.mockResolvedValue({ error: { message: 'RLS' } });
    await expect(TestBed.inject(AfichesService).subir(png())).rejects.toThrow('No pudimos subir');
    expect(getPublicUrl).not.toHaveBeenCalled();
  });
});
