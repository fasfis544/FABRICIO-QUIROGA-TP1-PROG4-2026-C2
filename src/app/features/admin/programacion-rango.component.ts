/**
 * Anotacion de responsabilidad: Componente Angular de Programacion Rango; concentra la responsabilidad de este modulo dentro de app/features/admin. Incluye principalmente: ProgramacionRangoComponent, checked, d, ids.
 */
import { Component, computed, inject, linkedSignal, OnInit, signal } from '@angular/core';
import { form, FormField, min } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { AdministracionService } from '../../data-access/cine/administracion.service';
import { PeliculasService } from '../../data-access/peliculas/peliculas.service';
import { Pelicula } from '../../data-access/peliculas/pelicula.model';
import { fechasProgramacion } from '../../data-access/cine/validacion-admin';
import { mensaje } from '../../data-access/cine/validacion';

@Component({
  imports: [FormField, RouterLink],
  styleUrl: '../cine/cine.scss',
  template: `<section class="page">
    <a routerLink="/admin/funciones">Salas y funciones</a>
    <h1>Programación por días y rango</h1>
    <p>
      Una función por día seleccionado, con hora de Argentina y sala automática. Hasta 90 días. Si
      alguna fecha no tiene sala disponible, no se guarda ninguna función del lote.
    </p>
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
    }
    @if (exito()) {
      <p role="status">{{ exito() }}</p>
    }
    @if (cargando()) {
      <p role="status">Cargando películas…</p>
    }
    <form (submit)="guardar($event)">
      <fieldset [disabled]="ocupado() || cargando()">
        <legend>Datos de la programación</legend>
        <label for="pr-pelicula">Película activa</label
        ><select id="pr-pelicula" [formField]="campos.pelicula">
          <option value="">Elegí una película</option>
          @for (p of peliculas(); track p.id) {
            <option [value]="p.id">{{ p.titulo }}</option>
          }
        </select>
        <label for="pr-desde">Desde (incluido)</label
        ><input id="pr-desde" type="date" [formField]="campos.desde" />
        <label for="pr-hasta">Hasta (incluido)</label
        ><input
          id="pr-hasta"
          type="date"
          [formField]="campos.hasta"
          [attr.aria-invalid]="intentado() && !fechas().length ? true : null"
          aria-describedby="pr-rango-error"
        />
        @if (intentado() && !fechas().length) {
          <p id="pr-rango-error" class="error">
            Revisá el rango (hasta 90 días) y elegí días que tengan fechas dentro del rango.
          </p>
        }
        <label for="pr-hora">Hora (Argentina)</label
        ><input id="pr-hora" type="time" [formField]="campos.hora" />
        <fieldset class="weekday-options">
          <legend>Días de la semana</legend>
          @for (dia of semana; track dia.id) {
            <label
              ><input
                type="checkbox"
                [checked]="datos().dias.includes(dia.id)"
                (change)="diaElegido(dia.id, $event)"
              />
              {{ dia.nombre }}</label
            >
          }
        </fieldset>
        <label for="pr-precio">Precio regular ARS</label
        ><input id="pr-precio" type="number" step="0.01" [formField]="campos.precio" />
        <label for="pr-idioma">Idioma</label
        ><select id="pr-idioma" [formField]="campos.idioma">
          <option value="castellano">Castellano</option>
          <option value="subtitulada">Subtitulada</option>
        </select>
        <label for="pr-formato">Formato</label
        ><select id="pr-formato" [formField]="campos.formato">
          <option value="2D">2D</option>
          <option value="3D">3D</option>
          <option value="4D">4D</option>
          <option value="5D">5D</option>
        </select>
        <h2>Fechas previstas: {{ fechas().length }}</h2>
        <p>La disponibilidad de salas se valida al guardar.</p>
        <ul>
          @for (fecha of fechas(); track fecha) {
            <li>{{ fecha }} · {{ datos().hora }}</li>
          }
        </ul>
        <button class="btn" [disabled]="!fechas().length">
          {{ ocupado() ? 'Programando…' : 'Crear programación' }}
        </button>
      </fieldset>
    </form>
  </section>`,
})
export class ProgramacionRangoComponent implements OnInit {
  private readonly admin = inject(AdministracionService);
  private readonly catalogo = inject(PeliculasService);
  protected readonly semana = [
    { id: 1, nombre: 'Lunes' },
    { id: 2, nombre: 'Martes' },
    { id: 3, nombre: 'Miércoles' },
    { id: 4, nombre: 'Jueves' },
    { id: 5, nombre: 'Viernes' },
    { id: 6, nombre: 'Sábado' },
    { id: 7, nombre: 'Domingo' },
  ];
  protected readonly datos = signal({
    pelicula: '',
    desde: '',
    hasta: '',
    hora: '20:00',
    dias: [] as number[],
    precio: 1000,
    idioma: 'castellano',
    formato: '2D',
  });
  protected readonly campos = form(this.datos, (f) => min(f.precio, 0.01));
  protected readonly fechas = computed(() =>
    fechasProgramacion(this.datos().desde, this.datos().hasta, this.datos().dias),
  );
  private readonly solicitud = linkedSignal(() => {
    this.datos();
    return crypto.randomUUID();
  });
  protected readonly peliculas = signal<Pelicula[]>([]);
  protected readonly ocupado = signal(false);
  protected readonly cargando = signal(true);
  protected readonly intentado = signal(false);
  protected readonly error = signal('');
  protected readonly exito = signal('');
  async ngOnInit(): Promise<void> {
    try {
      this.peliculas.set((await this.catalogo.listar(true)).filter((p) => p.activa));
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.cargando.set(false);
    }
  }
  protected diaElegido(id: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.datos.update((d) => ({
      ...d,
      dias: checked ? [...d.dias, id].sort((a, b) => a - b) : d.dias.filter((x) => x !== id),
    }));
  }
  protected async guardar(event: Event): Promise<void> {
    event.preventDefault();
    if (this.ocupado() || this.cargando()) return;
    this.intentado.set(true);
    this.error.set('');
    this.exito.set('');
    const d = this.datos();
    if (
      !d.pelicula ||
      !this.fechas().length ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.hora) ||
      !Number.isFinite(d.precio) ||
      d.precio <= 0
    ) {
      this.error.set('Completá película, rango, días, horario y precio mayor a cero.');
      return;
    }
    // La programación por rango usa hora argentina, no la zona del dispositivo.
    if (Date.parse(this.fechas()[0] + 'T' + d.hora + ':00-03:00') <= Date.now()) {
      this.error.set('Todas las funciones del lote deben tener fecha y hora futuras (hora de Argentina).');
      return;
    }
    this.ocupado.set(true);
    try {
      const ids = await this.admin.programar({ ...d, solicitud: this.solicitud() });
      this.exito.set(`${ids.length} funciones guardadas. Repetir el mismo pedido no las duplica.`);
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
