/**
 * Anotacion de responsabilidad: Componente Angular de Beneficios; concentra la responsabilidad de este modulo dentro de app/features/perfil. Incluye principalmente: BeneficiosComponent, s.
 */
import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Beneficios, BeneficiosService } from '../../data-access/perfiles/beneficios.service';
import { mensaje } from '../../data-access/cine/validacion';
import { PreferenciasPushComponent } from './preferencias-push.component';
@Component({
  imports: [RouterLink, CurrencyPipe, DatePipe, PreferenciasPushComponent],
  styleUrl: '../cine/cine.scss',
  templateUrl: './beneficios.component.html',
})
export class BeneficiosComponent implements OnInit {
  private readonly service = inject(BeneficiosService);
  protected readonly tipo: string = inject(ActivatedRoute).snapshot.data['tipo'] ?? 'puntos';
  protected readonly titulo: Record<string, string> = {
    puntos: 'Mis puntos',
    credito: 'Mi crédito',
    recompensas: 'Recompensas',
    canjes: 'Mis canjes',
    notificaciones: 'Notificaciones y alertas',
  };
  protected readonly datos = signal<Beneficios | null>(null);
  protected readonly cargando = signal(true);
  protected readonly ocupado = signal(false);
  protected readonly error = signal('');
  protected readonly exito = signal('');
  protected readonly bandeja = signal<'nuevas' | 'leidas'>('nuevas');
  protected readonly nuevas = computed(
    () => this.datos()?.notificaciones.filter((n) => !n.leida) ?? [],
  );
  protected readonly leidas = computed(
    () => this.datos()?.notificaciones.filter((n) => n.leida) ?? [],
  );
  protected readonly notificaciones = computed(() =>
    this.bandeja() === 'nuevas' ? this.nuevas() : this.leidas(),
  );
  private readonly injector = inject(Injector);
  private readonly bandejaTitulo = viewChild<ElementRef<HTMLElement>>('bandejaTitulo');
  protected readonly movimientos = computed(
    () => this.datos()?.movimientos.filter((m) => m.tipo === this.tipo) ?? [],
  );
  private solicitudes = new Map<string, string>();
  private enCarga = false;
  ngOnInit(): void {
    void this.cargar();
  }
  protected async cargar(): Promise<void> {
    if (this.ocupado() || this.enCarga) return;
    this.enCarga = true;
    this.cargando.set(true);
    this.error.set('');
    try {
      this.datos.set(await this.service.obtener());
    } catch (e: unknown) {
      this.error.set(mensaje(e));
      this.datos.set(null);
    } finally {
      this.enCarga = false;
      this.cargando.set(false);
    }
  }
  protected async canjear(id: string): Promise<void> {
    let solicitud = this.solicitudes.get(id);
    if (!solicitud) {
      solicitud = crypto.randomUUID();
      this.solicitudes.set(id, solicitud);
    }
    const s = solicitud;
    await this.ejecutar(async () => {
      await this.service.canjear(id, s);
      this.solicitudes.delete(id);
    }, 'Canje realizado. Encontrá tu cupón en Mis canjes.');
  }
  protected async leida(id: string): Promise<void> {
    if (this.ocupado() || this.cargando()) return;
    this.ocupado.set(true);
    this.error.set('');
    this.exito.set('');
    try {
      await this.service.leida(id);
      this.datos.update((d) =>
        d
          ? {
              ...d,
              notificaciones: d.notificaciones.map((n) =>
                n.id === id ? { ...n, leida: true } : n,
              ),
            }
          : d,
      );
      this.exito.set('Notificación marcada como leída. Encontrala en Leídas.');
      afterNextRender(() => this.bandejaTitulo()?.nativeElement.focus(), {
        injector: this.injector,
      });
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }
  protected async desuscribir(id: string): Promise<void> {
    await this.ejecutar(() => this.service.alerta(id, false), 'Alerta cancelada.');
  }
  private async ejecutar(accion: () => Promise<void>, exito: string): Promise<void> {
    if (this.ocupado() || this.enCarga || !this.datos()) return;
    this.ocupado.set(true);
    this.error.set('');
    this.exito.set('');
    try {
      await accion();
      this.exito.set(exito);
      this.datos.set(null);
      try {
        this.datos.set(await this.service.obtener());
      } catch {
        this.error.set(
          'La operación se completó, pero no pudimos actualizar los saldos. Actualizá la pantalla; no repitas la operación.',
        );
      }
    } catch (e: unknown) {
      this.error.set(mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
