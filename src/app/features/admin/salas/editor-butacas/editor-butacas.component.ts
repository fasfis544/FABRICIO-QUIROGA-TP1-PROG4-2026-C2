/**
 * Anotacion de responsabilidad: Componente Angular de Editor Butacas; concentra la responsabilidad de este modulo dentro de app/features/admin/salas/editor-butacas. Incluye principalmente: EditorButacasComponent, bs, p, codigos.
 */
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { form, FormField, maxLength, minLength, required, disabled } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import {
  OperacionesService,
  PlanoAdministracion,
  Sala,
} from '../../../../data-access/cine/operaciones.service';
import { mensaje } from '../../../../data-access/cine/validacion';

@Component({
  host: { 'data-component': 'editor-butacas' },
  imports: [RouterLink, FormField],
  styleUrl: './editor-butacas.component.scss',
  templateUrl: './editor-butacas.component.html',
})
export class EditorButacasComponent implements OnInit {
  private readonly service = inject(OperacionesService);
  protected readonly salas = signal<Sala[]>([]);
  protected readonly plano = signal<PlanoAdministracion | null>(null);
  protected readonly salaId = signal('');
  protected readonly seleccion = signal<string[]>([]);
  protected readonly datos = signal({ motivo: '' });
  protected readonly ocupado = signal(false);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly exito = signal('');
  protected readonly formulario = form(this.datos, (f) => {
    required(f.motivo);
    minLength(f.motivo, 5);
    maxLength(f.motivo, 500);
    disabled(f, () => this.ocupado());
  });
  protected readonly bloqueadas = computed(
    () => this.plano()?.butacas.filter((b) => b.bloqueada).length ?? 0,
  );
  protected readonly hayProtegidas = computed(
    () =>
      this.plano()?.butacas.some((b) => b.protegida && this.seleccion().includes(b.codigo)) ??
      false,
  );
  protected readonly puedeGuardar = computed(
    () =>
      !!this.plano()?.sala.distribucion_documento &&
      this.seleccion().length > 0 &&
      this.datos().motivo.trim().length >= 5 &&
      this.datos().motivo.trim().length <= 500 &&
      !this.cargando() &&
      !this.ocupado(),
  );
  protected readonly filas = computed(() => {
    const bs = this.plano()?.butacas ?? [];
    return [...new Set(bs.map((b) => b.fila))].map((nombre) => ({
      nombre,
      bloques: [...new Set(bs.filter((b) => b.fila === nombre).map((b) => b.bloque))].map(
        (bloque) => bs.filter((b) => b.fila === nombre && b.bloque === bloque),
      ),
    }));
  });
  ngOnInit(): void {
    void this.iniciar();
  }
  private async iniciar(): Promise<void> {
    try {
      this.salas.set(await this.service.salas());
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.cargando.set(false);
    }
  }
  protected async elegirSala(event: Event): Promise<void> {
    if (this.ocupado() || this.cargando()) return;
    this.salaId.set((event.target as HTMLSelectElement).value);
    this.seleccion.set([]);
    this.datos.set({ motivo: '' });
    this.exito.set('');
    await this.cargarPlano();
  }
  protected async eliminarSala(): Promise<void> {
    const sala = this.plano()?.sala;
    if (!sala || this.ocupado() || this.cargando()) return;
    if (
      !confirm(
        `¿Eliminar definitivamente la sala "${sala.nombre}"? Esta acción solo se permite si no tiene funciones ni historial asociado.`,
      )
    )
      return;
    this.ocupado.set(true);
    this.error.set('');
    this.exito.set('');
    try {
      await this.service.eliminarSalaDefinitivamente(sala.id);
      this.salas.update((salas) => salas.filter((item) => item.id !== sala.id));
      this.salaId.set('');
      this.plano.set(null);
      this.seleccion.set([]);
      this.exito.set(`La sala "${sala.nombre}" fue eliminada definitivamente.`);
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }
  protected async cargarPlano(): Promise<void> {
    if (this.cargando()) return;
    this.plano.set(null);
    this.error.set('');
    if (!this.salaId()) return;
    this.cargando.set(true);
    try {
      const p = await this.service.planoAdministracion(this.salaId());
      this.plano.set(p);
      this.seleccion.update((xs) => xs.filter((x) => p.butacas.some((b) => b.codigo === x)));
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.cargando.set(false);
    }
  }
  protected elegir(codigo: string): void {
    if (this.ocupado() || this.cargando() || !this.plano()?.sala.distribucion_documento) return;
    this.seleccion.update((xs) =>
      xs.includes(codigo) ? xs.filter((x) => x !== codigo) : [...xs, codigo],
    );
    this.exito.set('');
  }
  protected async guardar(event: Event, bloqueada: boolean): Promise<void> {
    event.preventDefault();
    if (!this.puedeGuardar() || (bloqueada && this.hayProtegidas())) return;
    this.ocupado.set(true);
    this.error.set('');
    this.exito.set('');
    const codigos = this.seleccion();
    try {
      await this.service.mantenerButacas(this.salaId(), codigos, bloqueada, this.datos().motivo);
      this.seleccion.set([]);
      this.exito.set(
        `${codigos.length} butaca(s) ${bloqueada ? 'bloqueadas' : 'restauradas'}. Cambio registrado en auditoría.`,
      );
      await this.cargarPlano();
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
