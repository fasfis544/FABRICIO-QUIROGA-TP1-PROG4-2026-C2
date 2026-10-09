/**
 * Anotacion de responsabilidad: Componente Angular de Entrada; concentra la responsabilidad de este modulo dentro de app/features/cine. Incluye principalmente: EntradaComponent, d, r, confirmacion.
 */
import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Funcion, OperacionesService } from '../../data-access/cine/operaciones.service';
import { mensaje } from '../../data-access/cine/validacion';
import { EscanerEntradaComponent } from '../../shared/entradas/escaner.component';
import { BeneficiosService } from '../../data-access/perfiles/beneficios.service';
@Component({
  imports: [ReactiveFormsModule, EscanerEntradaComponent, DatePipe],
  styleUrl: './cine.scss',
  template: `<section class="page">
    <h1>Validación de compras</h1>
    <p class="feedback">
      Validación por personal autorizado: registrá el ingreso a sala o el retiro de candy de una
      compra confirmada.
    </p>
    <p>
      La compra ya tiene su pago simulado. No se cobra ni se confirma un nuevo pago en esta pantalla.
      El mismo QR sirve para ingreso y candy, una vez por prestación.
    </p>
    <app-escaner-entrada (leido)="formulario.controls.codigo.setValue($event)" />
    <form [formGroup]="formulario" (ngSubmit)="validar()" [attr.aria-busy]="ocupado()">
      <label for="e-funcion">Función que estás operando</label
      ><select id="e-funcion" formControlName="funcion">
        <option value="">Elegí una función</option>
        @for (f of funciones(); track f.id) {
          <option [value]="f.id">
            {{ nombreSala(f.sala_id) }} · {{ f.inicio | date: 'dd/MM HH:mm' : '-0300' }} (Argentina) · {{ f.formato }} ·
            {{ f.idioma }}
          </option>
        }
      </select>
      <label for="e-tipo">Prestación</label
      ><select id="e-tipo" formControlName="tipo">
        <option value="entrada">Ingreso a sala</option>
        <option value="candy">Retiro de candy</option>
      </select>
      <label for="e-codigo">Código único de compra (UUID)</label
      ><input id="e-codigo" formControlName="codigo" autocomplete="off" />
      <p>
        Desde 30 minutos antes del inicio hasta el fin de la proyección. El ingreso consume todas
        las butacas de la compra; el candy queda independiente.
      </p>
      <button class="btn" [disabled]="ocupado() || cargando() || formulario.invalid">
        {{ ocupado() ? 'Validando…' : 'Validar y registrar prestación' }}
      </button>
      <div role="status" aria-live="polite" aria-atomic="true">
        @if (resultado()) {
          <p class="feedback"><strong>Validación completada.</strong> {{ resultado() }}</p>
        }
      </div>
      <div role="alert" aria-atomic="true">
        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
      </div>
    </form>
  </section>`,
})
export class EntradaComponent implements OnInit {
  private readonly service = inject(OperacionesService);
  private readonly beneficios = inject(BeneficiosService);
  private readonly route = inject(ActivatedRoute);
  protected readonly funciones = signal<Funcion[]>([]);
  private readonly salas = signal<{ id: string; nombre: string }[]>([]);
  protected readonly ocupado = signal(false);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly resultado = signal('');
  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    funcion: ['', Validators.required],
    tipo: [this.route.snapshot.data['candy'] ? 'candy' : 'entrada', Validators.required],
    codigo: [
      '',
      [
        Validators.required,
        Validators.pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
      ],
    ],
  });
  ngOnInit(): void {
    void this.cargar();
  }
  protected nombreSala(id: string): string {
    return this.salas().find((s) => s.id === id)?.nombre ?? 'Sala';
  }
  private async cargar(): Promise<void> {
    try {
      const [f, s] = await Promise.all([this.service.funcionesOperativas(), this.service.salas()]);
      this.funciones.set(f);
      this.salas.set(s);
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.cargando.set(false);
    }
  }
  protected async validar(): Promise<void> {
    if (this.ocupado() || this.cargando() || this.formulario.invalid) return;
    this.ocupado.set(true);
    this.error.set('');
    this.resultado.set('');
    try {
      const d = this.formulario.getRawValue();
      const r = await this.beneficios.validar(d.codigo, d.tipo, d.funcion);
      const confirmacion = d.tipo === 'entrada'
        ? 'Ingreso a sala registrado correctamente.'
        : 'Retiro de candy registrado correctamente.';
      this.resultado.set(confirmacion + ' ' + r.mensaje + (r.candy ? ' · ' + r.candy : ''));
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
