/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Perfiles.Service; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { PerfilesService } from './perfiles.service';

describe('PerfilesService', () => {
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const perfil = {
    id: 'usuario-1',
    nombre: 'Ana',
    apellido: null,
    rol: 'cliente',
    activo: true,
    fecha_nacimiento: null,
    grupo_sanguineo: null,
    color_ojos: null,
    vacaciones_anuales: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingle.mockResolvedValue({ data: perfil, error: null });
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { getClient: () => ({ from }) } }],
    });
  });

  it('consulta el perfil exclusivamente por el id autenticado', async () => {
    expect(await TestBed.inject(PerfilesService).obtenerPerfil('usuario-1')).toEqual(perfil);
    expect(from).toHaveBeenCalledWith('perfiles');
    expect(eq).toHaveBeenCalledWith('id', 'usuario-1');
  });

  it('rechaza perfiles ausentes y errores RLS o de red', async () => {
    const service = TestBed.inject(PerfilesService);
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(service.obtenerPerfil('usuario-1')).rejects.toThrow('no tiene un perfil');
    maybeSingle.mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(service.obtenerPerfil('usuario-1')).rejects.toThrow('No pudimos consultar');
  });

  it('no convierte un rol desconocido o un perfil ajeno en cliente válido', async () => {
    const service = TestBed.inject(PerfilesService);
    for (const data of [
      { ...perfil, rol: 'otro' },
      { ...perfil, id: 'otro' },
      { ...perfil, activo: 'true' },
    ]) {
      maybeSingle.mockResolvedValue({ data, error: null });
      await expect(service.obtenerPerfil('usuario-1')).rejects.toThrow('no es válido');
    }
  });
});
