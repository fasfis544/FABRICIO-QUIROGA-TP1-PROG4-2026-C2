/**
 * Anotacion de responsabilidad: Componente Angular de Auditoria; concentra la responsabilidad de este modulo dentro de app/features/admin. Incluye principalmente: AuditoriaComponent, d, errorFechas, r.
 */
import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { lista, objeto, texto, mensaje } from '../../data-access/cine/validacion';
import { errorRango } from '../../data-access/cine/validacion-admin';
import { instanteArgentina } from '../../shared/cine/fecha-argentina';
@Component({
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  styleUrl: '../cine/cine.scss',
  template: `<section class="page">
    <a routerLink="/admin">Panel</a>
    <h1>Auditoría</h1>
    <p>Registro del backend: quién, qué y cuándo. El visor no muestra tokens, correos ni PDF.</p>
    <form [formGroup]="formulario" (ngSubmit)="consultar(0)">
      <label for="audit-desde">Desde (Argentina)</label
      ><input id="audit-desde" type="datetime-local" formControlName="desde" /><label
        for="audit-hasta"
        >Hasta, excluyente (Argentina)</label
      ><input
        id="audit-hasta"
        type="datetime-local"
        formControlName="hasta"
        [attr.aria-invalid]="rangoError() ? true : null"
        aria-describedby="audit-rango-error"
      />
      <p id="audit-rango-error" class="error" aria-live="polite">{{ rangoError() }}</p>
      <button class="btn" [disabled]="ocupado() || formulario.invalid">Consultar</button>
    </form>
    @if (error()) {
      <p role="alert">{{ error() }}</p>
    }
    @if (ocupado()) {
      <p role="status">Consultando registros…</p>
    }
    @for (r of registros(); track r.id) {
      <article class="card">
        <h2>{{ r.tabla }} · {{ r.operacion }}</h2>
        <p>{{ r.creada | date: 'dd/MM/yyyy HH:mm:ss' : '-0300' }} (Argentina)</p>
        <p>Usuario: {{ r.usuario || 'Operación sin sesión de usuario' }}</p>
      </article>
    }
    @if (consultado() && !registros().length) {
      <p>No hay registros en este período.</p>
    }
    <button
      class="btn"
      [disabled]="ocupado() || offset() === 0"
      (click)="consultar(offset() - 100)"
    >
      Anterior</button
    ><button
      class="btn"
      [disabled]="ocupado() || registros().length < 100"
      (click)="consultar(offset() + 100)"
    >
      Siguiente
    </button>
  </section>`,
})
export class AuditoriaComponent {
  private readonly client = inject(SupabaseService).getClient();
  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    desde: ['', Validators.required],
    hasta: ['', Validators.required],
  });
  protected readonly registros = signal<
    { id: string; tabla: string; operacion: string; usuario: string | null; creada: string }[]
  >([]);
  protected readonly ocupado = signal(false);
  protected readonly consultado = signal(false);
  protected readonly error = signal('');
  protected readonly offset = signal(0);
  protected readonly rangoError = signal('');
  protected async consultar(offset: number): Promise<void> {
    if (this.ocupado() || this.formulario.invalid) return;
    const d = this.formulario.getRawValue();
    const errorFechas = errorRango(d.desde, d.hasta);
    if (errorFechas) {
      this.rangoError.set(errorFechas);
      return;
    }
    this.rangoError.set('');
    this.ocupado.set(true);
    this.error.set('');
    try {
      const { data, error } = await this.client.rpc('cine_consultar_auditoria', {
        p_desde: instanteArgentina(d.desde),
        p_hasta: instanteArgentina(d.hasta),
        p_offset: offset,
      });
      if (error) throw new Error(error.message);
      this.registros.set(
        lista(data).map((v) => {
          const r = objeto(v);
          return {
            id: String(r['id']),
            tabla: texto(r, 'tabla'),
            operacion: texto(r, 'operacion'),
            usuario: typeof r['usuario_id'] === 'string' ? r['usuario_id'] : null,
            creada: texto(r, 'creada'),
          };
        }),
      );
      this.offset.set(offset);
      this.consultado.set(true);
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
