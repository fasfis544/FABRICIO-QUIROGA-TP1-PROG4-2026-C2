/**
 * Anotacion de responsabilidad: Componente Angular de Login; concentra la responsabilidad de este modulo dentro de app/features/auth/login. Incluye principalmente: LoginComponent, campo.
 */
import { Component, inject, OnInit, signal } from '@angular/core';
import { disabled, email, form, FormField, required } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { retornoSeguro } from '../../../core/auth/rol.model';
import { SesionService } from '../../../core/auth/sesion.service';
import { CuentaService } from '../../../core/auth/cuenta.service';

@Component({
  host: { 'data-component': 'login' },
  imports: [FormField, RouterLink],
  styleUrl: './login.component.scss',
  templateUrl: './login.component.html',
})
export class LoginComponent implements OnInit {
  private readonly cuenta = inject(CuentaService);
  protected async oauth(proveedor: 'google' | 'github'): Promise<void> {
    if (this.enviando()) return;
    this.enviando.set(true);
    this.error.set(null);
    try {
      await this.cuenta.oauth(proveedor);
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : 'No se pudo iniciar OAuth.');
    } finally {
      this.enviando.set(false);
    }
  }
  private readonly auth = inject(AuthService);
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly datos = signal({ email: '', password: '' });
  protected readonly enviando = signal(false);
  protected readonly mostrarPassword = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly formulario = form(this.datos, (campos) => {
    required(campos.email, { message: 'Ingresá tu correo electrónico.' });
    email(campos.email, { message: 'Ingresá un correo electrónico válido.' });
    required(campos.password, { message: 'Ingresá tu contraseña.' });
    disabled(campos, () => this.enviando());
  });

  ngOnInit(): void {
    void this.auth.esperarSesion().then(() => {
      if (this.sesion.autenticado() && !this.enviando()) {
        return this.router.navigateByUrl(
          retornoSeguro(this.route.snapshot.queryParamMap.get('returnUrl'), this.sesion.rol()),
        );
      }
      this.error.set(this.auth.errorSesion());
      return false;
    });
  }

  protected async ingresar(event: Event): Promise<void> {
    event.preventDefault();
    if (this.enviando()) return;
    this.error.set(null);
    this.datos.update((datos) => ({ ...datos, email: datos.email.trim() }));
    this.formulario.email().markAsTouched();
    this.formulario.password().markAsTouched();
    if (this.formulario().invalid()) {
      const campo = this.formulario.email().invalid()
        ? this.formulario.email
        : this.formulario.password;
      campo().focusBoundControl();
      return;
    }
    this.enviando.set(true);
    try {
      const { email, password } = this.datos();
      await this.auth.iniciarSesion(email, password);
      this.datos.update((datos) => ({ ...datos, password: '' }));
      await this.router.navigateByUrl(
        retornoSeguro(this.route.snapshot.queryParamMap.get('returnUrl'), this.sesion.rol()),
      );
    } catch (error: unknown) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos iniciar sesión.');
    } finally {
      this.enviando.set(false);
    }
  }
}
