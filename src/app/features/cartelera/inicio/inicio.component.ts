/**
 * Anotacion de responsabilidad: Componente Angular de Inicio; concentra la responsabilidad de este modulo dentro de app/features/cartelera/inicio. Incluye principalmente: InicioComponent, revision, peliculas.
 */
import { NgOptimizedImage } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PeliculasService } from '../../../data-access/peliculas/peliculas.service';
import { Pelicula } from '../../../data-access/peliculas/pelicula.model';
import { OperacionesService } from '../../../data-access/cine/operaciones.service';
import { mensaje } from '../../../data-access/cine/validacion';
import { RankingComponent } from './ranking/ranking.component';
import { DiaCineService } from '../../../core/dia-cine.service';
import { ImagenCineComponent } from '../../../shared/cine/imagen-cine.component';
@Component({
  host: { 'data-component': 'inicio' },
  imports: [NgOptimizedImage, RouterLink, RankingComponent, ImagenCineComponent],
  styleUrl: './inicio.component.scss',
  templateUrl: './inicio.component.html',
})
export class InicioComponent implements OnInit {
  private readonly operaciones = inject(OperacionesService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly ranking = computed(() =>
    this.peliculas()
      .filter((p) => (p.ventas ?? 0) > 0)
      .sort((a, b) => (b.ventas ?? 0) - (a.ventas ?? 0) || a.titulo.localeCompare(b.titulo))
      .slice(0, 3),
  );
  private readonly service = inject(PeliculasService);
  private readonly dia = inject(DiaCineService);
  private revisionCarga = 0;
  protected readonly peliculas = signal<Pelicula[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly movies = computed(() =>
    this.peliculas()
      .filter((p) => p.fecha_estreno <= this.dia.hoy())
      .slice(0, 4)
      .map((p) => ({
        id: p.id,
        title: p.titulo,
        genre: p.generos.map((g) => g.nombre).join(' · ') + ' · ' + p.duracion_minutos + ' min',
        age: p.clasificacion,
        accent: '#252529',
        image: p.poster_url,
      })),
  );
  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      this.revisionCarga++;
    });
    this.destroyRef.onDestroy(this.operaciones.observar('cartelera', () => void this.cargar()));
    void this.cargar();
  }
  protected async cargar(): Promise<void> {
    const revision = ++this.revisionCarga;
    this.error.set('');
    this.cargando.set(true);
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
