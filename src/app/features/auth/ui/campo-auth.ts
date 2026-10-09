/**
 * Anotacion de responsabilidad: Archivo de soporte del sistema de Campo Auth; concentra la responsabilidad de este modulo dentro de app/features/auth/ui. Incluye principalmente: CampoAuthComponent.
 */
import { Component, computed, input, signal } from '@angular/core';
import { FieldTree, FormField } from '@angular/forms/signals';

@Component({
  selector: 'app-campo-auth', imports: [FormField], styleUrl: './campo-auth.scss',
  template: `
    <label [for]="id()">{{ etiqueta() }}</label>
    <div class="input-wrapper">
      <input [id]="id()" [type]="tipo() === 'password' && visible() ? 'text' : tipo()"
        [formField]="campo()" [autocomplete]="autocomplete()"
        [attr.aria-describedby]="id() + '-error'" [attr.aria-invalid]="invalido()"
        [class.with-toggle]="tipo() === 'password'" />
      @if (tipo() === 'password') {
        <button type="button" class="toggle" [disabled]="campo()().disabled()"
          [attr.aria-label]="(visible() ? 'Ocultar ' : 'Mostrar ') + etiqueta()" [attr.aria-pressed]="visible()"
          [attr.aria-controls]="id()" (click)="visible.set(!visible())">{{ visible() ? 'Ocultar' : 'Mostrar' }}</button>
      }
    </div>
    <div class="field-error" [id]="id() + '-error'" aria-live="polite">
      @if (invalido()) { {{ campo()().errors()[0]?.message }} }
    </div>
  `,
})
export class CampoAuthComponent {
  readonly campo = input.required<FieldTree<string>>();
  readonly id = input.required<string>({ alias: 'campoId' });
  readonly etiqueta = input.required<string>();
  readonly tipo = input<'text' | 'email' | 'password'>('text');
  readonly autocomplete = input('off');
  protected readonly visible = signal(false);
  protected readonly invalido = computed(() => this.campo()().touched() && this.campo()().invalid());
}
