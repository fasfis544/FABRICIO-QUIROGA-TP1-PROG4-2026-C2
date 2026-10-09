/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Detalle Reserva.Component; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { DetalleReservaComponent } from './detalle-reserva.component';
import {
  ClienteService,
  leerReserva,
  ReservaCliente,
} from '../../data-access/perfiles/cliente.service';
import { BeneficiosService } from '../../data-access/perfiles/beneficios.service';
import { EntradasPdfService } from '../../shared/entradas/pdf.service';

describe('Mi reseña visible y pago simulado coherente', () => {
  const compra: ReservaCliente = {
    token: 'compra-prueba',
    resena_por_pelicula: true,
    qr_compra: 'qr-prueba',
    pago_simulado: true,
    documento_pdf: null,
    estado: 'confirmada',
    total: 1000,
    subtotal: 1000,
    descuento: 0,
    credito: 0,
    a_pagar: 1000,
    vence: '2030-01-01T20:00:00Z',
    creada: '2026-01-01T20:00:00Z',
    sala: 'Sala prueba',
    pelicula: { id: 'p', titulo: 'Prueba', clasificacion: 'ATP' },
    funcion: {
      id: 'f',
      pelicula_id: 'p',
      sala_id: 's',
      inicio: '2030-01-01T20:00:00Z',
      fin: '2030-01-01T22:00:00Z',
      activa: true,
      precio: 1000,
    },
    candy: [],
    candy_codigo: '',
    candy_usada_en: null,
    entradas: [{ codigo: 'e', butaca: 'A1', usada_en: null }],
  };
  const usada = {
    ...compra,
    entradas: [{ ...compra.entradas[0], usada_en: '2030-01-01T19:45:00Z' }],
  };
  async function crear(datos: ReservaCliente = compra) {
    const reserva = vi.fn().mockResolvedValue(datos);
    const resenar = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      imports: [DetalleReservaComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: new Map([['id', datos.token]]) } },
        },
        { provide: ClienteService, useValue: { reserva } },
        { provide: BeneficiosService, useValue: { resenar, cancelar: vi.fn() } },
        { provide: EntradasPdfService, useValue: { descargar: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(DetalleReservaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.querySelector('#mi-resena-titulo')).not.toBeNull();
    });
    const seccion = () => el.querySelector('#mi-resena-titulo')!.parentElement!;
    const escribir = (texto: string) => {
      const input = el.querySelector<HTMLTextAreaElement>('#resena-texto')!;
      input.value = texto;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const enviar = async () => {
      seccion()
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { fixture, el, seccion, reserva, resenar, escribir, enviar };
  }
  it('compra confirmada sin uso muestra la sección y explica el ingreso requerido', async () => {
    const { seccion, el, resenar } = await crear();
    expect(seccion().textContent).toContain('todavía no se registró el ingreso');
    expect(seccion().querySelector('form')).toBeNull();
    expect(seccion().querySelector('a')?.getAttribute('href')).toBe('/peliculas/p');
    expect(el.textContent).toContain('No debés pagar en boletería');
    expect(el.textContent).not.toContain('Pago presencial:');
    expect(el.textContent).not.toContain('pendiente de pago');
    expect(resenar).not.toHaveBeenCalled();
  });
  for (const estado of ['pendiente', 'vencida', 'cancelada'] as const) {
    it(`muestra motivo sin formulario para estado ${estado}`, async () => {
      const { seccion } = await crear({ ...compra, estado, pago_simulado: false });
      expect(seccion().querySelector('form')).toBeNull();
      expect(seccion().textContent).toContain(
        estado === 'cancelada' ? 'fue cancelada' : 'no está confirmada',
      );
    });
  }
  it('acepta el estado cancelada devuelto por SQL sin perder el detalle completo', () => {
    expect(leerReserva({ ...compra, estado: 'cancelada' }).estado).toBe('cancelada');
  });
  it('retirar candy sin ingreso no habilita reseñas', async () => {
    const { seccion } = await crear({ ...compra, candy_usada_en: '2030-01-01T19:45:00Z' });
    expect(seccion().textContent).toContain('Retirar candy no habilita');
    expect(seccion().querySelector('form')).toBeNull();
  });
  it('actualizar después del ingreso habilita estrellas y comentario', async () => {
    const { fixture, el, reserva, seccion } = await crear();
    reserva.mockResolvedValueOnce(usada);
    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Actualizar estado')!
      .click();
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(seccion().querySelector('form')).not.toBeNull();
    });
    expect(seccion().querySelectorAll('input[type="radio"]')).toHaveLength(5);
    expect(seccion().querySelector('textarea')).not.toBeNull();
  });
  it('guarda el comentario usando el token de la compra y conserva el formulario', async () => {
    const { seccion, resenar, escribir, enviar, el } = await crear(usada);
    escribir('Me gustó la película.');
    await enviar();
    expect(resenar).toHaveBeenCalledExactlyOnceWith(compra.token, 5, 'Me gustó la película.');
    expect(el.textContent).toContain('Reseña guardada');
    expect(seccion().querySelector<HTMLTextAreaElement>('textarea')?.value).toBe(
      'Me gustó la película.',
    );
  });
  for (const texto of ['', '   ', 'x'.repeat(2001)]) {
    it(`rechaza comentario vacío o excesivo (${texto.length} caracteres) antes de la RPC`, async () => {
      const { resenar, escribir, enviar, el } = await crear(usada);
      escribir(texto);
      await enviar();
      expect(resenar).not.toHaveBeenCalled();
      expect(el.textContent).toContain('hasta 2000 caracteres');
    });
  }
  it('un rechazo del servidor conserva texto y permite reintentar', async () => {
    const { resenar, escribir, enviar, seccion, el } = await crear(usada);
    resenar.mockRejectedValueOnce(new Error('Sin conexión'));
    escribir('Muy buena');
    await enviar();
    expect(el.textContent).toContain('Sin conexión');
    expect(seccion().querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Muy buena');
    expect(seccion().querySelector<HTMLFieldSetElement>('fieldset')?.disabled).toBe(false);
    await enviar();
    expect(resenar).toHaveBeenCalledTimes(2);
  });
  it('no permite enviar por llamada directa sin ingreso validado', async () => {
    const { fixture, resenar } = await crear();
    await fixture.componentInstance['resenar'](new Event('submit', { cancelable: true }));
    expect(resenar).not.toHaveBeenCalled();
  });
  it('una compra histórica confirmada no recibe un aviso falso de deuda', async () => {
    const { el } = await crear({ ...compra, pago_simulado: false });
    expect(el.textContent).not.toContain('Pago presencial:');
    expect(el.textContent).not.toContain('pendiente de pago');
    expect(el.textContent).toContain('Importe histórico');
  });
  it('precarga comentario y estrellas existentes al reabrir', async () => {
    const { fixture, seccion } = await crear({
      ...usada,
      calificacion_propia: 3,
      texto_propio: 'Comentario guardado',
    });
    expect(fixture.componentInstance['datos']()).toMatchObject({
      calificacion: 3,
      texto: 'Comentario guardado',
    });
    expect(seccion().querySelector<HTMLTextAreaElement>('textarea')?.value).toBe(
      'Comentario guardado',
    );
    expect(seccion().textContent).toContain('Actualizar reseña');
  });
  it('no pisa un borrador al actualizar y lo conserva tras error de recarga', async () => {
    const { fixture, reserva, escribir } = await crear({
      ...usada,
      calificacion_propia: 3,
      texto_propio: 'Original',
    });
    escribir('Borrador sin guardar');
    await fixture.componentInstance['cargar']();
    expect(fixture.componentInstance['datos']().texto).toBe('Borrador sin guardar');
    reserva.mockRejectedValueOnce(new Error('Sin conexión'));
    await fixture.componentInstance['cargar']();
    expect(fixture.componentInstance['datos']().texto).toBe('Borrador sin guardar');
  });
  it('con servidor anterior no ofrece sobrescribir una reseña cuyo comentario falta', async () => {
    const { fixture, seccion, resenar } = await crear({ ...usada, calificacion_propia: 3 });
    expect(seccion().querySelector('textarea')).toBeNull();
    expect(seccion().textContent).toContain('evitar sobrescribirlo');
    fixture.componentInstance['datos'].update((d) => ({ ...d, texto: 'Reemplazo' }));
    await fixture.componentInstance['resenar'](new Event('submit'));
    expect(resenar).not.toHaveBeenCalled();
  });
  it('distingue campo ausente de ausencia de reseña', () => {
    expect(leerReserva(usada).texto_propio).toBeUndefined();
    expect(leerReserva({ ...usada, texto_propio: null }).texto_propio).toBeNull();
  });
  it('explica que distintas compras comparten una única opinión y peso en el promedio', async () => {
    const { seccion } = await crear(usada);
    expect(seccion().textContent).toContain(
      'Una única reseña y calificación por cuenta y película',
    );
    expect(seccion().textContent).toContain('una sola vez en el promedio');
  });
  for (const resena_por_pelicula of [undefined, false]) {
    it(`bloquea el servidor sin la regla única (${resena_por_pelicula}) incluso por llamada directa`, async () => {
      const { fixture, seccion, resenar } = await crear({ ...usada, resena_por_pelicula });
      expect(seccion().querySelector('textarea')).toBeNull();
      expect(seccion().textContent).toContain('Falta activar');
      fixture.componentInstance['datos'].update((d) => ({ ...d, texto: 'No duplicar' }));
      await fixture.componentInstance['resenar'](new Event('submit'));
      expect(resenar).not.toHaveBeenCalled();
    });
  }
  it('valida el marcador de regla única sin convertir cadenas verdaderas en autorización', () => {
    expect(leerReserva({ ...usada, resena_por_pelicula: true }).resena_por_pelicula).toBe(true);
    expect(leerReserva({ ...usada, resena_por_pelicula: 'true' }).resena_por_pelicula).toBe(false);
    expect(leerReserva({ ...usada, resena_por_pelicula: undefined }).resena_por_pelicula).toBe(
      false,
    );
  });
  it('otra compra y función precargan la misma opinión y usan su token solo como prueba de ingreso', async () => {
    const opinion = { calificacion_propia: 3, texto_propio: 'Mi opinión única' };
    const primera = await crear({ ...usada, ...opinion });
    expect(primera.seccion().textContent).toContain('Actualizar reseña');
    primera.fixture.destroy();
    TestBed.resetTestingModule();
    const segunda = await crear({
      ...usada,
      ...opinion,
      token: 'otra-compra',
      funcion: { ...usada.funcion, id: 'otra-funcion' },
    });
    expect(segunda.seccion().querySelector<HTMLTextAreaElement>('textarea')?.value).toBe(
      opinion.texto_propio,
    );
    expect(segunda.fixture.componentInstance['datos']().calificacion).toBe(3);
    segunda.escribir('Actualicé mi opinión, no agregué otra');
    await segunda.enviar();
    expect(segunda.resenar).toHaveBeenCalledExactlyOnceWith(
      'otra-compra',
      3,
      'Actualicé mi opinión, no agregué otra',
    );
    expect(segunda.el.textContent).toContain('una sola vez en el promedio');
  });
  it('muestra la opinión existente sin habilitar edición desde una compra sin ingreso', async () => {
    const { seccion, resenar } = await crear({
      ...compra,
      calificacion_propia: 4,
      texto_propio: 'Opinión desde otra función',
    });
    expect(seccion().textContent).toContain('Tu opinión guardada sobre esta película');
    expect(seccion().textContent).toContain('Opinión desde otra función');
    expect(seccion().querySelector('form')).toBeNull();
    expect(resenar).not.toHaveBeenCalled();
  });
});
