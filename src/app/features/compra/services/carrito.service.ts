/**
 * Anotacion de responsabilidad: Servicio Angular de Carrito; concentra la responsabilidad de este modulo dentro de app/features/compra/services. Incluye principalmente: Carrito.
 */
import { Service, signal } from '@angular/core';
import { CandySeleccion } from '../../../data-access/cine/checkout.service';

@Service()
export class Carrito {
  readonly funcion = signal('');
  readonly butacas = signal<string[]>([]);
  readonly candy = signal<CandySeleccion[]>([]);
  seleccionar(funcion: string, butacas: string[]): void {
    if (this.funcion() !== funcion) this.candy.set([]);
    this.funcion.set(funcion);
    this.butacas.set([...butacas]);
  }
  limpiar(): void {
    this.funcion.set('');
    this.butacas.set([]);
    this.candy.set([]);
  }
}
