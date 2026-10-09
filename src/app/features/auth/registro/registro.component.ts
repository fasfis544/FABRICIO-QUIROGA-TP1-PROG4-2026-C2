/**
 * Anotacion de responsabilidad: Componente Angular de Registro; concentra la responsabilidad de este modulo dentro de app/features/auth/registro. Incluye principalmente: RegistroComponent, campos, invalido, activa.
 */
import { Component, inject, signal } from '@angular/core';
import {
  disabled,
  email,
  form,
  FormField,
  max,
  min,
  maxLength,
  minLength,
  required,
  validate,
} from '@angular/forms/signals';
import { edadEnFecha, gruposSanguineos } from '../../../shared/cine/reglas';
import { Router, RouterLink } from '@angular/router';
import { CuentaService } from '../../../core/auth/cuenta.service';
import { AuthFrameComponent } from '../ui/auth-frame';
import { CampoAuthComponent } from '../ui/campo-auth';

@Component({
  host: { 'data-component': 'registro' },
  imports: [AuthFrameComponent, CampoAuthComponent, RouterLink, FormField],
  styleUrl: './registro.component.scss',
  templateUrl: './registro.component.html',
})
export class RegistroComponent {
  private readonly cuenta = inject(CuentaService);
  private readonly router = inject(Router);
  protected readonly grupos = gruposSanguineos;
  protected readonly datos = signal({
    nombre: '',
    apellido: '',
    email: '',
    password: '',
    repetir: '',
    fecha_nacimiento: '',
    grupo_sanguineo: '',
    color_ojos: '',
    vacaciones_anuales: 0,
  });
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly creada = signal(false);
  protected readonly formulario = form(this.datos, (f) => {
    required(f.nombre, { message: 'Ingresá tu nombre.' });
    required(f.apellido, { message: 'Ingresá tu apellido.' });
    required(f.fecha_nacimiento);
    validate(f.fecha_nacimiento, ({ value }) =>
      edadEnFecha(value()) === null || value() < '1900-01-01'
        ? { kind: 'fecha', message: 'Ingresá una fecha válida, no futura.' }
        : undefined,
    );
    required(f.grupo_sanguineo);
    validate(f.grupo_sanguineo, ({ value }) =>
      gruposSanguineos.includes(value())
        ? undefined
        : { kind: 'grupo', message: 'Elegí un grupo sanguíneo.' },
    );
    required(f.color_ojos);
    maxLength(f.color_ojos, 40);
    min(f.vacaciones_anuales, 0);
    max(f.vacaciones_anuales, 365);
    validate(f.vacaciones_anuales, ({ value }) =>
      Number.isInteger(value()) ? undefined : { kind: 'entero', message: 'Usá un número entero.' },
    );
    maxLength(f.nombre, 100, { message: 'Usá hasta 100 caracteres.' });
    maxLength(f.apellido, 100, { message: 'Usá hasta 100 caracteres.' });
    required(f.email, { message: 'Ingresá tu correo.' });
    email(f.email, { message: 'Ingresá un correo válido.' });
    required(f.password, { message: 'Ingresá una contraseña.' });
    minLength(f.password, 8, { message: 'Usá al menos 8 caracteres.' });
    required(f.repetir, { message: 'Repetí la contraseña.' });
    validate(f.repetir, ({ value, valueOf }) =>
      value() === valueOf(f.password)
        ? undefined
        : { kind: 'coincidencia', message: 'Las contraseñas no coinciden.' },
    );
    disabled(f, () => this.enviando());
  });
  protected async registrar(event: Event): Promise<void> {
    event.preventDefault();
    if (this.enviando()) return;
    this.error.set(null);
    this.datos.update((d) => ({
      ...d,
      nombre: d.nombre.trim(),
      apellido: d.apellido.trim(),
      email: d.email.trim(),
    }));
    const campos = [
      this.formulario.nombre,
      this.formulario.apellido,
      this.formulario.email,
      this.formulario.password,
      this.formulario.repetir,
      this.formulario.fecha_nacimiento,
      this.formulario.grupo_sanguineo,
      this.formulario.color_ojos,
      this.formulario.vacaciones_anuales,
    ];
    campos.forEach((campo) => campo().markAsTouched());
    const invalido = campos.find((campo) => campo().invalid());
    if (invalido) {
      invalido().focusBoundControl();
      return;
    }
    this.enviando.set(true);
    try {
      const activa = await this.cuenta.registrar(this.datos());
      this.datos.update((d) => ({ ...d, password: '', repetir: '' }));
      if (activa) this.creada.set(true);
      else await this.router.navigateByUrl('/auth/confirmacion-email');
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos crear la cuenta.');
    } finally {
      this.enviando.set(false);
    }
  }
}
