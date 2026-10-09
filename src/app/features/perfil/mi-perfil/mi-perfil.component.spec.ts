/**
 * Anotacion de responsabilidad: Pruebas automatizadas de Mi Perfil.Component; valida el comportamiento del modulo relacionado sin modificar datos reales.
 */
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MiPerfilComponent } from './mi-perfil.component';
import { AuthService } from '../../../core/auth/auth.service';
import { SesionService } from '../../../core/auth/sesion.service';
import { ClienteService } from '../../../data-access/perfiles/cliente.service';
import { Perfil } from '../../../data-access/perfiles/perfil.model';
import { Rol } from '../../../core/auth/rol.model';

describe('Mi cuenta para todos los roles', () => {
  const datos = {
    nombre: 'Ana',
    apellido: 'Cine',
    fecha_nacimiento: '1990-01-01',
    grupo_sanguineo: 'O+',
    color_ojos: 'Marrones',
    vacaciones_anuales: 14,
  };
  async function crear(rol: Rol, falla = false) {
    const perfil = signal<Perfil>({ ...datos, id: 'propio', rol, activo: true });
    const completar = vi.fn().mockResolvedValue(undefined);
    const refrescarPerfil = falla
      ? vi.fn().mockRejectedValue(new Error('Sin conexión'))
      : vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      imports: [MiPerfilComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { refrescarPerfil } },
        { provide: ClienteService, useValue: { completar } },
        {
          provide: SesionService,
          useValue: {
            perfil,
            rol: () => rol,
            usuario: () => ({ id: 'propio', email: 'ana@cine.test' }),
            autenticado: () => true,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(MiPerfilComponent);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    return { fixture, el, completar, refrescarPerfil };
  }
  function input(el: HTMLElement, id: string, value: string) {
    const field = el.querySelector<HTMLInputElement>('#' + id)!;
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }
  for (const rol of ['administrador', 'empleado', 'cliente'] as const) {
    it(`${rol} edita datos propios sin controles de rol ni saldos`, async () => {
      const { fixture, el, completar } = await crear(rol);
      input(el, 'perfil-nombre', '  Nuevo nombre  ');
      el.querySelector('form')!.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
      await fixture.whenStable();
      expect(completar).toHaveBeenCalledExactlyOnceWith({ ...datos, nombre: 'Nuevo nombre' });
      expect(el.querySelectorAll('form input, form select')).toHaveLength(6);
      expect(el.querySelector<HTMLInputElement>('#perfil-email')?.readOnly).toBe(true);
      expect(el.querySelector('[role="status"]')?.textContent).toContain('Datos guardados');
      expect(
        el.querySelector(
          `a[href="${rol === 'administrador' ? '/admin' : rol === 'empleado' ? '/empleados/entrada' : '/peliculas'}"]`,
        ),
      ).not.toBeNull();
    });
  }
  it('rechaza espacios vacíos y muestra el error del campo', async () => {
    const { fixture, el, completar } = await crear('cliente');
    input(el, 'perfil-ojos', '   ');
    el.querySelector('form')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await fixture.whenStable();
    expect(completar).not.toHaveBeenCalled();
    expect(el.querySelector('#perfil-ojos')?.getAttribute('aria-invalid')).toBe('true');
    expect(el.querySelector('#error-ojos')?.textContent).toContain('color de ojos');
  });
  it('bloquea la edición si no pudo cargar el perfil', async () => {
    const { fixture, el, completar } = await crear('empleado', true);
    expect(el.querySelector<HTMLInputElement>('#perfil-nombre')?.disabled).toBe(true);
    el.querySelector('form')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await fixture.whenStable();
    expect(completar).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Sin conexión');
  });
});
