/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Dia Cine.Service; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { TestBed } from '@angular/core/testing';
import { DiaCineService } from './dia-cine.service';
describe('Día Argentina de pantallas abiertas', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T02:59:59Z'));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    Reflect.deleteProperty(document, 'hidden');
    vi.useRealTimers();
  });
  it('se renueva al cruzar medianoche sin recargar y elimina listeners/timer al destruir', () => {
    const service = TestBed.inject(DiaCineService);
    expect(service.hoy()).toBe('2029-12-31');
    vi.advanceTimersByTime(60000);
    expect(service.hoy()).toBe('2030-01-01');
    TestBed.resetTestingModule();
    vi.setSystemTime(new Date('2030-01-02T15:00:00Z'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(service.hoy()).toBe('2030-01-01');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('al recuperar foco o visibilidad actualiza inmediatamente el día', () => {
    const service = TestBed.inject(DiaCineService);
    vi.setSystemTime(new Date('2030-01-01T03:00:01Z'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(service.hoy()).toBe('2030-01-01');
    vi.setSystemTime(new Date('2030-01-02T03:00:01Z'));
    window.dispatchEvent(new Event('focus'));
    expect(service.hoy()).toBe('2030-01-02');
  });
});
