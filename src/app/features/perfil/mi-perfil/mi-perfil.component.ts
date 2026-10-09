/**
 * Anotacion de responsabilidad: Componente Angular de Mi Perfil; concentra la responsabilidad de este modulo dentro de app/features/perfil/mi-perfil. Incluye principalmente: MiPerfilComponent, p, d, control.
 */
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { SesionService } from '../../../core/auth/sesion.service';
import { ClienteService } from '../../../data-access/perfiles/cliente.service';
import { mensaje } from '../../../data-access/cine/validacion';
import { edadEnFecha, gruposSanguineos } from '../../../shared/cine/reglas';
import { EdadPipe } from '../../../shared/cine/pipes';
import { DiaCineService } from '../../../core/dia-cine.service';

@Component({
  host: { 'data-component': 'mi-perfil' },
  imports: [ReactiveFormsModule, RouterLink, EdadPipe],
  styleUrls: ['../../cine/cine.scss', './mi-perfil.component.scss'],
  templateUrl: './mi-perfil.component.html',
})
export class MiPerfilComponent implements OnInit {
  protected readonly grupos = gruposSanguineos;
  private readonly auth = inject(AuthService);
  protected readonly sesion = inject(SesionService);
  protected readonly rolVisible = computed(
    () =>
      ({ administrador: 'Administrador', empleado: 'Empleado', cliente: 'Cliente' })[
        this.sesion.rol() ?? 'cliente'
      ],
  );
  protected readonly hoy = inject(DiaCineService).hoy;
  private readonly service = inject(ClienteService);
  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    nombre: ['', [Validators.required, Validators.maxLength(100)]],
    apellido: ['', [Validators.required, Validators.maxLength(100)]],
    fecha_nacimiento: [
      '',
      [
        Validators.required,
        (c) => (edadEnFecha(c.value) === null || c.value < '1900-01-01' ? { fecha: true } : null),
      ],
    ],
    grupo_sanguineo: [
      '',
      [Validators.required, (c) => (gruposSanguineos.includes(c.value) ? null : { grupo: true })],
    ],
    color_ojos: ['', [Validators.required, Validators.maxLength(40)]],
    vacaciones_anuales: [
      0,
      [
        Validators.required,
        Validators.min(0),
        Validators.max(365),
        (c) => (Number.isInteger(c.value) ? null : { entero: true }),
      ],
    ],
  });
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly disponible = signal(false);
  protected readonly error = signal('');
  protected readonly exito = signal('');
  ngOnInit(): void {
    void this.cargar();
  }
  protected async cargar(): Promise<void> {
    if (this.guardando()) return;
    this.cargando.set(true);
    this.disponible.set(false);
    this.formulario.disable();
    this.error.set('');
    this.exito.set('');
    try {
      await this.auth.refrescarPerfil();
      const p = this.sesion.perfil();
      if (!p || !this.sesion.autenticado()) throw new Error('No pudimos cargar tu perfil.');
      this.formulario.setValue({
        nombre: p.nombre ?? '',
        apellido: p.apellido ?? '',
        fecha_nacimiento: p.fecha_nacimiento ?? '',
        grupo_sanguineo: p.grupo_sanguineo ?? '',
        color_ojos: p.color_ojos ?? '',
        vacaciones_anuales: p.vacaciones_anuales ?? 0,
      });
      this.formulario.markAsPristine();
      this.formulario.markAsUntouched();
      this.disponible.set(true);
      this.formulario.enable();
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.cargando.set(false);
    }
  }
  protected async guardar(): Promise<void> {
    if (this.guardando() || this.cargando() || !this.disponible() || !this.sesion.autenticado())
      return;
    this.error.set('');
    this.exito.set('');
    const d = this.formulario.getRawValue();
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid || !d.nombre.trim() || !d.apellido.trim() || !d.color_ojos.trim()) {
      this.error.set(
        'Revisá todos los datos: fecha no futura, grupo sanguíneo, ojos y vacaciones enteras entre 0 y 365.',
      );
      return;
    }
    this.guardando.set(true);
    this.formulario.disable();
    try {
      await this.service.completar({
        ...d,
        nombre: d.nombre.trim(),
        apellido: d.apellido.trim(),
        color_ojos: d.color_ojos.trim(),
      });
      await this.auth.refrescarPerfil();
      this.formulario.markAsPristine();
      this.exito.set('Datos guardados.');
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.formulario.enable();
      this.guardando.set(false);
    }
  }
  protected errorCampo(campo: keyof typeof this.formulario.controls): string {
    const control = this.formulario.controls[campo];
    if (!control.touched) return '';
    if (control.invalid || (typeof control.value === 'string' && !control.value.trim())) {
      switch (campo) {
        case 'fecha_nacimiento':
          return 'Ingresá una fecha válida, desde 1900 y no futura.';
        case 'grupo_sanguineo':
          return 'Elegí uno de los grupos de la lista.';
        case 'vacaciones_anuales':
          return 'Ingresá un número entero entre 0 y 365.';
        case 'color_ojos':
          return 'Completá el color de ojos (hasta 40 caracteres).';
        default:
          return 'Completá este dato (hasta 100 caracteres).';
      }
    }
    return '';
  }
}
