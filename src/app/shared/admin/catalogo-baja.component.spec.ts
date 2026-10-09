/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Catalogo Baja.Component; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { PeliculasService } from '../../data-access/peliculas/peliculas.service';
import { AfichesService } from '../../data-access/peliculas/afiches.service';
import { OperacionesService } from '../../data-access/cine/operaciones.service';
import { OfertasAdminService } from '../../data-access/cine/ofertas-admin.service';
import { ImagenesProductosService } from '../../data-access/cine/imagenes-productos.service';
import { TipoCatalogo } from '../../data-access/cine/estado-catalogo';
import { AdminPeliculasComponent } from '../../features/cine/admin-peliculas.component';
import { ProgramacionComponent } from '../../features/cine/programacion.component';
import { OfertasComponent } from '../../features/admin/ofertas.component';
import { GenerosComponent } from '../../features/admin/generos.component';

describe('Eliminar del listado, conservar y restaurar catálogo', () => {
  afterEach(() => vi.restoreAllMocks());
  async function crear(tipo: TipoCatalogo) {
    const estado = vi.fn().mockResolvedValue(undefined);
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const peliculas = [true, false].map((activa, i) => ({
      id: `id-${i}`,
      titulo: i ? 'Retirado' : 'Vigente',
      activa,
      slug: `pelicula-${i}`,
      sinopsis: 'Historia',
      duracion_minutos: 90,
      clasificacion: '16',
      idioma: 'castellano',
      formato: '2D',
      fecha_estreno: '2020-01-01',
      poster_url: '/afiche.png',
      precio_preventa: null,
      generos: [],
    }));
    const ofertas = [true, false].map((activo, i) => ({
      id: `id-${i}`,
      nombre: i ? 'Retirado' : 'Vigente',
      datos: {
        nombre: i ? 'Retirado' : 'Vigente',
        codigo: i ? 'Retirado' : 'Vigente',
        activo,
        activa: activo,
        precio: 123,
        stock: 12,
      },
    }));
    const salas = peliculas.map((p) => ({
      id: p.id,
      nombre: p.titulo,
      activa: p.activa,
      filas: 20,
      columnas: 28,
      distribucion_documento: true,
    }));
    const generos = peliculas.map((p) => ({
      id: p.id,
      nombre: p.titulo,
      slug: p.slug,
      activa: p.activa,
    }));
    const listar = vi.fn().mockResolvedValue(peliculas);
    const guardar = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: { tipo, vista: 'salas' } } } },
        {
          provide: PeliculasService,
          useValue: { listar, guardar, cambiarEstado: estado, generos: async () => [] },
        },
        { provide: AfichesService, useValue: { subir: vi.fn() } },
        {
          provide: OperacionesService,
          useValue: {
            salas: async () => salas,
            funcionesAdministracion: async () => [],
            cambiarEstadoSala: estado,
          },
        },
        {
          provide: OfertasAdminService,
          useValue: {
            listar: async () => ({
              producto: ofertas,
              combo: ofertas,
              cupon: ofertas,
              recompensa: ofertas,
            }),
            bienvenidaActual: async () => 20,
            cambiarEstado: estado,
            guardar,
          },
        },
        { provide: ImagenesProductosService, useValue: { url: () => '' } },
        {
          provide: SupabaseService,
          useValue: {
            getClient: () => ({
              rpc,
              from: () => ({
                select: () => ({ order: async () => ({ data: generos, error: null }) }),
              }),
            }),
          },
        },
      ],
    });
    let fixture: ComponentFixture<unknown>;
    if (tipo === 'pelicula') fixture = TestBed.createComponent(AdminPeliculasComponent);
    else if (tipo === 'sala') fixture = TestBed.createComponent(ProgramacionComponent);
    else if (tipo === 'genero') fixture = TestBed.createComponent(GenerosComponent);
    else fixture = TestBed.createComponent(OfertasComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.querySelectorAll('article')).toHaveLength(1);
    });
    const accion = () => el.querySelector<HTMLButtonElement>('app-accion-catalogo button')!;
    const filtro = el.querySelector<HTMLSelectElement>('app-filtro-catalogo select')!;
    const mostrar = (valor: string) => {
      filtro.value = valor;
      filtro.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };
    const terminar = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(el.querySelector('app-accion-catalogo button:disabled')).toBeNull();
      });
    };
    return {
      fixture,
      el,
      estado,
      rpc,
      confirmar,
      accion,
      mostrar,
      terminar,
      guardar,
      listar,
      tipo,
    };
  }
  for (const tipo of [
    'pelicula',
    'sala',
    'genero',
    'producto',
    'combo',
    'cupon',
    'recompensa',
  ] as const) {
    it(`${tipo}: solo activos al abrir y búsqueda combinada con eliminados/todos`, async () => {
      const { el, mostrar, fixture } = await crear(tipo);
      expect(el.querySelectorAll('article')).toHaveLength(1);
      expect(el.querySelector('article')?.textContent).toContain('Vigente');
      mostrar('inactivo');
      expect(el.querySelector('article')?.textContent).toContain('Retirado');
      expect(el.querySelector('app-accion-catalogo button')?.textContent).toContain('Restaurar');
      mostrar('');
      expect(el.querySelectorAll('article')).toHaveLength(2);
      const buscador = el.querySelector<HTMLInputElement>('input[type="search"]')!;
      buscador.value = '  retirADO  ';
      buscador.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(el.querySelectorAll('article')).toHaveLength(1);
      expect(el.querySelector('article')?.textContent).toContain('Retirado');
    });
    it(`${tipo}: cancelar no llama al servidor`, async () => {
      const { confirmar, accion, estado, rpc, el } = await crear(tipo);
      confirmar.mockReturnValue(false);
      accion().click();
      expect(confirmar).toHaveBeenCalledWith(expect.stringContaining('historial'));
      expect(estado).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
      expect(el.querySelector('article')?.textContent).toContain('Vigente');
    });
    it(`${tipo}: elimina sin regrabar ficha, desaparece y restaura desde eliminados`, async () => {
      const { accion, terminar, mostrar, el, estado, rpc, guardar } = await crear(tipo);
      accion().click();
      await terminar();
      if (tipo === 'genero')
        expect(rpc).toHaveBeenCalledExactlyOnceWith('cine_estado_catalogo', {
          p_tipo: tipo,
          p_id: 'id-0',
          p_activo: false,
        });
      else if (tipo === 'sala' || tipo === 'pelicula')
        expect(estado).toHaveBeenCalledExactlyOnceWith('id-0', false);
      else expect(estado).toHaveBeenCalledExactlyOnceWith(tipo, 'id-0', false);
      expect(guardar).not.toHaveBeenCalled();
      expect(el.querySelectorAll('article')).toHaveLength(0);
      expect(document.activeElement).toBe(el.querySelector('input[type="search"]'));
      mostrar('inactivo');
      expect(el.querySelectorAll('article')).toHaveLength(2);
      accion().click();
      await terminar();
      expect(el.querySelectorAll('article')).toHaveLength(1);
      mostrar('activo');
      expect(el.querySelector('article')?.textContent).toContain('Vigente');
    });
    it(`${tipo}: rechazo mantiene el registro y muestra error`, async () => {
      const { accion, terminar, el, estado, rpc } = await crear(tipo);
      if (tipo === 'genero')
        rpc.mockResolvedValueOnce({ error: { message: 'Hay compras vigentes' } });
      else estado.mockRejectedValueOnce(new Error('Hay compras vigentes'));
      accion().click();
      await terminar();
      expect(el.querySelector('article')?.textContent).toContain('Vigente');
      expect(el.querySelector('[role="alert"]')?.textContent).toContain('compras vigentes');
      expect(accion().disabled).toBe(false);
    });
    if (tipo !== 'sala') {
      it(`${tipo}: descarta solo el editor del registro retirado para evitar reactivarlo por accidente`, async () => {
        const { el, accion, terminar, fixture } = await crear(tipo);
        [...el.querySelectorAll('button')]
          .find((b) => b.textContent?.trim() === 'Editar Vigente')!
          .click();
        fixture.detectChanges();
        await fixture.whenStable();
        const campo =
          tipo === 'pelicula'
            ? '#p-titulo'
            : tipo === 'genero'
              ? '#genero-nombre'
              : tipo === 'cupon'
                ? '#oferta-codigo'
                : '#oferta-nombre';
        expect(el.querySelector<HTMLInputElement>(campo)?.value).toBe('Vigente');
        accion().click();
        await terminar();
        expect(el.querySelector<HTMLInputElement>(campo)?.value).toBe('');
      });
    }
  }
  it('bloquea una segunda solicitud mientras espera el servidor', async () => {
    const { accion, estado, terminar, fixture, el } = await crear('producto');
    let resolver!: () => void;
    estado.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolver = resolve;
        }),
    );
    accion().click();
    accion().click();
    fixture.detectChanges();
    expect(estado).toHaveBeenCalledTimes(1);
    expect(accion().disabled).toBe(true);
    expect(el.querySelector('article')?.textContent).toContain('Vigente');
    resolver();
    await terminar();
    expect(el.querySelectorAll('article')).toHaveLength(0);
  });
});
