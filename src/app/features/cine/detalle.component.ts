/**
 * Anotacion de responsabilidad: Componente Angular de Detalle; concentra la responsabilidad de este modulo dentro de app/features/cine. Incluye principalmente: DetalleComponent, revision, p, r.
 */
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PeliculasService } from '../../data-access/peliculas/peliculas.service';
import { Pelicula } from '../../data-access/peliculas/pelicula.model';
import { Funcion, OperacionesService } from '../../data-access/cine/operaciones.service';
import { mensaje } from '../../data-access/cine/validacion';
import { BeneficiosService, Resena } from '../../data-access/perfiles/beneficios.service';
import { SesionService } from '../../core/auth/sesion.service';
import { DuracionPipe, EdadPipe } from '../../shared/cine/pipes';
import { RestrictEdadDirective } from '../../shared/cine/directivas';
import { DiaCineService } from '../../core/dia-cine.service';
@Component({
  imports: [RouterLink, DatePipe, CurrencyPipe, DuracionPipe, EdadPipe, RestrictEdadDirective],
  styleUrl: './cine.scss',
  template: `<section class="page">
    <a routerLink="/peliculas">Volver a películas</a>
    <h1>{{ pelicula()?.titulo ?? 'Detalle de película' }}</h1>
    @if (cargando()) {
      <p role="status">Cargando…</p>
    }
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
      <button class="btn" (click)="cargar()">Reintentar</button>
    }
    @if (pelicula(); as p) {
      <p>{{ p.sinopsis }}</p>
      <p>{{ p.clasificacion }} · {{ p.duracion_minutos | duracion }}</p>
      <p id="restriccion-edad">
        @if (sesion.autenticado()) {
          Tu edad: {{ sesion.perfil()?.fecha_nacimiento | edad: hoy() }} años. Completá
          <a routerLink="/perfil">Mi perfil</a> si faltan datos. Se bloquean funciones incompatibles
          con tu edad.
        }
      </p>
      @if (sesion.autenticado()) {
        <button class="btn" [disabled]="alertando()" (click)="suscribir()">
          Suscribirme a disponibilidad y estreno</button
        ><a routerLink="/perfil/notificaciones">Administrar mis alertas</a>
      } @else {
        <a routerLink="/auth/login">Iniciá sesión para recibir alertas</a>
      }
      @if (exito()) {
        <p role="status">{{ exito() }}</p>
      }
      <h2>Funciones disponibles</h2>
      <div class="grid">
        @for (f of funciones(); track f.id) {
          <article class="card">
            <h3>{{ f.inicio | date: 'dd/MM/yyyy HH:mm' : '-0300' }} (Argentina)</h3>
            <p>
              Entrada normal:
              {{
                  (p.fecha_estreno > hoy() && enVenta(p) ? p.precio_preventa! : f.precio)
                  | currency: 'ARS'
              }}
            </p>
            <p>{{ f.idioma }} · {{ f.formato }}</p>
            @if (enVenta(p)) {
              <button
                class="btn"
                [appRestrictEdad]="p.clasificacion"
                [registrado]="sesion.autenticado()"
                [fechaNacimiento]="sesion.perfil()?.fecha_nacimiento"
                (click)="elegir(f.id)"
              >
                Elegir butacas
              </button>
              @if (p.fecha_estreno > hoy()) {
                <p>
                  Preventa: {{ p.precio_preventa! | currency: 'ARS' }} por entrada normal. VIP con
                  recargo.
                </p>
              }
            } @else {
              <p>Venta todavía no habilitada. Podés suscribirte a disponibilidad.</p>
            }
          </article>
        } @empty {
          <p>No hay funciones programadas.</p>
        }
      </div>
      <h2>Reseñas @if (resenas().length) { · promedio {{ promedio() }} / 5 }</h2>
      @if (errorResenas()) {
        <p role="alert">{{ errorResenas() }}</p>
      }
      @for (r of resenas(); track r.id) {
        <article class="card">
          <h3>{{ r.nombre }} · {{ r.calificacion }} / 5</h3>
          <p>{{ r.texto }}</p>
          <p>{{ r.creada | date: 'dd/MM/yyyy' : '-0300' }}</p>
        </article>
      } @empty {
        @if (!errorResenas() && !cargando()) { <p>Todavía no hay reseñas.</p> }
      }
    }
  </section>`,
})
export class DetalleComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  protected readonly hoy = inject(DiaCineService).hoy;
  private revisionCarga = 0;
  protected enVenta(p: Pelicula): boolean {
    return (
      p.fecha_estreno <= this.hoy() ||
      (p.precio_preventa != null &&
        Date.parse(p.fecha_estreno + 'T00:00:00Z') - Date.parse(this.hoy() + 'T00:00:00Z') <=
          7 * 86400000)
    );
  }
  protected elegir(id: string): void {
    void this.router.navigate(['/compra', id, 'butacas']);
  }
  private readonly peliculas = inject(PeliculasService);
  private readonly operaciones = inject(OperacionesService);
  private readonly beneficios = inject(BeneficiosService);
  protected readonly sesion = inject(SesionService);
  protected readonly resenas = signal<Resena[]>([]);
  protected readonly promedio = signal(0);
  protected readonly errorResenas = signal('');
  protected readonly alertando = signal(false);
  protected readonly exito = signal('');
  protected async suscribir(): Promise<void> {
    if (this.alertando()) return;
    this.alertando.set(true);
    this.error.set('');
    try {
      await this.beneficios.alerta(this.id, true);
      this.exito.set('Alerta activada. Las novedades aparecerán en tus notificaciones.');
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.alertando.set(false);
    }
  }
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  protected readonly pelicula = signal<Pelicula | null>(null);
  protected readonly funciones = signal<Funcion[]>([]);
  protected readonly error = signal('');
  protected readonly cargando = signal(true);
  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      this.revisionCarga++;
    });
    void this.cargar();
    this.destroyRef.onDestroy(this.operaciones.observar('cartelera', () => void this.cargar()));
  }
  protected async cargar(): Promise<void> {
    const revision = ++this.revisionCarga;
    this.error.set('');
    this.errorResenas.set('');
    this.pelicula.set(null);
    this.funciones.set([]);
    this.resenas.set([]);
    this.promedio.set(0);
    this.cargando.set(true);
    try {
      const [ps, fs] = await Promise.all([
        this.peliculas.listar(),
        this.operaciones.funciones(this.id),
      ]);
      if (revision !== this.revisionCarga) return;
      const p = ps.find((p) => p.id === this.id);
      if (!p) throw new Error('Película no disponible.');
      this.pelicula.set(p);
      this.funciones.set(fs);
      try {
        const r = await this.beneficios.resenas(this.id);
        if (revision !== this.revisionCarga) return;
        this.resenas.set(r.resenas);
        this.promedio.set(r.promedio);
      } catch (e: unknown) {
        if (revision !== this.revisionCarga) return;
        this.errorResenas.set(mensaje(e));
      }
    } catch (e: unknown) {
      if (revision !== this.revisionCarga) return;
      this.error.set(mensaje(e));
    } finally {
      if (revision === this.revisionCarga) this.cargando.set(false);
    }
  }
}
