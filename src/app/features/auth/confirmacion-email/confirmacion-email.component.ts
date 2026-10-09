/**
 * Anotacion de responsabilidad: Componente Angular de Confirmacion Email; concentra la responsabilidad de este modulo dentro de app/features/auth/confirmacion-email. Incluye principalmente: ConfirmacionEmailComponent, timer.
 */
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { disabled, email, form, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { CuentaService } from '../../../core/auth/cuenta.service';
import { AuthFrameComponent } from '../ui/auth-frame';
import { CampoAuthComponent } from '../ui/campo-auth';

@Component({
  host: { 'data-component': 'confirmacion-email' },
  imports: [AuthFrameComponent, CampoAuthComponent, RouterLink],
  styleUrl: './confirmacion-email.component.scss',
  templateUrl: './confirmacion-email.component.html',
})
export class ConfirmacionEmailComponent implements OnInit {
  private readonly cuenta = inject(CuentaService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly comprobando = signal(true);
  protected readonly confirmado = signal(false);
  protected readonly enviando = signal(false);
  protected readonly espera = signal(false);
  protected readonly mensaje = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly datos = signal({ email: this.cuenta.correoPendiente() });
  protected readonly formulario = form(this.datos, (f) => {
    required(f.email, { message: 'Ingresá tu correo.' });
    email(f.email, { message: 'Ingresá un correo válido.' });
    disabled(f, () => this.enviando());
  });
  async ngOnInit(): Promise<void> {
    try { this.confirmado.set(await this.cuenta.confirmarCorreo()); }
    catch (error: unknown) { this.error.set(error instanceof Error ? error.message : 'No pudimos validar el enlace.'); }
    finally { this.comprobando.set(false); }
  }
  protected async reenviar(event: Event): Promise<void> {
    event.preventDefault();
    if (this.enviando() || this.espera()) return;
    this.error.set(null); this.mensaje.set(null);
    this.datos.update((d) => ({ email: d.email.trim() }));
    this.formulario.email().markAsTouched();
    if (this.formulario().invalid()) { this.formulario.email().focusBoundControl(); return; }
    this.enviando.set(true);
    try {
      await this.cuenta.reenviarConfirmacion(this.datos().email);
      this.mensaje.set('Si tu cuenta necesita confirmación, recibirás un correo. Revisá también spam.');
      this.espera.set(true);
      const timer = setTimeout(() => this.espera.set(false), 60000);
      this.destroyRef.onDestroy(() => clearTimeout(timer));
    } catch (error: unknown) { this.error.set(error instanceof Error ? error.message : 'No pudimos reenviar el correo.'); }
    finally { this.enviando.set(false); }
  }
}
