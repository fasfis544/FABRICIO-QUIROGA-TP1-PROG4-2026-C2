/**
 * Anotacion de responsabilidad: Componente Angular de Ofertas; concentra la responsabilidad de este modulo dentro de app/features/admin. Incluye principalmente: vacio, OfertasComponent, e, d.
 */
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { ImagenCineComponent } from '../../shared/cine/imagen-cine.component';
import { disabled, form, FormField, maxLength } from '@angular/forms/signals';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  OfertaAdmin,
  OfertasAdminService,
  TipoOferta,
} from '../../data-access/cine/ofertas-admin.service';
import { mensaje } from '../../data-access/cine/validacion';
import { PeliculasService } from '../../data-access/peliculas/peliculas.service';
import { Pelicula } from '../../data-access/peliculas/pelicula.model';
import { errorRango } from '../../data-access/cine/validacion-admin';
import { ImagenesProductosService } from '../../data-access/cine/imagenes-productos.service';
import { fechaHoraArgentina, instanteArgentina } from '../../shared/cine/fecha-argentina';
import { coincideCatalogo } from '../../data-access/cine/estado-catalogo';
import { AccionCatalogoComponent } from '../../shared/admin/accion-catalogo.component';
import { FiltroCatalogoComponent } from '../../shared/admin/filtro-catalogo.component';
const vacio = () => ({
  id: '',
  nombre: '',
  codigo: '',
  precio: 1,
  stock: 0,
  porcentaje: 10,
  minimo: 0,
  limite: 1,
  puntos: 100,
  desde: '',
  hasta: '',
  pelicula_id: '',
  registrados: false,
  activo: true,
  categoria: 'Otros',
  incluye_entrada: false,
  descuento_tipo: 'porcentaje',
  monto: 100,
  edad_minima: 0,
  ilimitado: false,
  recompensa_tipo: 'entrada',
  producto_id: '',
  imagen_path: '',
});
@Component({
  imports: [
    FormField,
    RouterLink,
    ImagenCineComponent,
    AccionCatalogoComponent,
    FiltroCatalogoComponent,
  ],
  styleUrl: '../cine/cine.scss',
  templateUrl: './ofertas.component.html',
})
export class OfertasComponent implements OnInit {
  protected readonly tipoFijo: TipoOferta | undefined = inject(ActivatedRoute, { optional: true })
    ?.snapshot.data['tipo'];
  protected readonly encabezado = computed(
    () =>
      ({
        producto: 'Productos candy',
        combo: 'Combos',
        cupon: 'Cupones y bienvenida',
        recompensa: 'Recompensas',
      })[this.tipo()],
  );
  protected readonly descripcion = computed(
    () =>
      ({
        producto: 'Administrá categorías, precios y stock de cada producto.',
        combo: 'Combiná productos y una entrada opcional en una propuesta con precio propio.',
        cupon: 'Configurá descuentos, vigencia, segmentación y el beneficio de bienvenida.',
        recompensa: 'Definí entradas o productos que se pueden canjear por puntos.',
      })[this.tipo()],
  );
  protected readonly intentado = signal(false);
  protected readonly erroresCampos = computed(() => {
    const e: Record<string, string> = {};
    if (!this.intentado()) return e;
    const d = this.datos(),
      t = this.tipo();
    if (!(t === 'cupon' ? d.codigo : d.nombre).trim()) e['nombre'] = 'Completá el nombre o código.';
    if ((t === 'producto' || t === 'combo') && (!Number.isFinite(d.precio) || d.precio <= 0))
      e['precio'] = 'El precio debe ser mayor a cero.';
    if (t === 'producto' && (!Number.isInteger(d.stock) || d.stock < 0))
      e['stock'] = 'El stock debe ser un entero mayor o igual a cero.';
    if (this.formulario().invalid())
      e['nombre'] = 'Revisá los campos: nombre y código admiten hasta 100 caracteres.';
    if (t === 'combo' && Object.keys(this.erroresComponentes()).length)
      e['componentes'] = 'Corregí las cantidades de los componentes antes de guardar.';
    if (t === 'cupon' || t === 'recompensa') {
      const r = errorRango(d.desde, d.hasta);
      if (r) e['fechas'] = r;
    }
    if (t === 'cupon') {
      if (d.descuento_tipo === 'monto' && (!Number.isFinite(d.monto) || d.monto <= 0))
        e['descuento'] = 'El monto debe ser mayor a cero.';
      if (
        d.descuento_tipo === 'porcentaje' &&
        (!Number.isInteger(d.porcentaje) || d.porcentaje < 1 || d.porcentaje > 100)
      )
        e['descuento'] = 'El porcentaje debe ser un entero entre 1 y 100.';
      if (
        !Number.isFinite(d.minimo) ||
        d.minimo < 0 ||
        (!d.ilimitado && (!Number.isInteger(d.limite) || d.limite < 1)) ||
        !Number.isInteger(d.edad_minima) ||
        d.edad_minima < 0 ||
        d.edad_minima > 120
      )
        e['segmento'] = 'Revisá compra mínima (≥0), límite de usos (≥1) y edad entera (0–120).';
    }
    if (
      t === 'recompensa' &&
      (!Number.isInteger(d.puntos) ||
        d.puntos < 1 ||
        (d.recompensa_tipo === 'producto' && !d.producto_id))
    )
      e['recompensa'] = 'Indicá puntos enteros mayores a cero y el producto, si corresponde.';
    return e;
  });
  protected readonly bienvenida = signal(20);
  protected async guardarBienvenida(valor: string): Promise<void> {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    this.error.set('');
    try {
      await this.service.bienvenida(Number(valor));
      this.bienvenida.set(Number(valor));
      this.exito.set('Porcentaje de bienvenida guardado.');
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }
  private readonly service = inject(OfertasAdminService);
  private readonly catalogo = inject(PeliculasService);
  private readonly injector = inject(Injector);
  private readonly editorTitulo = viewChild<ElementRef<HTMLElement>>('editorTitulo');
  private fechasOriginales: { desde: string; hasta: string } | null = null;
  protected readonly imagenes = inject(ImagenesProductosService);
  protected readonly imagenActual = computed(() => this.imagenes.url(this.datos().imagen_path));
  protected readonly tipo = signal<TipoOferta>(this.tipoFijo ?? 'producto');
  protected readonly datos = signal(vacio());
  protected readonly componentes = signal<Record<string, number>>({});
  protected readonly erroresComponentes = signal<Record<string, string>>({});
  protected readonly ocupado = signal(false);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly exito = signal('');
  protected readonly peliculas = signal<Pelicula[]>([]);
  protected readonly ofertas = signal<Record<TipoOferta, OfertaAdmin[]>>({
    producto: [],
    combo: [],
    cupon: [],
    recompensa: [],
  });
  protected readonly busqueda = signal('');
  protected readonly estadoFiltro = signal('activo');
  protected readonly visibles = computed(() =>
    this.ofertas()[this.tipo()].filter((o) =>
      coincideCatalogo(o.nombre, this.activa(o), this.busqueda(), this.estadoFiltro()),
    ),
  );
  private readonly filtroCatalogo = viewChild<FiltroCatalogoComponent>('filtroCatalogo');
  protected activa(o: OfertaAdmin): boolean {
    return (this.tipo() === 'recompensa' ? o.datos['activa'] : o.datos['activo']) === true;
  }
  protected async cambiarEstado(o: OfertaAdmin, activo: boolean): Promise<void> {
    if (this.ocupado() || this.cargando()) return;
    const tipo = this.tipo();
    this.ocupado.set(true);
    this.error.set('');
    this.exito.set('');
    try {
      await this.service.cambiarEstado(tipo, o.id, activo);
      const campo = tipo === 'recompensa' ? 'activa' : 'activo';
      this.ofertas.update((xs) => ({
        ...xs,
        [tipo]: xs[tipo].map((item) =>
          item.id === o.id ? { ...item, datos: { ...item.datos, [campo]: activo } } : item,
        ),
      }));
      this.ocupado.set(false);
      if (this.datos().id === o.id) this.nueva();
      this.exito.set(
        activo
          ? 'Configuración restaurada.'
          : 'Configuración eliminada del listado activo. El historial se conserva.',
      );
      this.filtroCatalogo()?.enfocar();
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }
  protected readonly formulario = form(this.datos, (f) => {
    maxLength(f.nombre, 100);
    maxLength(f.codigo, 100);
    disabled(f, () => this.ocupado());
  });
  ngOnInit(): void {
    void this.cargar();
  }
  protected async cargar(): Promise<void> {
    if (this.enCarga) return;
    this.enCarga = true;
    this.cargando.set(true);
    this.error.set('');
    try {
      const [o, p, bienvenida] = await Promise.all([
        this.service.listar(),
        this.catalogo.listar(true),
        this.service.bienvenidaActual(),
      ]);
      this.ofertas.set(o);
      this.peliculas.set(p);
      this.bienvenida.set(bienvenida);
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.enCarga = false;
      this.cargando.set(false);
    }
  }
  protected cambiar(event: Event): void {
    if (this.ocupado()) return;
    this.tipo.set((event.target as HTMLSelectElement).value as TipoOferta);
    this.nueva();
  }
  protected nueva(): void {
    if (this.ocupado()) return;
    this.fechasOriginales = null;
    this.intentado.set(false);
    this.datos.set(vacio());
    this.componentes.set({});
    this.erroresComponentes.set({});
    this.exito.set('');
  }
  protected editar(oferta: OfertaAdmin): void {
    if (this.ocupado()) return;
    this.erroresComponentes.set({});
    this.intentado.set(false);
    const d = oferta.datos;
    const s = (key: string, fallback = '') => (typeof d[key] === 'string' ? d[key] : fallback);
    const n = (key: string, fallback: number) => (typeof d[key] === 'number' ? d[key] : fallback);
    this.fechasOriginales = { desde: s('desde'), hasta: s('hasta') };
    const fecha = (key: string) => {
      const valor = s(key);
      if (!valor) return '';
      return fechaHoraArgentina(valor);
    };
    this.datos.set({
      id: oferta.id,
      nombre: s('nombre'),
      codigo: s('codigo'),
      precio: n('precio', 1),
      stock: n('stock', 0),
      porcentaje: n('porcentaje', 10),
      minimo: n('minimo', 0),
      limite: n('limite', 1),
      puntos: n('puntos', 100),
      desde: fecha('desde'),
      hasta: fecha('hasta'),
      pelicula_id: s('pelicula_id'),
      registrados: d['solo_registrados'] === true,
      activo: this.tipo() === 'recompensa' ? d['activa'] === true : d['activo'] === true,
      categoria: s('categoria', 'Otros'),
      incluye_entrada: d['incluye_entrada'] === true,
      descuento_tipo: s('tipo', 'porcentaje'),
      monto: n('monto', 100),
      edad_minima: n('edad_minima', 0),
      ilimitado: d['limite'] === null,
      recompensa_tipo: s('tipo', 'entrada'),
      producto_id: s('producto_id'),
      imagen_path: s('imagen_path'),
    });
    const items = d['items'];
    this.componentes.set(
      Array.isArray(items)
        ? Object.fromEntries(
            items
              .filter(
                (i: unknown): i is { producto_id: string; cantidad: number } =>
                  typeof i === 'object' &&
                  i !== null &&
                  'producto_id' in i &&
                  typeof i.producto_id === 'string' &&
                  'cantidad' in i &&
                  typeof i.cantidad === 'number',
              )
              .map((i) => [i.producto_id, i.cantidad]),
          )
        : {},
    );
    afterNextRender(() => this.editorTitulo()?.nativeElement.focus(), { injector: this.injector });
  }
  protected componente(id: string, event: Event): void {
    if (this.ocupado()) return;
    const input = event.target as HTMLInputElement;
    const n = Number(input.value);
    const invalida = input.validity.badInput || !Number.isInteger(n) || n < 0 || n > 20;
    this.erroresComponentes.update((xs) => {
      const siguientes = { ...xs };
      if (invalida) siguientes[id] = 'Usá una cantidad entera entre 0 y 20.';
      else delete siguientes[id];
      return siguientes;
    });
    this.componentes.update((c) => ({ ...c, [id]: invalida ? 0 : n }));
  }
  protected async subirImagen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (!archivo || this.ocupado() || this.tipo() !== 'producto') return;
    this.ocupado.set(true);
    this.error.set('');
    this.exito.set('');
    try {
      const ruta = await this.imagenes.subir(archivo);
      this.datos.update((d) => ({ ...d, imagen_path: ruta }));
      this.exito.set('Imagen subida. Guardá la configuración para asociarla al producto.');
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.ocupado.set(false);
      input.value = '';
    }
  }
  protected quitarImagen(): void {
    if (this.ocupado()) return;
    this.datos.update((d) => ({ ...d, imagen_path: '' }));
    this.exito.set(
      'Imagen desvinculada del formulario. Guardá para confirmar; el archivo histórico no se elimina.',
    );
  }
  protected async guardar(event: Event): Promise<void> {
    event.preventDefault();
    if (this.ocupado()) return;
    this.intentado.set(true);
    if (Object.keys(this.erroresCampos()).length) {
      this.error.set('Revisá los campos indicados antes de guardar.');
      return;
    }
    if (this.enCarga) return;
    this.error.set('');
    this.exito.set('');
    this.ocupado.set(true);
    try {
      const d = this.datos(),
        tipo = this.tipo();
      if (!(tipo === 'cupon' ? d.codigo : d.nombre).trim())
        throw new Error('Completá nombre o código.');
      const payload: Record<string, unknown> = {
        ...d,
        ...(d.id ? {} : { id: null }),
        activo: d.activo,
        activa: d.activo,
        solo_registrados: d.registrados,
        pelicula_id: d.pelicula_id || null,
        tipo: tipo === 'recompensa' ? d.recompensa_tipo : d.descuento_tipo,
        producto_id: d.producto_id || null,
        limite: d.ilimitado ? null : d.limite,
        edad_minima: d.edad_minima || null,
        monto: d.descuento_tipo === 'monto' ? d.monto : null,
      };
      if (tipo === 'cupon' || tipo === 'recompensa') {
        // Editar otro campo no debe truncar segundos/fracciones de una vigencia histórica.
        const conservar = (campo: 'desde' | 'hasta') => {
          const original = this.fechasOriginales?.[campo];
          return original && fechaHoraArgentina(original) === d[campo]
            ? original
            : instanteArgentina(d[campo]);
        };
        payload['desde'] = conservar('desde');
        payload['hasta'] = conservar('hasta');
      }
      if (tipo === 'combo')
        payload['items'] = Object.entries(this.componentes())
          .filter(([, cantidad]) => cantidad > 0)
          .map(([producto_id, cantidad]) => ({ producto_id, cantidad }));
      await this.service.guardar(tipo, payload);
      await this.cargar();
      // El guardado terminó; restablecer solo entonces, incluso si el listado requiere reintento.
      this.ocupado.set(false);
      this.nueva();
      this.exito.set('Configuración guardada.');
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }
  private enCarga = false;
}
