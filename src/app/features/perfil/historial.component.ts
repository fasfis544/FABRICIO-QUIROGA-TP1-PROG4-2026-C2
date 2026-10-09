/**
 * Anotacion de responsabilidad: Componente Angular de Historial; concentra la responsabilidad de este modulo dentro de app/features/perfil. Incluye principalmente: HistorialComponent.
 */
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ImagenCineComponent } from '../../shared/cine/imagen-cine.component';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ClienteService, ReservaCliente } from '../../data-access/perfiles/cliente.service';
import { mensaje } from '../../data-access/cine/validacion';
@Component({
  imports: [RouterLink, DatePipe, CurrencyPipe, ImagenCineComponent],
  styleUrl: '../cine/cine.scss',
  template: `<section class="page">
    <a routerLink="/perfil">Mi cuenta</a>
    <h1>{{ vistas ? 'Mis películas vistas' : 'Mis reservas y compras' }}</h1>
    @if (!vistas) {
      <label for="estado-reserva">Estado</label
      ><select id="estado-reserva" [value]="estado()" (change)="filtrar($event)">
        <option value="">Todos</option>
        <option value="pendiente">Pendientes</option>
        <option value="confirmada">Confirmadas</option>
        <option value="vencida">Vencidas</option>
        <option value="cancelada">Canceladas</option>
      </select>
    }
    @if (cargando()) {
      <p role="status">Cargando historial…</p>
    }
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
    }
    <button class="btn" [disabled]="cargando()" (click)="cargar()">Actualizar</button>
    <div class="grid">
      @for (r of visibles(); track r.token) {
        <article class="card">
          @if (vistas) {
            <div class="poster">
              <app-imagen-cine [src]="r.poster_url" [nombre]="r.pelicula.titulo" />
            </div>
            <p>
              Mi calificación:
              {{
                r.calificacion_propia ? r.calificacion_propia + ' / 5 estrellas' : 'Sin calificar'
              }}
            </p>
          }
          <h2>{{ r.pelicula.titulo }}</h2>
          <p>
            {{ r.sala }} · {{ r.funcion.inicio | date: 'dd/MM/yyyy HH:mm' : '-0300' }} (Argentina)
          </p>
          <p>Estado: {{ r.estado }} · {{ r.total | currency: 'ARS' }}</p>
          <p>Butacas: {{ butacas(r) }}</p>
          <a class="btn" [routerLink]="['/perfil/compras', r.token]"
            >Ver detalle de {{ r.pelicula.titulo }}</a
          >
        </article>
      } @empty {
        @if (!cargando() && !error()) {
          <p>
            {{
              vistas
                ? 'Todavía no tenés entradas utilizadas.'
                : 'Todavía no hay reservas para este estado.'
            }}
          </p>
        }
      }
    </div>
  </section>`,
})
export class HistorialComponent implements OnInit {
  private readonly service = inject(ClienteService);
  protected readonly vistas = inject(ActivatedRoute).snapshot.data['vistas'] === true;
  protected readonly reservas = signal<ReservaCliente[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly estado = signal('');
  protected readonly visibles = computed(() =>
    this.reservas().filter((r) =>
      this.vistas
        ? r.entradas.some((e) => e.usada_en !== null)
        : !this.estado() || r.estado === this.estado(),
    ),
  );
  ngOnInit(): void {
    void this.cargar();
  }
  protected filtrar(event: Event): void {
    this.estado.set((event.target as HTMLSelectElement).value);
  }
  protected butacas(r: ReservaCliente): string {
    return r.entradas.map((e) => e.butaca).join(', ') || 'Reserva vencida, butacas liberadas';
  }
  protected async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      this.reservas.set(await this.service.reservas());
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.cargando.set(false);
    }
  }
}
