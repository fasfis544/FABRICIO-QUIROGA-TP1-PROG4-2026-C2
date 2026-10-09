/**
 * Anotacion de responsabilidad: Componente Angular de Panel; concentra la responsabilidad de este modulo dentro de app/features/cine. Incluye principalmente: PanelComponent, normalizar, q.
 */
import { Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { areasAdmin } from '../admin/admin-navigation';
@Component({
  selector: 'app-admin-panel',
  imports: [RouterLink],
  styleUrl: '../admin/dashboard/panel.scss',
  template: `<section class="page dashboard">
    <header class="dashboard-heading">
      <div>
        <p class="eyebrow">TU ESPACIO DE GESTIÓN</p>
        <h1>{{ titulo() }}</h1>
        <p class="intro">
          Cada área, en su lugar. Elegí qué querés gestionar y continuá desde su pantalla.
        </p>
      </div>
      <a class="account-shortcut" routerLink="/perfil"
        >Mis datos <span aria-hidden="true">↗</span></a
      >
    </header>
    <ng-content select="[panel-indicadores]" />
    <div class="area-filter">
      <label for="buscar-area">Buscar área o herramienta</label>
      <input
        id="buscar-area"
        type="search"
        [value]="busqueda()"
        (input)="buscar($event)"
        placeholder="Películas, stock, reportes…"
      />
      <p role="status">{{ visibles().length }} de {{ permitidas().length }} áreas</p>
    </div>
    <div class="area-grid">
      @for (area of visibles(); track area.id) {
        <article class="area-card">
          <div class="area-heading">
            <span class="area-number" aria-hidden="true">{{ area.numero }}</span>
            <h2>{{ area.titulo }}</h2>
          </div>
          <p class="area-description">{{ area.descripcion }}</p>
          <nav [attr.aria-label]="area.titulo">
            @for (enlace of area.enlaces; track enlace.ruta) {
              <a [routerLink]="enlace.ruta"
                ><span
                  ><strong>{{ enlace.titulo }}</strong
                  ><small>{{ enlace.detalle }}</small></span
                ><span class="link-arrow" aria-hidden="true">↗</span></a
              >
            }
          </nav>
        </article>
      } @empty {
        <p>No hay áreas para esta búsqueda. Probá otra palabra.</p>
      }
    </div>
    <p class="dashboard-note">
      Cine Aurora · Las acciones administrativas respetan los permisos y conservan el historial.
    </p>
  </section>`,
})
export class PanelComponent {
  readonly titulo = input('Administración Aurora');
  readonly areas = input<readonly string[]>([]);
  protected readonly busqueda = signal('');
  protected readonly permitidas = computed(() =>
    areasAdmin.filter((area) => !this.areas().length || this.areas().includes(area.id)),
  );
  protected readonly visibles = computed(() => {
    const normalizar = (texto: string) =>
      texto
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase();
    const q = normalizar(this.busqueda().trim());
    return this.permitidas().filter((a) =>
      normalizar(
        [a.titulo, a.descripcion, ...a.enlaces.flatMap((e) => [e.titulo, e.detalle])].join(' '),
      ).includes(q),
    );
  });
  protected buscar(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
  }
}
