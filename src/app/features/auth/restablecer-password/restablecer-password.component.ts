/**
 * Anotacion de responsabilidad: Componente Angular de Restablecer Password; concentra la responsabilidad de este modulo dentro de app/features/auth/restablecer-password. Incluye principalmente: RestablecerPasswordComponent, campo.
 */
import { Component, inject, OnInit, signal } from '@angular/core';
import { disabled, form, minLength, required, validate } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { CuentaService } from '../../../core/auth/cuenta.service';
import { AuthFrameComponent } from '../ui/auth-frame';
import { CampoAuthComponent } from '../ui/campo-auth';

@Component({
  host: { 'data-component': 'restablecer-password' },
  imports: [AuthFrameComponent, CampoAuthComponent, RouterLink],
  styleUrl: './restablecer-password.component.scss',
  templateUrl: './restablecer-password.component.html',
})
export class RestablecerPasswordComponent implements OnInit {
  private readonly cuenta = inject(CuentaService);
  protected readonly datos = signal({ password: '', repetir: '' });
  protected readonly comprobando = signal(true);
  protected readonly valido = signal(false);
  protected readonly enviando = signal(false);
  protected readonly completado = signal(false);
  protected readonly sesionCerrada = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly formulario = form(this.datos, (f) => {
    required(f.password, { message: 'Ingresá una contraseña.' });
    minLength(f.password, 8, { message: 'Usá al menos 8 caracteres.' });
    required(f.repetir, { message: 'Repetí la contraseña.' });
    validate(f.repetir, ({ value, valueOf }) => value() === valueOf(f.password)
      ? undefined : { kind: 'coincidencia', message: 'Las contraseñas no coinciden.' });
    disabled(f, () => this.enviando());
  });
  async ngOnInit(): Promise<void> {
    try { this.valido.set(await this.cuenta.validarRecuperacion()); }
    catch (error: unknown) { this.error.set(error instanceof Error ? error.message : 'No pudimos validar el enlace.'); }
    finally { this.comprobando.set(false); }
  }
  protected async restablecer(event: Event): Promise<void> {
    event.preventDefault();
    if (this.enviando() || !this.valido() || this.completado()) return;
    this.error.set(null);
    this.formulario.password().markAsTouched(); this.formulario.repetir().markAsTouched();
    if (this.formulario().invalid()) {
      const campo = this.formulario.password().invalid() ? this.formulario.password : this.formulario.repetir;
      campo().focusBoundControl(); return;
    }
    this.enviando.set(true);
    try {
      this.sesionCerrada.set(await this.cuenta.restablecerPassword(this.datos().password));
      this.datos.set({ password: '', repetir: '' });
      this.completado.set(true);
    } catch (error: unknown) { this.error.set(error instanceof Error ? error.message : 'No pudimos cambiar la contraseña.'); }
    finally { this.enviando.set(false); }
  }
}
