/**
 * Anotacion de responsabilidad: Componente Angular de Ranking; concentra la responsabilidad de este modulo dentro de app/features/cartelera/inicio/ranking. Incluye principalmente: RankingComponent.
 */
import { DecimalPipe, NgOptimizedImage } from '@angular/common';
import { Component, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Pelicula } from '../../../../data-access/peliculas/pelicula.model';

@Component({
  selector: 'app-ranking',
  imports: [DecimalPipe, NgOptimizedImage, RouterLink],
  templateUrl: './ranking.component.html',
  styleUrl: './ranking.component.scss',
})
export class RankingComponent {
  readonly peliculas = input.required<readonly Pelicula[]>();
  readonly cargando = input(false);
  readonly error = input('');
  readonly reintentar = output<void>();
  private readonly portadasNoDisponibles = signal<Readonly<Record<string, boolean>>>({});

  protected portada(pelicula: Pelicula): string {
    return this.portadasNoDisponibles()[pelicula.id] || !pelicula.poster_url
      ? '/images/afiche-respaldo.svg'
      : pelicula.poster_url;
  }
  protected portadaNoDisponible(id: string): void {
    this.portadasNoDisponibles.update((portadas) =>
      portadas[id] ? portadas : { ...portadas, [id]: true },
    );
  }
}
