/**
 * Anotacion de responsabilidad: Componente Angular de Generos; concentra la responsabilidad de este modulo dentro de app/features/admin. Incluye principalmente: Genero, GenerosComponent, g.
 */
import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { lista, objeto, texto, mensaje } from '../../data-access/cine/validacion';
import { errorAdmin } from '../../data-access/cine/errores-admin';
import { cambiarEstadoCatalogo, coincideCatalogo } from '../../data-access/cine/estado-catalogo';
import { AccionCatalogoComponent } from '../../shared/admin/accion-catalogo.component';
import { FiltroCatalogoComponent } from '../../shared/admin/filtro-catalogo.component';
interface Genero {
  id: string;
  nombre: string;
  slug: string;
  activa: boolean;
}
@Component({
  imports: [RouterLink, ReactiveFormsModule, AccionCatalogoComponent, FiltroCatalogoComponent],
  styleUrl: '../cine/cine.scss',
  template: `<section class="page">
    <a routerLink="/admin/peliculas">Películas</a>
    <h1>Géneros</h1>
    @if (error()) {
      <p role="alert">{{ error() }}</p>
    }
    @if (exito()) {
      <p role="status">{{ exito() }}</p>
    }
    <button class="btn" [disabled]="ocupado()" (click)="nuevo()">Nuevo género</button>
    <form [formGroup]="formulario" (ngSubmit)="guardar()">
      <label for="genero-nombre">Nombre</label
      ><input id="genero-nombre" formControlName="nombre" /><label for="genero-slug"
        >Slug (minúsculas y guiones)</label
      ><input id="genero-slug" formControlName="slug" /><label
        ><input type="checkbox" formControlName="activa" /> Activo</label
      ><button class="btn" [disabled]="ocupado() || formulario.invalid">Guardar género</button>
    </form>
    <app-filtro-catalogo
      #filtroCatalogo
      prefijo="generos"
      [total]="generos().length"
      [visibles]="visibles().length"
      [(busqueda)]="busqueda"
      [(estado)]="estadoFiltro"
    />
    @for (g of visibles(); track g.id) {
      <article class="card">
        <h2>{{ g.nombre }}</h2>
        <p>{{ g.activa ? 'Activo' : 'Eliminado (recuperable)' }}</p>
        <button class="btn" [disabled]="ocupado()" (click)="editar(g)">
          Editar {{ g.nombre }}
        </button>
        <app-accion-catalogo
          [nombre]="g.nombre"
          [activo]="g.activa"
          [ocupado]="ocupado() || cargando()"
          (cambiar)="cambiarEstado(g, $event)"
        />
      </article>
    } @empty {
      <p>No hay géneros para estos filtros.</p>
    }
  </section>`,
})
export class GenerosComponent implements OnInit {
  private readonly client = inject(SupabaseService).getClient();
  protected readonly generos = signal<Genero[]>([]);
  protected readonly cargando = signal(true);
  protected readonly busqueda = signal('');
  protected readonly estadoFiltro = signal('activo');
  protected readonly visibles = computed(() =>
    this.generos().filter((g) =>
      coincideCatalogo(g.nombre, g.activa, this.busqueda(), this.estadoFiltro()),
    ),
  );
  private readonly filtroCatalogo = viewChild<FiltroCatalogoComponent>('filtroCatalogo');
  protected async cambiarEstado(g: Genero, activa: boolean): Promise<void> {
    if (this.ocupado() || this.cargando()) return;
    this.ocupado.set(true);
    this.error.set('');
    this.exito.set('');
    this.formulario.disable();
    try {
      await cambiarEstadoCatalogo(this.client, 'genero', g.id, activa);
      this.generos.update((xs) =>
        xs.map((item) => (item.id === g.id ? { ...item, activa } : item)),
      );
      if (this.formulario.controls.id.value === g.id) this.nuevo();
      this.exito.set(
        activa
          ? 'Género restaurado.'
          : 'Género eliminado del listado activo. Sus asociaciones históricas se conservan.',
      );
      this.filtroCatalogo()?.enfocar();
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.formulario.enable();
      this.ocupado.set(false);
    }
  }
  protected readonly error = signal('');
  protected readonly exito = signal('');
  protected readonly ocupado = signal(false);
  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    id: [''],
    nombre: ['', [Validators.required, Validators.maxLength(100)]],
    slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9]+(-[a-z0-9]+)*$/)]],
    activa: [true],
  });
  ngOnInit(): void {
    void this.cargar();
  }
  protected nuevo(): void {
    this.formulario.reset({ id: '', nombre: '', slug: '', activa: true });
  }
  protected editar(g: Genero): void {
    this.formulario.setValue(g);
  }
  private async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const { data, error } = await this.client.from('generos').select('*').order('nombre');
      if (error) throw new Error(error.message);
      this.generos.set(
        lista(data).map((x) => {
          const g = objeto(x);
          return {
            id: texto(g, 'id'),
            nombre: texto(g, 'nombre'),
            slug: texto(g, 'slug'),
            activa: (g['activo'] ?? g['activa']) === true,
          };
        }),
      );
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.cargando.set(false);
    }
  }
  protected async guardar(): Promise<void> {
    if (this.ocupado() || this.formulario.invalid) return;
    this.ocupado.set(true);
    this.error.set('');
    this.exito.set('');
    try {
      const { data, error } = await this.client.rpc('cine_guardar_genero', {
        p_datos: this.formulario.getRawValue(),
      });
      if (error) throw errorAdmin(error);
      if (typeof data !== 'string' || !data)
        throw new Error(
          'No se recibió el identificador. Actualizá el listado antes de reintentar.',
        );
      this.formulario.controls.id.setValue(data);
      await this.cargar();
      this.exito.set('Género guardado.');
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
