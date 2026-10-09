/**
 * Anotacion de responsabilidad: Pipes de presentacion de Pipes; concentra la responsabilidad de este modulo dentro de app/shared/cine. Incluye principalmente: DuracionPipe, PrecioArsPipe, EdadPipe.
 */
import { Pipe, PipeTransform } from '@angular/core';
import { edadEnFecha } from './reglas';
@Pipe({ name: 'duracion' })
export class DuracionPipe implements PipeTransform {
  transform(minutos: number): string {
    return `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
  }
}
@Pipe({ name: 'precioArs' })
export class PrecioArsPipe implements PipeTransform {
  transform(importe: number): string {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(importe);
  }
}
@Pipe({ name: 'edad' })
export class EdadPipe implements PipeTransform {
  transform(fecha: string | null | undefined, dia?: string): number | null {
    return edadEnFecha(fecha, dia ? new Date(dia + 'T12:00:00-03:00') : new Date());
  }
}
