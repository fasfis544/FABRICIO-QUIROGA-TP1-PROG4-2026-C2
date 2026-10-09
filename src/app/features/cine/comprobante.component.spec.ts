/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Comprobante.Component; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { ComprobanteComponent } from './comprobante.component';
import { ClienteService, ReservaCliente } from '../../data-access/perfiles/cliente.service';
import { EntradasPdfService } from '../../shared/entradas/pdf.service';

describe('Comprobante sin deuda ficticia ni prestaciones habilitadas después de cancelar', () => {
  const compra: ReservaCliente = {
    token: 'compra-prueba', qr_compra: 'qr-prueba', pago_simulado: true, documento_pdf: null,
    estado: 'confirmada', total: 1000, subtotal: 1000, descuento: 0, credito: 0, a_pagar: 1000,
    vence: '2030-01-01T20:00:00Z', creada: '2026-01-01T20:00:00Z', sala: 'Sala prueba',
    pelicula: { id: 'p', titulo: 'Prueba', clasificacion: 'ATP' },
    funcion: { id: 'f', pelicula_id: 'p', sala_id: 's', inicio: '2030-01-01T20:00:00Z',
      fin: '2030-01-01T22:00:00Z', activa: true, precio: 1000 },
    candy: [{ nombre: 'Pochoclos', precio: 200, cantidad: 1, items: [] }],
    candy_codigo: '', candy_usada_en: null,
    entradas: [{ codigo: 'e', butaca: 'A1', usada_en: null }],
  };
  async function crear(datos: ReservaCliente = compra) {
    const comprobante = vi.fn().mockResolvedValue(datos);
    const descargar = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({ imports: [ComprobanteComponent], providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['compraId', compra.token]]) } } },
      { provide: ClienteService, useValue: { comprobante } },
      { provide: EntradasPdfService, useValue: { descargar } },
    ] });
    const fixture = TestBed.createComponent(ComprobanteComponent);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    return { fixture, el, comprobante, descargar };
  }

  for (const pago_simulado of [true, false]) {
    for (const estado of ['confirmada', 'pendiente', 'vencida', 'cancelada'] as const) {
      it(`presenta estado ${estado} y pago ${pago_simulado ? 'simulado' : 'histórico'} sin deuda ficticia`, async () => {
        const { el } = await crear({ ...compra, estado, pago_simulado });
        const texto = el.textContent ?? '';
        expect(texto).not.toContain('Pago pendiente en boletería');
        expect(texto).not.toContain('Pago confirmado en boletería');
        expect(texto).toContain(pago_simulado ? 'Importe del pago simulado (sin cobro real)' : 'Importe histórico');
        expect(el.querySelector('[data-estado]')?.getAttribute('data-estado')).toBe(estado);
        expect(texto).toContain('17:00');
        if (estado === 'cancelada') {
          expect(el.querySelector('[data-estado]')?.textContent).toContain('Cancelada');
          expect(texto).not.toContain('Entrada habilitada');
          expect(texto).toContain('no habilita ingreso ni retiro de candy');
        }
        if (estado === 'pendiente') expect(texto).toContain('no realices un nuevo pago');
        expect(el.querySelector('app-qr-entrada') !== null).toBe(estado === 'confirmada');
      });
    }
  }
  it('descarga el comprobante de la compra actual sin modificar su contenido', async () => {
    const { fixture, descargar } = await crear();
    await fixture.componentInstance['descargar']();
    expect(descargar).toHaveBeenCalledExactlyOnceWith(compra);
  });
  it('al fallar una actualización deja de mostrar la compra antigua como vigente', async () => {
    const { fixture, el, comprobante } = await crear();
    comprobante.mockRejectedValueOnce(new Error('Sin conexión'));
    await fixture.componentInstance['cargar']();
    fixture.detectChanges();
    expect(el.textContent).toContain('Sin conexión');
    expect(el.querySelector('[data-estado]')).toBeNull();
    expect(el.querySelector('app-qr-entrada')).toBeNull();
  });
});
