import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { PreferenciasPushComponent } from './preferencias-push.component';
import { WebPushService } from '../../core/notificaciones/web-push.service';

describe('Preferencias Push accesibles', () => {
  function crear(disponible = true) {
    const push = {
      disponible,
      configurada: signal(true),
      activa: signal(false),
      ocupado: signal(false),
      permiso: signal<NotificationPermission>('default'),
      verificada: signal(true),
      error: signal(''),
      exito: signal(''),
      actualizar: vi.fn(),
      activar: vi.fn(),
      desactivar: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [PreferenciasPushComponent],
      providers: [{ provide: WebPushService, useValue: push }],
    });
    const f = TestBed.createComponent(PreferenciasPushComponent);
    f.detectChanges();
    return { f, push, el: f.nativeElement as HTMLElement };
  }
  it('explica consentimiento, privacidad y no solicita automáticamente', () => {
    const { push, el } = crear();
    expect(push.actualizar).toHaveBeenCalledOnce();
    expect(push.activar).not.toHaveBeenCalled();
    expect(el.textContent).toContain('opcionales');
    expect(el.textContent).toContain('No muestran tu QR');
    expect(el.querySelector('section')?.getAttribute('aria-labelledby')).toBe('push-titulo');
  });
  it('solo el botón inicia consentimiento', () => {
    const { push, el } = crear();
    (el.querySelector('button') as HTMLButtonElement).click();
    expect(push.activar).toHaveBeenCalledOnce();
  });
  it('permiso denegado deshabilita activación y explica ajustes', () => {
    const { push, f, el } = crear();
    push.permiso.set('denied');
    f.detectChanges();
    expect((el.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
    expect(el.textContent).toContain('sus ajustes');
  });
  it('no configurado o petición en vuelo bloquean envíos', () => {
    const { push, f, el } = crear();
    push.configurada.set(false);
    f.detectChanges();
    expect((el.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
    push.ocupado.set(true);
    f.detectChanges();
    expect([...el.querySelectorAll('button')].every((b) => b.disabled)).toBe(true);
    expect(el.querySelector('[role=status]')).not.toBeNull();
  });
  it('estado activo permite baja sin eliminar bandeja', () => {
    const { push, f, el } = crear();
    push.activa.set(true);
    f.detectChanges();
    const boton = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Desactivar'),
    );
    expect(boton?.disabled).toBe(false);
    boton?.click();
    expect(push.desactivar).toHaveBeenCalledOnce();
  });
  it('incompatible ofrece alternativa PWA/bandeja sin botones', () => {
    const { el } = crear(false);
    expect(el.textContent).toContain('iPhone/iPad');
    expect(el.querySelectorAll('button')).toHaveLength(0);
  });
  it('error y confirmación se anuncian con roles correctos', () => {
    const { push, f, el } = crear();
    push.error.set('Sin conexión');
    push.exito.set('Activado');
    f.detectChanges();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Sin conexión');
    expect(el.querySelector('[role=status]')?.textContent).toContain('Activado');
  });
  it('consulta fallida no afirma que el dispositivo fue desactivado', () => {
    const { push, f, el } = crear();
    push.verificada.set(false);
    push.error.set('Sin conexión');
    f.detectChanges();
    expect(el.textContent).toContain('No verificado');
    expect(el.textContent).not.toContain('Desactivado para tu cuenta');
    expect(
      [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Desactivar'))
        ?.disabled,
    ).toBe(false);
  });
});
