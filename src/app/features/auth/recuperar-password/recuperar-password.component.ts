/**
 * Anotacion de responsabilidad: Componente Angular de Recuperar Password; concentra la responsabilidad de este modulo dentro de app/features/auth/recuperar-password. Incluye principalmente: RecuperarPasswordComponent.
 */
import { Component, inject, signal } from '@angular/core';
import { disabled, email, form, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { CuentaService } from '../../../core/auth/cuenta.service';
import { AuthFrameComponent } from '../ui/auth-frame';
import { CampoAuthComponent } from '../ui/campo-auth';

@Component({
  host: { 'data-component': 'recuperar-password' },
  imports: [AuthFrameComponent, CampoAuthComponent, RouterLink],
  styleUrl: './recuperar-password.component.scss',
  templateUrl: './recuperar-password.component.html',
})
export class RecuperarPasswordComponent {
  private readonly cuenta = inject(CuentaService);
  protected readonly datos = signal({ email: '' });
  protected readonly enviando = signal(false);
  protected readonly enviado = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly formulario = form(this.datos, (f) => {
    required(f.email, { message: 'Ingresá tu correo.' });
    email(f.email, { message: 'Ingresá un correo válido.' });
    disabled(f, () => this.enviando());
  });
  protected async recuperar(event: Event): Promise<void> {
    event.preventDefault();
    if (this.enviando() || this.enviado()) return;
    this.error.set(null);
    this.datos.update((d) => ({ email: d.email.trim() }));
    this.formulario.email().markAsTouched();
    if (this.formulario().invalid()) { this.formulario.email().focusBoundControl(); return; }
    this.enviando.set(true);
    try { await this.cuenta.recuperar(this.datos().email); this.enviado.set(true); }
    catch (error: unknown) { this.error.set(error instanceof Error ? error.message : 'No pudimos enviar la solicitud.'); }
    finally { this.enviando.set(false); }
  }
}
