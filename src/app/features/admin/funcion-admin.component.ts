/**
 * Anotacion de responsabilidad: Componente Angular de Funcion Admin; concentra la responsabilidad de este modulo dentro de app/features/admin. Incluye principalmente: FuncionAdminComponent, f, d, error.
 */
import { Component, input, linkedSignal, inject, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { form, FormField, min, max, maxLength } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { Funcion, OperacionesService } from '../../data-access/cine/operaciones.service';
import { AdministracionService } from '../../data-access/cine/administracion.service';
import { mensaje } from '../../data-access/cine/validacion';
import { PrecioArsPipe } from '../../shared/cine/pipes';
import { errorInicioFuncion } from '../../data-access/cine/validacion-admin';
import { fechaHoraArgentina, instanteArgentina } from '../../shared/cine/fecha-argentina';

@Component({
  selector: 'app-funcion-admin',
  imports: [DatePipe, FormField, RouterLink, PrecioArsPipe],
  styleUrl: '../cine/cine.scss',
  template: `<article class="card">
    <h3>{{ titulo() }}</h3>
    <p>{{ sala() }} · {{ funcion().inicio | date: 'dd/MM/yyyy HH:mm' : '-0300' }} (Argentina)</p>
    <p role="status" [class.error]="!disponible()">{{ estado() }}</p>
    <p>
      {{ funcion().precio | precioArs }}
    </p>
    <p class="hint">
      {{ funcion().formato ?? '2D' }} · {{ funcion().idioma ?? 'castellano' }} · Recargo VIP
      {{ funcion().vip_porcentaje ?? 25 }}%
    </p>
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
    }
    @if (exito()) {
      <p role="status">{{ exito() }}</p>
    }
    @if (editarPrecios()) {
      <fieldset [disabled]="ocupado()">
        <legend>Precios y presentación</legend>
        <p class="hint">
          No cambies idioma o formato si hay compras o reservas vigentes: los comprobantes emitidos
          deben conservar su modalidad. Los cambios de precio se aplican a compras nuevas.
        </p>
        <label [for]="'precio-' + funcion().id">Precio regular normal (ARS)</label
        ><input
          [id]="'precio-' + funcion().id"
          type="number"
          step="0.01"
          [formField]="campos.precio"
        />
        <label [for]="'idioma-' + funcion().id">Idioma</label
        ><select [id]="'idioma-' + funcion().id" [formField]="campos.idioma">
          <option value="castellano">Castellano</option>
          <option value="subtitulada">Subtitulada</option>
        </select>
        <label [for]="'formato-' + funcion().id">Formato</label
        ><select [id]="'formato-' + funcion().id" [formField]="campos.formato">
          <option value="2D">2D</option>
          <option value="3D">3D</option>
          <option value="4D">4D</option>
          <option value="5D">5D</option>
        </select>
        <label [for]="'vip-' + funcion().id">Recargo VIP (%)</label
        ><input [id]="'vip-' + funcion().id" type="number" step="0.01" [formField]="campos.vip" />
        <button class="btn" type="button" (click)="guardar()">
          Guardar precio, idioma, formato y VIP
        </button>
      </fieldset>
    }
    @if (disponible()) {
      <a class="text-link" [routerLink]="['/compra', funcion().id, 'butacas']"
        >Ver disponibilidad ↗</a
      >
    }
    @if (gestionarHorario()) {
      <fieldset [disabled]="ocupado()">
        <legend>Reprogramar o cancelar</legend>
        <p>
          Reprogramar exige que no haya compras ni reservas vigentes. Cancelar convierte compras
          registradas sin uso en crédito y repone stock. Compras invitadas o prestaciones usadas
          bloquean la operación.
        </p>
        <label [for]="'inicio-' + funcion().id">Nuevo inicio (Argentina)</label
        ><input [id]="'inicio-' + funcion().id" type="datetime-local" [formField]="campos.inicio" />
        <label [for]="'motivo-' + funcion().id">Motivo (5–500 caracteres)</label
        ><input [id]="'motivo-' + funcion().id" [formField]="campos.motivo" />
        <label
          ><input type="checkbox" [formField]="campos.confirmado" /> Confirmo el cambio de esta
          función y sus consecuencias</label
        >
        <button class="btn" type="button" [disabled]="!datos().confirmado" (click)="reprogramar()">
          Reprogramar función
        </button>
        <button class="btn" type="button" [disabled]="!datos().confirmado" (click)="cancelar()">
          Cancelar función
        </button>
      </fieldset>
    }
  </article>`,
})
export class FuncionAdminComponent {
  readonly funcion = input.required<Funcion>();
  readonly titulo = input.required<string>();
  readonly sala = input.required<string>();
  readonly estado = input('Función operativa');
  readonly disponible = input(true);
  readonly editarPrecios = input(true);
  readonly gestionarHorario = input(true);
  readonly guardado = output<void>();
  private readonly operaciones = inject(OperacionesService);
  private readonly admin = inject(AdministracionService);
  protected readonly ocupado = signal(false);
  protected readonly error = signal('');
  protected readonly exito = signal('');
  protected readonly datos = linkedSignal(() => {
    const f = this.funcion();
    return {
      precio: f.precio,
      idioma: f.idioma ?? 'castellano',
      formato: f.formato ?? '2D',
      vip: f.vip_porcentaje ?? 25,
      inicio: fechaHoraArgentina(f.inicio),
      motivo: '',
      confirmado: false,
    };
  });
  protected readonly campos = form(this.datos, (f) => {
    min(f.precio, 0.01);
    min(f.vip, 0.01);
    max(f.vip, 500);
    maxLength(f.motivo, 500);
  });
  protected async guardar(): Promise<void> {
    const d = this.datos();
    if (
      !Number.isFinite(d.precio) ||
      d.precio <= 0 ||
      !Number.isFinite(d.vip) ||
      d.vip <= 0 ||
      d.vip > 500 ||
      !['2D', '3D', '4D', '5D'].includes(d.formato) ||
      !['castellano', 'subtitulada'].includes(d.idioma)
    ) {
      this.error.set('Revisá precio, idioma, formato y recargo VIP (mayor a 0 y hasta 500%).');
      return;
    }
    await this.ejecutar(() =>
      this.operaciones.editarFuncion(this.funcion().id, d.precio, d.idioma, d.formato, d.vip),
    );
  }
  protected async reprogramar(): Promise<void> {
    const d = this.datos();
    const error = errorInicioFuncion(d.inicio);
    if (error) {
      this.error.set(error);
      return;
    }
    if (this.confirmar())
      await this.ejecutar(() =>
        this.admin.reprogramarFuncion(
          this.funcion().id,
          instanteArgentina(d.inicio),
          d.motivo.trim(),
        ),
      );
  }
  protected async cancelar(): Promise<void> {
    if (this.confirmar())
      await this.ejecutar(() =>
        this.admin.cancelarFuncion(this.funcion().id, this.datos().motivo.trim()),
      );
  }
  private confirmar(): boolean {
    const d = this.datos();
    if (!d.confirmado || d.motivo.trim().length < 5 || d.motivo.trim().length > 500) {
      this.error.set('Indicá un motivo de 5–500 caracteres y confirmá la operación.');
      return false;
    }
    return true;
  }
  private async ejecutar(accion: () => Promise<void>): Promise<void> {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    this.error.set('');
    this.exito.set('');
    try {
      await accion();
      this.datos.update((d) => ({ ...d, confirmado: false }));
      this.exito.set('Cambio guardado.');
      this.guardado.emit();
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
