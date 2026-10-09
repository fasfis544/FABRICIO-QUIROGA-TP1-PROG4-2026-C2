/**
 * Anotacion de responsabilidad: Componente Angular de Ofertas Inicio; concentra la responsabilidad de este modulo dentro de app/features/admin. Incluye principalmente: OfertasInicioComponent.
 */
import { Component } from '@angular/core';
import { PanelComponent } from '../cine/panel.component';
@Component({
  imports: [PanelComponent],
  template: `<app-admin-panel titulo="Candy y promociones" [areas]="['candy', 'promociones']" />`,
})
export class OfertasInicioComponent {}
