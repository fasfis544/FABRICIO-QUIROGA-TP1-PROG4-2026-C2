/**
 * Anotacion de responsabilidad: Servicio Angular de Sesion; concentra la responsabilidad de este modulo dentro de app/core/auth. Incluye principalmente: SesionService.
 */
import { computed, Service, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { Perfil } from '../../data-access/perfiles/perfil.model';

@Service()
export class SesionService {
  private readonly estado = signal<Session | null>(null);
  private readonly lista = signal(false);
  private readonly datosPerfil = signal<Perfil | null>(null);
  readonly perfil = this.datosPerfil.asReadonly();
  readonly sesion = this.estado.asReadonly();
  readonly cargada = this.lista.asReadonly();
  readonly usuario = computed(() => this.sesion()?.user ?? null);
  readonly activo = computed(() => this.perfil()?.activo === true);
  readonly autenticado = computed(() => this.usuario() !== null && this.activo() &&
    this.perfil()?.id === this.usuario()?.id);
  readonly rol = computed(() => this.autenticado() ? this.perfil()?.rol ?? null : null);
  readonly nombre = computed(() => this.perfil()?.nombre?.trim() || this.usuario()?.email?.split('@')[0] || 'Mi cuenta');
  readonly inicial = computed(() => this.nombre().charAt(0).toUpperCase());

  actualizar(sesion: Session | null, perfil: Perfil | null = null): void {
    this.estado.set(sesion);
    this.datosPerfil.set(perfil && perfil.id === sesion?.user.id ? perfil : null);
  }

  iniciarCarga(sesion: Session | null): void {
    this.lista.set(false);
    this.actualizar(sesion);
  }

  marcarCargada(): void {
    this.lista.set(true);
  }
}
