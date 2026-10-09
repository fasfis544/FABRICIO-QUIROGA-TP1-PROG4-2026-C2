/**
 * Anotacion de responsabilidad: Componente Angular de Catalogo; concentra la responsabilidad de este modulo dentro de app/features/cine. Incluye principalmente: CatalogoComponent, revision, peliculas.
 */
import { ImagenCineComponent } from '../../shared/cine/imagen-cine.component';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PeliculasService } from '../../data-access/peliculas/peliculas.service';
import { Pelicula } from '../../data-access/peliculas/pelicula.model';
import { mensaje } from '../../data-access/cine/validacion';
import { OperacionesService } from '../../data-access/cine/operaciones.service';
import { DuracionPipe } from '../../shared/cine/pipes';
import { RedService } from '../../core/red.service';
import { coincideModalidad } from '../../data-access/peliculas/filtros-modalidad';
import { DiaCineService } from '../../core/dia-cine.service';
@Component({
  imports: [ImagenCineComponent, RouterLink, DuracionPipe],
  styleUrl: './cine.scss',
  template: ` <section class="page">
    <h1>{{ proximamente ? 'Próximamente' : 'Películas' }}</h1>
    @if (!red.online()) {
      <p role="status">
        Sin conexión: se muestra la última cartelera guardada (puede estar desactualizada). Compras
        y disponibilidad requieren internet.
      </p>
    }
    <label for="buscar-pelicula">Buscar por título o género</label
    ><input id="buscar-pelicula" type="search" [value]="busqueda()" (input)="buscar($event)" />
    <div class="grid">
      <div>
        <label for="f-genero">Género</label
        ><select id="f-genero" [value]="genero()" (change)="filtro(genero, $event)">
          <option value="">Todos</option>
          @for (g of generosDisponibles(); track g) {
            <option [value]="g">{{ g }}</option>
          }
        </select>
      </div>
      <div>
        <label for="f-clasificacion">Clasificación</label
        ><select
          id="f-clasificacion"
          [value]="clasificacion()"
          (change)="filtro(clasificacion, $event)"
        >
          <option value="">Todas</option>
          @for (c of clasificaciones(); track c) {
            <option [value]="c">{{ c }}</option>
          }
        </select>
      </div>
      <div>
        <label for="f-idioma">Idioma</label
        ><select id="f-idioma" [value]="idioma()" (change)="filtro(idioma, $event)">
          <option value="">Todos</option>
          @for (i of idiomas(); track i) {
            <option [value]="i">{{ i }}</option>
          }
        </select>
      </div>
      <div>
        <label for="f-formato">Formato</label
        ><select id="f-formato" [value]="formato()" (change)="filtro(formato, $event)">
          <option value="">Todos</option>
          @for (f of formatos(); track f) {
            <option [value]="f">{{ f }}</option>
          }
        </select>
      </div>
    </div>
    <p class="hint">Idioma y formato deben coincidir en una misma función disponible.</p>
    @if (catalogoAnterior()) {
      <p role="status">
        Este catálogo no incluye las combinaciones de funciones. Actualizá con conexión después de
        activar la migración de filtros; no se muestran combinaciones que no podemos comprobar.
      </p>
    }
    @if (cargando()) {
      <p role="status">Cargando cartelera…</p>
    }
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
      <button class="btn" (click)="cargar()">Reintentar</button>
    }
    <div class="grid">
      @for (p of visibles(); track p.id) {
        <article class="card">
          <div class="poster">
            <app-imagen-cine [src]="p.poster_url" [nombre]="p.titulo" />
          </div>
          <h2>{{ p.titulo }}</h2>
          <p>{{ p.clasificacion }} · {{ p.duracion_minutos | duracion }}</p>
          <p>{{ generos(p) }}</p>
          <a class="btn" [routerLink]="['/peliculas', p.id]">Ver {{ p.titulo }}</a>
        </article>
      } @empty {
        @if (!cargando() && !error()) {
          <p>No hay películas para esta búsqueda.</p>
        }
      }
    </div>
  </section>`,
})
export class CatalogoComponent implements OnInit {
  protected readonly red = inject(RedService);
  private readonly operaciones = inject(OperacionesService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(PeliculasService);
  protected readonly proximamente = inject(ActivatedRoute).snapshot.data['proximamente'] === true;
  private readonly dia = inject(DiaCineService);
  private revisionCarga = 0;
  protected readonly peliculas = signal<Pelicula[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly busqueda = signal('');
  protected readonly genero = signal('');
  protected readonly clasificacion = signal('');
  protected readonly idioma = signal('');
  protected readonly formato = signal('');
  protected readonly generosDisponibles = computed(() =>
    [...new Set(this.peliculas().flatMap((p) => p.generos.map((g) => g.nombre)))].sort(),
  );
  protected readonly clasificaciones = computed(() =>
    [...new Set(this.peliculas().map((p) => p.clasificacion))].sort(),
  );
  protected readonly idiomas = computed(() =>
    [...new Set(this.peliculas().flatMap((p) => p.idiomas ?? []))].sort(),
  );
  protected readonly formatos = computed(() =>
    [...new Set(this.peliculas().flatMap((p) => p.formatos ?? []))].sort(),
  );
  protected readonly catalogoAnterior = computed(
    () =>
      !!this.idioma() &&
      !!this.formato() &&
      this.peliculas().some(
        (p) => p.modalidades === undefined && (!p.idioma || !p.formato),
      ),
  );
  protected filtro(destino: { set(value: string): void }, event: Event): void {
    destino.set((event.target as HTMLSelectElement).value);
  }
  protected readonly visibles = computed(() =>
    this.peliculas().filter(
      (p) =>
        (p.fecha_estreno > this.dia.hoy()) === this.proximamente &&
        (p.titulo + ' ' + this.generos(p)).toLowerCase().includes(this.busqueda().toLowerCase()) &&
        (!this.genero() || p.generos.some((g) => g.nombre === this.genero())) &&
        (!this.clasificacion() || p.clasificacion === this.clasificacion()) &&
        coincideModalidad(p, this.idioma(), this.formato()),
    ),
  );
  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      this.revisionCarga++;
    });
    void this.cargar();
    this.destroyRef.onDestroy(this.operaciones.observar('cartelera', () => void this.cargar()));
  }
  protected buscar(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
  }
  protected generos(p: Pelicula): string {
    return p.generos.map((g) => g.nombre).join(' · ');
  }
  protected async cargar(): Promise<void> {
    const revision = ++this.revisionCarga;
    this.cargando.set(true);
    this.error.set('');
    try {
      const peliculas = await this.service.listar();
      if (revision === this.revisionCarga) this.peliculas.set(peliculas);
    } catch (e: unknown) {
      if (revision === this.revisionCarga) this.error.set(mensaje(e));
    } finally {
      if (revision === this.revisionCarga) this.cargando.set(false);
    }
  }
}
