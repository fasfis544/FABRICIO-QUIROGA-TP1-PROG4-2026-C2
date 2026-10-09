/**
 * Anotacion de responsabilidad: Componente Angular de Dashboard; concentra la responsabilidad de este modulo dentro de app/features/admin/dashboard. Incluye principalmente: DashboardComponent.
 */
import { Component } from '@angular/core';
import { PanelComponent } from '../../cine/panel.component';
import { ResumenAdminComponent } from './resumen-admin.component';

@Component({
  host: { 'data-component': 'dashboard' },
  imports: [PanelComponent, ResumenAdminComponent],
  styleUrl: './dashboard.component.scss',
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {}
