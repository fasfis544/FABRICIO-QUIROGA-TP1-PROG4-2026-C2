/**
 * Anotacion de responsabilidad: Servicio Angular de Supabase; concentra la responsabilidad de este modulo dentro de app/core/supabase. Incluye principalmente: SupabaseService.
 */
import { DOCUMENT, inject, Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  // El SDK puede limpiar el callback antes de que se cargue la ruta.
  readonly urlInicial = inject(DOCUMENT).location?.href ?? '';
  private readonly client: SupabaseClient;

  constructor() {
    if (!environment.supabaseUrl || !environment.supabaseAnonKey) {
      throw new Error(
        'Faltan supabaseUrl y supabaseAnonKey en src/environments/environment.ts.',
      );
    }

    this.client = createClient(
      environment.supabaseUrl,
      environment.supabaseAnonKey,
    );
  }

  getClient(): SupabaseClient {
    return this.client;
  }
}
