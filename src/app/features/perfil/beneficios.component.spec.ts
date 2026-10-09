/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Beneficios.Component; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { WebPushService } from '../../core/notificaciones/web-push.service';
import { BeneficiosComponent } from './beneficios.component';
import {
  Beneficios,
  BeneficiosService,
  enlaceNotificacion,
} from '../../data-access/perfiles/beneficios.service';
describe('Bandeja separada y enlaces seguros', () => {
  const pelicula = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const datos: Beneficios = {
    puntos: 0,
    puntos_disponibles: 0,
    credito: 0,
    credito_disponible: 0,
    movimientos: [],
    recompensas: [],
    canjes: [],
    alertas: [],
    notificaciones: [
      {
        id: 'n',
        mensaje: 'Venta habilitada',
        creada: '2030-01-01T02:00:00Z',
        leida: false,
        ...enlaceNotificacion('venta:' + pelicula, 'Venta habilitada'),
      },
      {
        id: 'l',
        mensaje: 'Canje listo',
        creada: '2030-01-01T02:00:00Z',
        leida: true,
        ...enlaceNotificacion(null, 'Canje listo'),
      },
    ],
  };
  async function crear() {
    const leida = vi.fn().mockResolvedValue(undefined),
      obtener = vi.fn().mockResolvedValue(datos);
    const canjear = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      imports: [BeneficiosComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: { tipo: 'notificaciones' } } } },
        { provide: BeneficiosService, useValue: { obtener, leida, canjear } },
        {
          provide: WebPushService,
          useValue: {
            disponible: false,
            ocupado: signal(false),
            configurada: signal(false),
            activa: signal(false),
            permiso: signal('default'),
            error: signal(''),
            exito: signal(''),
            actualizar: vi.fn(),
          },
        },
      ],
    });
    const f = TestBed.createComponent(BeneficiosComponent);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    return { f, leida, obtener, canjear, el: f.nativeElement as HTMLElement };
  }
  it('muestra nuevas primero, contador y ruta de la película, con fecha Argentina', async () => {
    const { f, el } = await crear();
    expect(el.querySelectorAll('.notification-card')).toHaveLength(1);
    expect(el.textContent).toContain('Nuevas (1)');
    expect(el.querySelector(`a[href="/peliculas/${pelicula}"]`)).not.toBeNull();
    expect(el.textContent).toContain('31/12/2029 23:00');
    f.componentInstance['bandeja'].set('leidas');
    f.detectChanges();
    expect(el.querySelector('.notification-card')?.textContent).toContain('Canje listo');
  });
  it('marca sin eliminar, mueve a Leídas y no llama a la lectura que materializa alertas', async () => {
    const { f, leida, obtener } = await crear();
    await f.componentInstance['leida']('n');
    f.detectChanges();
    await f.whenStable();
    expect(leida).toHaveBeenCalledExactlyOnceWith('n');
    expect(obtener).toHaveBeenCalledOnce();
    expect(f.componentInstance['nuevas']()).toHaveLength(0);
    expect(f.componentInstance['leidas']()).toHaveLength(2);
    expect(f.componentInstance['datos']()?.notificaciones).toHaveLength(2);
  });
  it('un rechazo conserva la notificación nueva y permite reintentar', async () => {
    const { f, leida, el } = await crear();
    leida.mockRejectedValueOnce(new Error('Sin conexión'));
    await f.componentInstance['leida']('n');
    f.detectChanges();
    expect(f.componentInstance['nuevas']()).toHaveLength(1);
    expect(el.textContent).toContain('Sin conexión');
    await f.componentInstance['leida']('n');
    expect(leida).toHaveBeenCalledTimes(2);
  });
  it('no transforma texto ni claves arbitrarias en enlaces externos o tokens', () => {
    expect(enlaceNotificacion('venta:https://malicioso.test', 'https://malicioso.test')).toEqual({
      destino: ['/perfil/compras'],
      enlace: 'Ver mis compras',
    });
    expect(enlaceNotificacion(null, 'Reserva cancelada. Crédito')).toMatchObject({
      destino: ['/perfil/credito'],
    });
  });
  it('canje confirmado y fallo al actualizar no se presentan como canje fallido ni habilitan otro', async () => {
    const { f, obtener, canjear } = await crear();
    obtener.mockRejectedValueOnce(new Error('Sin conexión'));
    await f.componentInstance['canjear']('premio');
    expect(f.componentInstance['exito']()).toContain('Canje realizado');
    expect(f.componentInstance['error']()).toContain('no repitas');
    expect(f.componentInstance['datos']()).toBeNull();
    await f.componentInstance['canjear']('premio');
    expect(canjear).toHaveBeenCalledOnce();
    await f.componentInstance['cargar']();
    expect(f.componentInstance['datos']()).not.toBeNull();
    expect(canjear).toHaveBeenCalledOnce();
  });
  it('una recarga fallida no conserva saldos obsoletos como operables', async () => {
    const { f, obtener } = await crear();
    obtener.mockRejectedValueOnce(new Error('Sin conexión'));
    await f.componentInstance['cargar']();
    expect(f.componentInstance['datos']()).toBeNull();
    expect(f.componentInstance['error']()).toContain('Sin conexión');
  });
});
