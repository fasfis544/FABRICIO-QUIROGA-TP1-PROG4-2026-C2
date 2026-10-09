/**
 * Anotacion de responsabilidad: Componente Angular de Usuarios; concentra la responsabilidad de este modulo dentro de app/features/admin. Incluye principalmente: UsuariosComponent, u.
 */
import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  Injector,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { form, FormField, maxLength } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { AdministracionService, UsuarioAdmin } from '../../data-access/cine/administracion.service';
import { Rol } from '../../core/auth/rol.model';
import { SesionService } from '../../core/auth/sesion.service';
import { mensaje } from '../../data-access/cine/validacion';

@Component({
  imports: [FormField, RouterLink],
  styleUrl: '../cine/cine.scss',
  template: `<section class="page">
    <a routerLink="/admin">Panel</a>
    <h1>Usuarios y roles</h1>
    <p>
      Solo administra accesos de cuentas existentes. No elimina usuarios ni solicita contraseñas. No
      podés quitarte tu propio acceso administrativo.
    </p>
    <form (submit)="buscar($event)">
      <label for="u-busqueda">Buscar nombre o correo</label
      ><input id="u-busqueda" [formField]="buscador.busqueda" /><button
        class="btn"
        [disabled]="ocupado()"
      >
        Buscar
      </button>
    </form>
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
    }
    @if (exito()) {
      <p role="status">{{ exito() }}</p>
    }
    @if (ocupado()) {
      <p role="status">Procesando usuarios…</p>
    }
    <div class="grid">
      @for (u of usuarios(); track u.id) {
        <article class="card">
          <h2>{{ u.nombre }} {{ u.apellido }}</h2>
          <p>{{ u.email }}</p>
          <p>{{ u.rol }} · {{ u.activo ? 'Activo' : 'Inactivo' }}</p>
          <button class="btn" [disabled]="ocupado()" (click)="editar(u)">
            Editar acceso de {{ u.email || u.nombre }}
          </button>
        </article>
      } @empty {
        <p>No hay usuarios para esta búsqueda.</p>
      }
    </div>
    <nav aria-label="Páginas de usuarios">
      <button class="btn" [disabled]="ocupado() || offset() === 0" (click)="cargar(offset() - 50)">
        Anterior</button
      ><button
        class="btn"
        [disabled]="ocupado() || usuarios().length < 50"
        (click)="cargar(offset() + 50)"
      >
        Siguiente
      </button>
    </nav>
    @if (seleccionado(); as u) {
      <h2>Editar acceso de {{ u.email || u.nombre }}</h2>
      <form (submit)="guardar($event)">
        <fieldset [disabled]="ocupado() || propio(u.id)">
          <legend>Rol y estado</legend>
          <label for="u-rol">Rol</label
          ><select #rolControl id="u-rol" [formField]="campos.rol">
            <option value="cliente">Cliente</option>
            <option value="empleado">Empleado</option>
            <option value="administrador">Administrador</option>
          </select>
          <label><input type="checkbox" [formField]="campos.activo" /> Cuenta activa</label
          ><label
            ><input type="checkbox" [formField]="campos.confirmado" /> Confirmo este cambio de
            acceso</label
          ><button class="btn" [disabled]="!datos().confirmado">Guardar acceso</button>
        </fieldset>
        @if (propio(u.id)) {
          <p>Tu cuenta administrativa está protegida: modificá otras cuentas.</p>
        }
      </form>
    }
  </section>`,
})
export class UsuariosComponent implements OnInit {
  private readonly admin = inject(AdministracionService);
  private readonly sesion = inject(SesionService);
  private readonly injector = inject(Injector);
  private readonly rolControl = viewChild<ElementRef<HTMLSelectElement>>('rolControl');
  protected readonly busqueda = signal({ busqueda: '' });
  protected readonly buscador = form(this.busqueda, (f) => maxLength(f.busqueda, 100));
  private consulta = '';
  protected readonly datos = signal({ rol: 'cliente' as Rol, activo: true, confirmado: false });
  protected readonly campos = form(this.datos);
  protected readonly seleccionado = signal<UsuarioAdmin | null>(null);
  protected readonly usuarios = signal<UsuarioAdmin[]>([]);
  protected readonly offset = signal(0);
  protected readonly ocupado = signal(false);
  protected readonly error = signal('');
  protected readonly exito = signal('');
  ngOnInit(): void {
    void this.cargar(0);
  }
  protected propio(id: string): boolean {
    return this.sesion.usuario()?.id === id;
  }
  protected editar(u: UsuarioAdmin): void {
    this.seleccionado.set(u);
    this.datos.set({ rol: u.rol, activo: u.activo, confirmado: false });
    this.exito.set('');
    afterNextRender(() => this.rolControl()?.nativeElement.focus(), { injector: this.injector });
  }
  protected async buscar(event: Event): Promise<void> {
    event.preventDefault();
    if (this.ocupado()) return;
    this.consulta = this.busqueda().busqueda.trim();
    this.seleccionado.set(null);
    await this.cargar(0);
  }
  protected async cargar(offset: number): Promise<void> {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    this.error.set('');
    try {
      this.usuarios.set(await this.admin.usuarios(this.consulta, offset));
      this.offset.set(offset);
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }
  protected async guardar(event: Event): Promise<void> {
    event.preventDefault();
    const u = this.seleccionado(),
      d = this.datos();
    if (this.ocupado() || !u) return;
    if (this.propio(u.id) || !d.confirmado) {
      this.error.set('Confirmá el cambio sobre otra cuenta.');
      return;
    }
    this.ocupado.set(true);
    this.error.set('');
    this.exito.set('');
    try {
      await this.admin.guardarUsuario(u.id, d.rol, d.activo);
      this.seleccionado.set(null);
      this.usuarios.set(await this.admin.usuarios(this.consulta, this.offset()));
      this.exito.set('Acceso actualizado y auditado.');
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
