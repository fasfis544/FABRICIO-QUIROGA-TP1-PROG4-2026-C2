/**
 * Anotacion de responsabilidad: Archivo de soporte del sistema de Directivas; concentra la responsabilidad de este modulo dentro de app/shared/cine. Incluye principalmente: HighlightButacaDirective, RestrictEdadDirective, edad.
 */
import { Directive, inject, input } from '@angular/core';
import { edadEnFecha } from './reglas';
import { DiaCineService } from '../../core/dia-cine.service';
@Directive({
  selector: '[appHighlightButaca]',
  host: { '[class.selected]': 'appHighlightButaca()', '[class.butaca-highlight]': 'true' },
})
export class HighlightButacaDirective {
  readonly appHighlightButaca = input(false);
}
@Directive({
  selector: 'button[appRestrictEdad]',
  host: {
    '[disabled]': 'restringida()',
    '[attr.aria-describedby]': 'restringida() ? "restriccion-edad" : null',
  },
})
export class RestrictEdadDirective {
  private readonly dia = inject(DiaCineService);
  readonly appRestrictEdad = input('ATP');
  readonly fechaNacimiento = input<string | null | undefined>();
  readonly registrado = input(false);
  restringida(): boolean {
    if (!this.registrado()) return false;
    const edad = edadEnFecha(this.fechaNacimiento(), new Date(this.dia.hoy() + 'T12:00:00-03:00'));
    return (
      edad === null || (this.appRestrictEdad() !== 'ATP' && edad < Number(this.appRestrictEdad()))
    );
  }
}
