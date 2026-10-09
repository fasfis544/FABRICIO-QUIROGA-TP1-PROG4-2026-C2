/**
 * Anotacion de responsabilidad: Servicio Angular de Afiches; concentra la responsabilidad de este modulo dentro de app/data-access/peliculas. Incluye principalmente: extensiones, validarAfiche, AfichesService, bytes.
 */
import { inject, Service } from '@angular/core';
import { SupabaseService } from '../../core/supabase/supabase.service';
const extensiones: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
export function validarAfiche(archivo: File): void {
  if (!extensiones[archivo.type]) throw new Error('Elegí una imagen JPG, PNG o WebP.');
  if (archivo.size === 0 || archivo.size > 5 * 1024 * 1024)
    throw new Error('El afiche debe pesar entre 1 byte y 5 MB.');
}
@Service()
export class AfichesService {
  private readonly client = inject(SupabaseService).getClient();
  async subir(archivo: File): Promise<string> {
    validarAfiche(archivo);
    const bytes = new Uint8Array(await archivo.slice(0, 12).arrayBuffer());
    const firma =
      archivo.type === 'image/jpeg'
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : archivo.type === 'image/png'
          ? [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
          : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
            String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
    if (!firma)
      throw new Error('El contenido del archivo no corresponde al formato de imagen indicado.');
    const { data, error } = await this.client.auth.getUser();
    if (error || !data.user) throw new Error('Ingresá nuevamente antes de subir el afiche.');
    const ruta = `${data.user.id}/${crypto.randomUUID()}.${extensiones[archivo.type]}`;
    const bucket = this.client.storage.from('afiches-cine');
    const resultado = await bucket.upload(ruta, archivo, {
      contentType: archivo.type,
      cacheControl: '31536000',
      upsert: false,
    });
    if (resultado.error)
      throw new Error(
        'No pudimos subir el afiche. Revisá la conexión, tu rol y la migración de Storage.',
      );
    return bucket.getPublicUrl(ruta).data.publicUrl;
  }
}
