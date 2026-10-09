import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { crearEmisor } from './handler.ts';
import { crearTransporte } from './transport.ts';

const backend = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
const clave = Deno.env.get('CINE_VAPID_PUBLIC_KEY') ?? '';
const enviar = crearTransporte(
  clave,
  Deno.env.get('CINE_VAPID_PRIVATE_KEY') ?? '',
  Deno.env.get('CINE_VAPID_SUBJECT') ?? '',
);
Deno.serve(
  crearEmisor({
    secreto: Deno.env.get('CINE_PUSH_DISPATCH_SECRET') ?? '',
    clavePublica: clave,
    origen: Deno.env.get('CINE_PUSH_ORIGEN') ?? '',
    ahora: Date.now,
    enviar,
    rpc: async (nombre, datos) => {
      const { data, error } = await backend
        .rpc(nombre, datos)
        .abortSignal(AbortSignal.timeout(5000));
      if (error) throw new Error('RPC Push no disponible');
      return data as unknown;
    },
  }),
);
