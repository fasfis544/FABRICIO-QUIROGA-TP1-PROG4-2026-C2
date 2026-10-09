/**
 * Anotacion de responsabilidad: Componente Angular de Admin Peliculas; concentra la responsabilidad de este modulo dentro de app/features/cine. Incluye principalmente: AdminPeliculasComponent, control, controles, campos.
 */
import { Component, computed, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GeneroPelicula, PeliculasService } from '../../data-access/peliculas/peliculas.service';
import { Pelicula } from '../../data-access/peliculas/pelicula.model';
import { mensaje } from '../../data-access/cine/validacion';
import { AfichesService, validarAfiche } from '../../data-access/peliculas/afiches.service';
import { coincideCatalogo } from '../../data-access/cine/estado-catalogo';
import { AccionCatalogoComponent } from '../../shared/admin/accion-catalogo.component';
import { FiltroCatalogoComponent } from '../../shared/admin/filtro-catalogo.component';
@Component({
  imports: [ReactiveFormsModule, RouterLink, AccionCatalogoComponent, FiltroCatalogoComponent],
  styleUrl: './cine.scss',
  template: `<section class="page">
    <h1>Administrar películas</h1>
    <p class="module-intro">
      Eliminar retira la película del listado activo, sin borrar sus datos ni su historial.
    </p>
    <nav>
      <a routerLink="/admin/peliculas/generos">Géneros</a
      ><a routerLink="/admin/funciones">Funciones</a>
    </nav>
    @if (error()) {
      <div class="error" role="alert">
        <p>{{ error() }}</p>
        @if (erroresValidacion().length) {
          <ul>
            @for (e of erroresValidacion(); track e.id) {
              <li>
                <a [href]="'#' + e.id">{{ e.mensaje }}</a>
              </li>
            }
          </ul>
        }
      </div>
    }
    @if (exito()) {
      <p role="status">{{ exito() }}</p>
    }
    @if (cargando()) {
      <p role="status">Cargando…</p>
    }
    <div class="module-toolbar">
      <button class="btn" (click)="nueva()" [disabled]="ocupado()">Nueva película</button
      ><button class="btn btn--ghost" (click)="cargar()" [disabled]="ocupado()">
        Actualizar listado
      </button>
    </div>
    <app-filtro-catalogo
      #filtroCatalogo
      prefijo="peliculas"
      [total]="peliculas().length"
      [visibles]="visibles().length"
      [(busqueda)]="busqueda"
      [(estado)]="estadoFiltro"
    />
    <div class="grid">
      @for (p of visibles(); track p.id) {
        <article class="card">
          <h2>{{ p.titulo }}</h2>
          <p>{{ p.activa ? 'Activa' : 'Eliminada (recuperable)' }}</p>
          <button class="btn" [disabled]="ocupado()" (click)="editar(p)">
            Editar {{ p.titulo }}
          </button>
          <app-accion-catalogo
            [nombre]="p.titulo"
            [activo]="p.activa"
            [ocupado]="ocupado() || cargando()"
            (cambiar)="cambiarEstado(p, $event)"
          />
        </article>
      } @empty {
        <p>No hay películas para estos filtros.</p>
      }
    </div>
    <h2 #tituloEditor id="pelicula-editor" tabindex="-1">
      {{ editando() ? 'Editar película' : 'Nueva película' }}
    </h2>
    <form [formGroup]="formulario" (ngSubmit)="guardar()" aria-labelledby="pelicula-editor">
      <fieldset class="form-section">
        <legend>Ficha de la película</legend>
        <label for="p-titulo">Título</label
        ><input id="p-titulo" formControlName="titulo" maxlength="150" />
        <label for="p-slug">Slug (letras minúsculas, números y guiones)</label
        ><input id="p-slug" formControlName="slug" /> <label for="p-sinopsis">Sinopsis</label
        ><textarea id="p-sinopsis" formControlName="sinopsis"></textarea>
        <label for="p-duracion">Duración en minutos</label
        ><input
          id="p-duracion"
          type="number"
          formControlName="duracion_minutos"
          min="1"
          max="600"
          aria-describedby="p-duracion-ayuda"
        />
        <p id="p-duracion-ayuda" class="hint">
          Cambiar la duración requiere validar los horarios y los 30 minutos de limpieza. No debe
          modificarse si afecta una función en curso o con compras o reservas vigentes.
        </p>
        <label for="p-clasificacion">Clasificación</label
        ><select
          id="p-clasificacion"
          formControlName="clasificacion"
          [attr.aria-invalid]="campoInvalido('clasificacion') ? 'true' : null"
          [attr.aria-describedby]="
            campoInvalido('clasificacion')
              ? 'p-clasificacion-ayuda p-clasificacion-error'
              : 'p-clasificacion-ayuda'
          "
        >
          @if (clasificacionHistorica(); as historica) {
            <option [value]="historica" disabled>{{ historica }} (clasificación histórica)</option>
          }
          <option value="ATP">ATP</option>
          <option value="13">13</option>
          <option value="18">18</option>
        </select>
        <p id="p-clasificacion-ayuda" class="hint">
          @if (clasificacionHistorica(); as historica) {
            La clasificación actual es {{ historica }}. Para guardar, elegí ATP, 13 o 18 según
            corresponda. No se cambia automáticamente.
          } @else {
            Clasificaciones permitidas: ATP, 13 o 18.
          }
        </p>
        @if (campoInvalido('clasificacion')) {
          <p id="p-clasificacion-error" class="error">Elegí una clasificación: ATP, 13 o 18.</p>
        }
      </fieldset>
      <fieldset class="form-section">
        <legend>Presentación y estreno</legend>
        <label for="p-idioma">Idioma por defecto para funciones</label
        ><select id="p-idioma" formControlName="idioma">
          <option value="castellano">Castellano</option>
          <option value="subtitulada">Subtitulada</option></select
        ><label for="p-formato">Formato</label
        ><select id="p-formato" formControlName="formato">
          @for (f of formatos; track f) {
            <option [value]="f">{{ f }}</option>
          }
        </select>
        <label for="p-estreno">Fecha de estreno</label
        ><input id="p-estreno" type="date" formControlName="fecha_estreno" />
        <label for="p-preventa">Precio normal de preventa (ARS, vacío para deshabilitar)</label
        ><input
          id="p-preventa"
          type="number"
          min="0.01"
          step="0.01"
          formControlName="precio_preventa"
        />
        <p>
          Preventa desde 7 días antes del estreno. En el estreno se aplica el precio regular; el
          recargo VIP se mantiene.
        </p>
      </fieldset>
      <fieldset class="form-section">
        <legend>Afiche y organización</legend>
        <label for="p-archivo">Subir afiche desde el dispositivo</label>
        <input
          id="p-archivo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          [disabled]="ocupado()"
          aria-describedby="p-archivo-ayuda"
          (change)="elegirAfiche($event)"
        />
        <p id="p-archivo-ayuda" class="hint">
          JPG, PNG o WebP, hasta 5 MB. Se sube al guardar la película. No necesitás acceso al
          código.
        </p>
        @if (archivo(); as elegido) {
          <p role="status">Afiche seleccionado: {{ elegido.name }}</p>
          <button type="button" class="btn" [disabled]="ocupado()" (click)="quitarAfiche()">
            Quitar archivo seleccionado
          </button>
        }
        <label for="p-poster">O usar una URL HTTPS de afiche (opcional)</label>
        <input
          id="p-poster"
          formControlName="poster_url"
          placeholder="https://…"
          [readonly]="archivo() !== null"
        />
        <label for="p-generos">Géneros (selección múltiple)</label
        ><select
          id="p-generos"
          formControlName="generos"
          multiple
          [attr.aria-invalid]="campoInvalido('generos') ? 'true' : null"
          [attr.aria-describedby]="
            campoInvalido('generos') ? 'p-generos-ayuda p-generos-error' : 'p-generos-ayuda'
          "
        >
          @for (g of generosDisponibles(); track g.id) {
            <option [value]="g.id">
              {{ g.nombre }}{{ g.activo ? '' : ' (inactivo, asociación histórica)' }}
            </option>
          }
        </select>
        <p id="p-generos-ayuda" class="hint">Elegí al menos un género antes de guardar.</p>
        @if (campoInvalido('generos')) {
          <p id="p-generos-error" class="error">Seleccioná al menos un género.</p>
        }
        <label class="check"
          ><input type="checkbox" formControlName="activa" />Película activa</label
        >
        <p class="hint">
          Desactivar oculta la película; no la elimina. Los géneros se guardan junto a la película.
        </p>
      </fieldset>
      <button class="btn" [disabled]="ocupado() || cargando()">
        {{ ocupado() ? 'Subiendo afiche y guardando…' : 'Guardar película' }}
      </button>
    </form>
  </section>`,
})
export class AdminPeliculasComponent implements OnInit {
  protected readonly formatos = ['2D', '3D', '4D', '5D'];
  private readonly service = inject(PeliculasService);
  private readonly afiches = inject(AfichesService);
  private readonly fb = inject(FormBuilder).nonNullable;
  protected readonly peliculas = signal<Pelicula[]>([]);
  protected readonly busqueda = signal('');
  protected readonly estadoFiltro = signal('activo');
  protected readonly visibles = computed(() =>
    this.peliculas().filter((p) =>
      coincideCatalogo(p.titulo, p.activa, this.busqueda(), this.estadoFiltro()),
    ),
  );
  private readonly filtroCatalogo = viewChild<FiltroCatalogoComponent>('filtroCatalogo');
  protected readonly generos = signal<GeneroPelicula[]>([]);
  private readonly generosHistoricos = signal<string[]>([]);
  protected readonly generosDisponibles = computed(() =>
    this.generos().filter((g) => g.activo || this.generosHistoricos().includes(g.id)),
  );
  protected readonly editando = signal<string | null>(null);
  protected readonly clasificacionHistorica = signal<string | null>(null);
  private readonly tituloEditor = viewChild<ElementRef<HTMLElement>>('tituloEditor');
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly intentoGuardar = signal(false);
  protected readonly cargando = signal(true);
  protected readonly ocupado = signal(false);
  protected readonly error = signal('');
  protected readonly exito = signal('');
  protected readonly archivo = signal<File | null>(null);
  private inputArchivo: HTMLInputElement | null = null;
  protected readonly formulario = this.fb.group({
    titulo: ['', [Validators.required, Validators.maxLength(150)]],
    slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9]+(-[a-z0-9]+)*$/)]],
    sinopsis: ['', Validators.required],
    duracion_minutos: [90, [Validators.required, Validators.min(1), Validators.max(600)]],
    clasificacion: ['ATP', [Validators.required, Validators.pattern(/^(ATP|13|18)$/)]],
    idioma: ['castellano', [Validators.required, Validators.maxLength(60)]],
    formato: ['2D', [Validators.required, Validators.maxLength(30)]],
    fecha_estreno: ['', Validators.required],
    precio_preventa: this.fb.control<number | null>(null, Validators.min(0.01)),
    poster_url: ['', Validators.pattern(/^(\/[^\\]*|https:\/\/[^\s]+)?$/)],
    activa: [true],
    generos: this.fb.control<string[]>([], Validators.required),
  });
  ngOnInit(): void {
    void this.cargar();
  }
  protected async cambiarEstado(p: Pelicula, activa: boolean): Promise<void> {
    if (this.ocupado() || this.cargando()) return;
    this.ocupado.set(true);
    this.error.set('');
    this.exito.set('');
    this.formulario.disable();
    try {
      await this.service.cambiarEstado(p.id, activa);
      this.peliculas.update((ps) =>
        ps.map((item) => (item.id === p.id ? { ...item, activa } : item)),
      );
      this.ocupado.set(false);
      if (this.editando() === p.id) this.nueva();
      this.exito.set(
        activa
          ? 'Película restaurada.'
          : 'Película eliminada del listado activo. El historial se conserva.',
      );
      this.filtroCatalogo()?.enfocar();
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.formulario.enable();
      this.ocupado.set(false);
    }
  }
  protected nueva(): void {
    if (this.ocupado()) return;
    this.quitarAfiche();
    this.error.set('');
    this.exito.set('');
    this.intentoGuardar.set(false);
    this.editando.set(null);
    this.clasificacionHistorica.set(null);
    this.generosHistoricos.set([]);
    this.formulario.reset({
      titulo: '',
      slug: '',
      sinopsis: '',
      duracion_minutos: 90,
      clasificacion: 'ATP',
      idioma: 'castellano',
      formato: '2D',
      fecha_estreno: '',
      precio_preventa: null,
      poster_url: '',
      activa: true,
      generos: [],
    });
    this.tituloEditor()?.nativeElement.focus();
  }
  protected editar(p: Pelicula): void {
    if (this.ocupado()) return;
    this.quitarAfiche();
    this.error.set('');
    this.exito.set('');
    this.intentoGuardar.set(false);
    this.editando.set(p.id);
    this.clasificacionHistorica.set(
      ['ATP', '13', '18'].includes(p.clasificacion) ? null : p.clasificacion,
    );
    this.generosHistoricos.set(p.generos.map((g) => g.id));
    this.formulario.setValue({
      titulo: p.titulo,
      slug: p.slug,
      sinopsis: p.sinopsis,
      duracion_minutos: p.duracion_minutos,
      clasificacion: p.clasificacion,
      idioma: p.idioma === 'subtitulada' ? 'subtitulada' : 'castellano',
      formato: p.formato ?? '2D',
      fecha_estreno: p.fecha_estreno,
      precio_preventa: p.precio_preventa ?? null,
      poster_url: p.poster_url,
      activa: p.activa,
      generos: p.generos.map((g) => g.id),
    });
    this.formulario.markAsPristine();
    this.formulario.markAsUntouched();
    this.tituloEditor()?.nativeElement.focus();
  }
  protected campoInvalido(campo: keyof typeof this.formulario.controls): boolean {
    const control = this.formulario.controls[campo];
    return control.invalid && (control.touched || this.intentoGuardar());
  }
  protected erroresValidacion(): { id: string; mensaje: string }[] {
    if (!this.intentoGuardar()) return [];
    const controles = this.formulario.controls;
    const campos: { campo: keyof typeof controles; id: string; mensaje: string }[] = [
      { campo: 'titulo', id: 'p-titulo', mensaje: 'Completá el título (hasta 150 caracteres).' },
      { campo: 'slug', id: 'p-slug', mensaje: 'Usá un slug con minúsculas, números y guiones.' },
      { campo: 'sinopsis', id: 'p-sinopsis', mensaje: 'Completá la sinopsis.' },
      {
        campo: 'duracion_minutos',
        id: 'p-duracion',
        mensaje: 'Ingresá una duración de 1 a 600 minutos.',
      },
      {
        campo: 'clasificacion',
        id: 'p-clasificacion',
        mensaje: 'Elegí una clasificación: ATP, 13 o 18.',
      },
      { campo: 'idioma', id: 'p-idioma', mensaje: 'Elegí un idioma.' },
      { campo: 'formato', id: 'p-formato', mensaje: 'Elegí un formato.' },
      { campo: 'fecha_estreno', id: 'p-estreno', mensaje: 'Completá la fecha de estreno.' },
      {
        campo: 'precio_preventa',
        id: 'p-preventa',
        mensaje: 'El precio de preventa debe ser mayor que cero o estar vacío.',
      },
      {
        campo: 'poster_url',
        id: 'p-poster',
        mensaje: 'Usá una URL HTTPS o una ruta local válida para el afiche.',
      },
      { campo: 'generos', id: 'p-generos', mensaje: 'Seleccioná al menos un género.' },
    ];
    const errores = campos.filter((c) => controles[c.campo].invalid);
    if (
      !this.archivo() &&
      !controles.poster_url.value.trim() &&
      !errores.some((e) => e.campo === 'poster_url')
    ) {
      errores.push({
        campo: 'poster_url',
        id: 'p-poster',
        mensaje: 'Subí un afiche o completá su URL.',
      });
    }
    return errores;
  }
  protected async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      const [ps, gs] = await Promise.all([this.service.listar(true), this.service.generos()]);
      this.peliculas.set(ps);
      this.generos.set(gs);
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.cargando.set(false);
    }
  }
  protected async guardar(): Promise<void> {
    if (this.ocupado()) return;
    this.error.set('');
    this.exito.set('');
    this.intentoGuardar.set(true);
    if (
      this.formulario.invalid ||
      (!this.archivo() && !this.formulario.controls.poster_url.value.trim())
    ) {
      this.formulario.markAllAsTouched();
      this.error.set('No se guardó la película. Corregí los campos indicados.');
      const primero = this.erroresValidacion()[0];
      if (primero)
        this.elemento.nativeElement.querySelector<HTMLElement>('#' + primero.id)?.focus();
      return;
    }
    this.ocupado.set(true);
    this.formulario.disable();
    try {
      const { generos, ...datos } = this.formulario.getRawValue();
      const elegido = this.archivo();
      if (elegido) {
        datos.poster_url = await this.afiches.subir(elegido);
        // Conservar URL para reintentos. No borrar ante una respuesta de guardado incierta.
        this.formulario.controls.poster_url.setValue(datos.poster_url);
        this.quitarAfiche();
      }
      const id = await this.service.guardar(
        {
          ...datos,
          titulo: datos.titulo.trim(),
          ...(this.editando() ? { id: this.editando()! } : {}),
        },
        generos,
      );
      this.editando.set(id);
      this.generosHistoricos.set(generos);
      this.clasificacionHistorica.set(null);
      this.intentoGuardar.set(false);
      await this.cargar();
      this.exito.set('Película guardada.');
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.formulario.enable();
      this.ocupado.set(false);
    }
  }
  protected elegirAfiche(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.inputArchivo = input;
    this.archivo.set(null);
    this.error.set('');
    this.exito.set('');
    const archivo = input.files?.[0];
    if (!archivo) return;
    try {
      validarAfiche(archivo);
      this.archivo.set(archivo);
    } catch (e: unknown) {
      input.value = '';
      this.error.set(mensaje(e));
    }
  }
  protected quitarAfiche(): void {
    this.archivo.set(null);
    if (this.inputArchivo) this.inputArchivo.value = '';
  }
}
