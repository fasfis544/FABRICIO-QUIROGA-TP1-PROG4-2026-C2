/**
 * Anotacion de responsabilidad: Componente Angular de Programacion; concentra la responsabilidad de este modulo dentro de app/features/cine. Incluye principalmente: ProgramacionComponent, nombre, s, f.
 */
import { Component, computed, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Funcion, OperacionesService, Sala } from '../../data-access/cine/operaciones.service';
import { PeliculasService } from '../../data-access/peliculas/peliculas.service';
import { Pelicula } from '../../data-access/peliculas/pelicula.model';
import { mensaje } from '../../data-access/cine/validacion';
import { FuncionAdminComponent } from '../admin/funcion-admin.component';
import { errorInicioFuncion } from '../../data-access/cine/validacion-admin';
import { instanteArgentina } from '../../shared/cine/fecha-argentina';
import { coincideCatalogo } from '../../data-access/cine/estado-catalogo';
import { AccionCatalogoComponent } from '../../shared/admin/accion-catalogo.component';
import { FiltroCatalogoComponent } from '../../shared/admin/filtro-catalogo.component';
@Component({
  imports: [
    ReactiveFormsModule,
    RouterLink,
    FuncionAdminComponent,
    AccionCatalogoComponent,
    FiltroCatalogoComponent,
  ],
  styleUrl: './cine.scss',
  template: `<section class="page">
    <h1>{{ encabezado }}</h1>
    <p class="module-intro">{{ descripcion }}</p>
    <nav>
      <a routerLink="/admin/salas">Salas</a><a routerLink="/admin/funciones">Funciones</a
      ><a routerLink="/admin/salas/butacas">Mantenimiento de butacas</a
      ><a routerLink="/admin/precios">Precios y formatos</a
      ><a routerLink="/admin/funciones/programacion">Programar por días y rango</a>
    </nav>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (exito()) {
      <p role="status">{{ exito() }}</p>
    }
    @if (cargando()) {
      <p role="status">Cargando…</p>
    }
    <button class="btn btn--ghost" (click)="cargar()" [disabled]="ocupado() || cargando()">
      Actualizar listado
    </button>
    @if (vista === 'salas' || vista === 'todo') {
      <h2>Nueva sala</h2>
      <form [formGroup]="salaForm" (ngSubmit)="crearSala()">
        <label for="s-nombre">Nombre</label
        ><input
          id="s-nombre"
          formControlName="nombre"
          [attr.aria-invalid]="errorSala() ? 'true' : null"
          [attr.aria-describedby]="errorSala() ? 's-nombre-error' : null"
          (input)="errorSala.set('')"
        />
        @if (errorSala(); as detalle) {
          <p id="s-nombre-error" class="error" role="alert">{{ detalle }}</p>
        }
        <label for="s-filas">Filas (A–Z)</label
        ><input id="s-filas" type="number" readonly formControlName="filas" /><label
          for="s-columnas"
          >Butacas por fila</label
        ><input id="s-columnas" type="number" readonly formControlName="columnas" />
        <p>A–T: bloques 4+20+4, excepto J/K 2+10+2; R/S/T VIP. Total: 532 butacas.</p>
        <button class="btn" [disabled]="ocupado() || cargando()">Crear sala</button>
      </form>
      <h2>Salas existentes</h2>
      <app-filtro-catalogo
        #filtroSalas
        prefijo="salas"
        [total]="salas().length"
        [visibles]="salasVisibles().length"
        [(busqueda)]="busquedaSalas"
        [(estado)]="estadoSalas"
      />
      <div class="grid">
        @for (s of salasVisibles(); track s.id) {
          <article class="card">
            <h3>{{ s.nombre }} · {{ s.activa ? 'Activa' : 'Eliminada (recuperable)' }}</h3>
            <p>
              {{
                s.distribucion_documento
                  ? 'Distribución del documento: 532 butacas'
                  : 'Distribución histórica, pendiente de adaptar'
              }}
            </p>
            <label [for]="'s-nombre-' + s.id">Nombre de la sala</label
            ><input [id]="'s-nombre-' + s.id" [value]="s.nombre" #nombre />
            <button class="btn" [disabled]="ocupado()" (click)="adaptar(s, nombre.value, s.activa)">
              Guardar y adaptar distribución
            </button>
            <app-accion-catalogo
              [nombre]="s.nombre"
              [activo]="s.activa"
              [ocupado]="ocupado() || cargando()"
              (cambiar)="cambiarEstadoSala(s, $event)"
            />
          </article>
        } @empty {
          <p>No hay salas para estos filtros.</p>
        }
      </div>
    }
    @if (vista === 'funciones' || vista === 'todo') {
      <h2>Nueva función</h2>
      <form [formGroup]="funcionForm" (ngSubmit)="crearFuncion()">
        <label for="f-pelicula">Película</label
        ><select id="f-pelicula" formControlName="pelicula">
          <option value="">Elegí una película</option>
          @for (p of peliculas(); track p.id) {
            @if (p.activa) {
              <option [value]="p.id">{{ p.titulo }}</option>
            }
          }
        </select>
        <p>
          La sala disponible se asigna automáticamente, respetando duración y 30 minutos entre
          funciones.
        </p>
        <label for="f-inicio">Inicio (Argentina)</label
        ><input
          #inicioInput
          id="f-inicio"
          type="datetime-local"
          formControlName="inicio"
          [attr.aria-invalid]="errorInicio() ? 'true' : null"
          [attr.aria-describedby]="
            errorInicio() ? 'f-inicio-ayuda f-inicio-error' : 'f-inicio-ayuda'
          "
          (input)="errorInicio.set('')"
        />
        <p id="f-inicio-ayuda" class="hint">
          Elegí un horario futuro de Argentina (UTC−03), sin importar la zona del dispositivo. El
          servidor lo revalida al guardar.
        </p>
        @if (errorInicio(); as detalle) {
          <p id="f-inicio-error" class="error" role="alert">{{ detalle }}</p>
        }
        <label for="f-precio">Precio por entrada (ARS)</label
        ><input
          id="f-precio"
          type="number"
          min="0.01"
          step="0.01"
          formControlName="precio"
          [attr.aria-invalid]="errorPrecio() ? 'true' : null"
          [attr.aria-describedby]="errorPrecio() ? 'f-precio-error' : null"
          (input)="errorPrecio.set('')"
        />
        @if (errorPrecio(); as detalle) {
          <p id="f-precio-error" class="error" role="alert">{{ detalle }}</p>
        }
        <label for="f-idioma">Idioma de la función</label
        ><select id="f-idioma" formControlName="idioma">
          <option value="castellano">Castellano</option>
          <option value="subtitulada">Subtitulada</option></select
        ><label for="f-formato">Formato de la función</label
        ><select
          id="f-formato"
          formControlName="formato"
          [attr.aria-invalid]="errorFormato() ? 'true' : null"
          [attr.aria-describedby]="errorFormato() ? 'f-formato-error' : null"
          (change)="errorFormato.set('')"
        >
          @for (f of formatos; track f) {
            <option [value]="f">{{ f }}</option>
          }
        </select>
        @if (errorFormato(); as detalle) {
          <p id="f-formato-error" class="error" role="alert">{{ detalle }}</p>
        }
        <p class="hint">
          Se reservan 30 minutos de limpieza después de la película. El servidor rechaza horarios
          superpuestos.
        </p>
        <button class="btn" [disabled]="ocupado() || cargando()">Crear función</button>
      </form>
    }
    @if (vista !== 'salas') {
      <h2>
        {{
          vista === 'precios'
            ? 'Tarifas y registros de funciones'
            : 'Funciones y registros históricos'
        }}
      </h2>
      <div class="grid">
        <div>
          <label for="admin-f-sala">Filtrar por sala</label
          ><select id="admin-f-sala" [value]="salaFiltro()" (change)="filtrarSala($event)">
            <option value="">Todas las salas</option>
            @for (s of salas(); track s.id) {
              <option [value]="s.id">{{ s.nombre }}</option>
            }
          </select>
        </div>
        <div>
          <label for="admin-f-estado">Filtrar por estado operativo</label
          ><select id="admin-f-estado" [value]="estadoFiltro()" (change)="filtrarEstado($event)">
            <option value="">Todos, incluidos históricos</option>
            <option value="operativa">Operativas</option>
            <option value="no-operativa">No operativas</option>
          </select>
        </div>
      </div>
      <p role="status">
        {{ funcionesVisibles().length }} de {{ funciones().length }} funciones. El filtro no elimina
        registros.
      </p>
      <div class="grid">
        @for (f of funcionesVisibles(); track f.id) {
          <app-funcion-admin
            [funcion]="f"
            [titulo]="titulo(f.pelicula_id)"
            [sala]="nombreSala(f.sala_id)"
            [estado]="estadoFuncion(f)"
            [disponible]="disponible(f)"
            [editarPrecios]="vista === 'precios' || vista === 'todo'"
            [gestionarHorario]="vista !== 'precios'"
            (guardado)="cambioGuardado()"
          />
        } @empty {
          <p>No hay funciones para estos filtros.</p>
        }
      </div>
    }
  </section>`,
})
export class ProgramacionComponent implements OnInit {
  protected readonly vista: 'salas' | 'funciones' | 'precios' | 'todo' =
    inject(ActivatedRoute, { optional: true })?.snapshot.data['vista'] ?? 'todo';
  protected readonly encabezado =
    this.vista === 'salas'
      ? 'Salas'
      : this.vista === 'funciones'
        ? 'Funciones'
        : this.vista === 'precios'
          ? 'Precios y formatos'
          : 'Salas, horarios y precios';
  protected readonly descripcion =
    this.vista === 'salas'
      ? 'Organizá los espacios del cine y su distribución de butacas.'
      : this.vista === 'precios'
        ? 'Ajustá tarifas, recargos VIP y presentación sin cambiar los horarios.'
        : 'Creá funciones o gestioná su horario y cancelación. La sala disponible se asigna automáticamente.';
  protected readonly formatos = ['2D', '3D', '4D', '5D'];
  protected async adaptar(s: Sala, nombre: string, activa: boolean): Promise<void> {
    await this.ejecutar(() => this.service.adaptarSala(s.id, nombre, activa));
  }
  private readonly service = inject(OperacionesService);
  private readonly catalogo = inject(PeliculasService);
  private readonly fb = inject(FormBuilder).nonNullable;
  protected readonly salas = signal<Sala[]>([]);
  protected readonly busquedaSalas = signal('');
  protected readonly estadoSalas = signal('activo');
  protected readonly salasVisibles = computed(() =>
    this.salas().filter((s) =>
      coincideCatalogo(s.nombre, s.activa, this.busquedaSalas(), this.estadoSalas()),
    ),
  );
  private readonly filtroSalas = viewChild<FiltroCatalogoComponent>('filtroSalas');
  protected async cambiarEstadoSala(s: Sala, activa: boolean): Promise<void> {
    if (this.ocupado() || this.cargando()) return;
    this.ocupado.set(true);
    this.error.set('');
    this.exito.set('');
    try {
      await this.service.cambiarEstadoSala(s.id, activa);
      this.salas.update((xs) => xs.map((item) => (item.id === s.id ? { ...item, activa } : item)));
      this.exito.set(
        activa
          ? 'Sala restaurada.'
          : 'Sala eliminada del listado activo. Las funciones y el historial se conservan.',
      );
      this.filtroSalas()?.enfocar();
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }
  protected readonly funciones = signal<Funcion[]>([]);
  protected readonly peliculas = signal<Pelicula[]>([]);
  protected readonly salaFiltro = signal('');
  protected readonly estadoFiltro = signal('');
  protected readonly funcionesVisibles = computed(() =>
    this.funciones().filter(
      (f) =>
        (!this.salaFiltro() || f.sala_id === this.salaFiltro()) &&
        (!this.estadoFiltro() || this.disponible(f) === (this.estadoFiltro() === 'operativa')),
    ),
  );
  protected filtrarEstado(event: Event): void {
    this.estadoFiltro.set((event.target as HTMLSelectElement).value);
  }
  protected filtrarSala(event: Event): void {
    this.salaFiltro.set((event.target as HTMLSelectElement).value);
  }
  protected readonly error = signal('');
  protected readonly errorSala = signal('');
  protected readonly errorInicio = signal('');
  protected readonly errorPrecio = signal('');
  protected readonly errorFormato = signal('');
  private readonly inicioInput = viewChild<ElementRef<HTMLInputElement>>('inicioInput');
  protected readonly exito = signal('');
  protected readonly ocupado = signal(false);
  protected readonly cargando = signal(true);
  protected readonly salaForm = this.fb.group({
    nombre: ['', Validators.required],
    filas: [20, [Validators.required]],
    columnas: [28, [Validators.required]],
  });
  protected readonly funcionForm = this.fb.group({
    pelicula: ['', Validators.required],
    inicio: ['', Validators.required],
    precio: [1000, [Validators.required, Validators.min(0.01)]],
    idioma: ['castellano', [Validators.required, Validators.pattern(/^(castellano|subtitulada)$/)]],
    formato: ['2D', [Validators.required, Validators.pattern(/^(2D|3D|4D|5D)$/)]],
  });
  ngOnInit(): void {
    void this.cargar();
  }
  protected titulo(id: string): string {
    return this.peliculas().find((p) => p.id === id)?.titulo ?? 'Película no disponible';
  }
  protected nombreSala(id: string): string {
    return this.salas().find((s) => s.id === id)?.nombre ?? 'Sala no disponible';
  }
  protected disponible(f: Funcion): boolean {
    return (
      f.activa &&
      new Date(f.fin).getTime() > Date.now() &&
      this.peliculas().some((p) => p.id === f.pelicula_id && p.activa) &&
      this.salas().some((s) => s.id === f.sala_id && s.activa)
    );
  }
  protected estadoFuncion(f: Funcion): string {
    if (!f.activa || new Date(f.fin).getTime() <= Date.now())
      return 'Función vencida / no operativa';
    if (!this.peliculas().some((p) => p.id === f.pelicula_id && p.activa))
      return 'Película no disponible';
    if (!this.salas().some((s) => s.id === f.sala_id && s.activa)) return 'Sala no disponible';
    return 'Función operativa';
  }
  protected async cambioGuardado(): Promise<void> {
    await this.cargar();
    this.exito.set('Cambio guardado correctamente.');
  }
  protected async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    this.errorSala.set('');
    try {
      const [s, f, p] = await Promise.all([
        this.service.salas(),
        this.service.funcionesAdministracion(),
        this.catalogo.listar(true),
      ]);
      this.salas.set(s);
      this.funciones.set(f);
      this.peliculas.set(p);
    } catch (e: unknown) {
      this.error.set(this.mensajeOperacion(e));
    } finally {
      this.cargando.set(false);
    }
  }
  protected async crearSala(): Promise<void> {
    const nombre = this.salaForm.controls.nombre.value.trim();
    this.errorSala.set(
      !nombre
        ? 'Ingresá un nombre para la sala.'
        : nombre.length > 100
          ? 'El nombre no puede superar 100 caracteres.'
          : '',
    );
    if (this.errorSala() || this.salaForm.invalid) {
      this.salaForm.controls.nombre.markAsTouched();
      return;
    }
    const s = this.salaForm.getRawValue();
    if (await this.ejecutar(() => this.service.crearSala(nombre, s.filas, s.columnas)))
      this.salaForm.reset({ nombre: '', filas: 20, columnas: 28 });
  }
  protected async crearFuncion(): Promise<void> {
    if (this.ocupado() || this.cargando()) return;
    this.error.set('');
    this.exito.set('');
    this.errorPrecio.set('');
    this.errorFormato.set('');
    this.funcionForm.markAllAsTouched();
    const f = this.funcionForm.getRawValue();
    this.errorInicio.set(errorInicioFuncion(f.inicio));
    if (this.errorInicio()) {
      this.inicioInput()?.nativeElement.focus();
      return;
    }
    if (!Number.isFinite(f.precio) || f.precio <= 0) {
      this.errorPrecio.set('Ingresá un precio mayor que 0.');
    }
    if (!['2D', '3D', '4D', '5D'].includes(f.formato)) {
      this.errorFormato.set('Elegí un formato válido: 2D, 3D, 4D o 5D.');
    }
    if (this.funcionForm.controls.pelicula.invalid) {
      this.error.set('Elegí una película activa.');
    }
    if (this.funcionForm.invalid || this.errorPrecio() || this.errorFormato()) {
      return;
    }
    const guardado = await this.ejecutar(() =>
      this.service.crearFuncion(
        f.pelicula,
        instanteArgentina(f.inicio),
        f.precio,
        f.idioma,
        f.formato,
      ),
    );
    if (guardado) {
      this.errorInicio.set('');
      this.funcionForm.reset({
        pelicula: '',
        inicio: '',
        precio: 1000,
        idioma: 'castellano',
        formato: '2D',
      });
      this.exito.set('Función creada. La sala disponible fue asignada automáticamente.');
    }
  }
  private async ejecutar(accion: () => Promise<void>): Promise<boolean> {
    if (this.ocupado()) return false;
    this.ocupado.set(true);
    this.error.set('');
    this.exito.set('');
    try {
      await accion();
      await this.cargar();
      this.exito.set('Guardado correctamente.');
      return true;
    } catch (e: unknown) {
      this.error.set(this.mensajeOperacion(e));
      return false;
    } finally {
      this.ocupado.set(false);
    }
  }
  private mensajeOperacion(error: unknown): string {
    const detalle = mensaje(error).toLowerCase();
    if (detalle.includes('no hay una sala') || detalle.includes('superpuest'))
      return 'No hay una sala disponible para ese horario. Elegí otra fecha u hora.';
    if (detalle.includes('datos de función') || detalle.includes('función inválid'))
      return 'Revisá película, horario, precio, idioma y formato de la función.';
    if (detalle.includes('nombre') && detalle.includes('sala'))
      return 'Revisá el nombre de la sala e intentá nuevamente.';
    return mensaje(error);
  }
}
