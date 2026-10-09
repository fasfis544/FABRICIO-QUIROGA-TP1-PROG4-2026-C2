/**
 * Anotacion de responsabilidad: Servicio Angular de Pdf; concentra la responsabilidad de este modulo dentro de app/shared/entradas. Incluye principalmente: EntradasPdfService, bytes, link, doc.
 */
import { Service } from '@angular/core';
import { ReservaCliente } from '../../data-access/perfiles/cliente.service';
@Service()
export class EntradasPdfService {
  async descargar(r: ReservaCliente): Promise<void> {
    if (r.documento_pdf) {
      const bytes = Uint8Array.from(atob(r.documento_pdf), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'aurora-compra.pdf';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    // Compatibilidad SOLO para compras anteriores: un único QR compartido, no nuevas compras.
    const [{ jsPDF }, qr] = await Promise.all([import('jspdf'), import('qrcode')]);
    const doc = new jsPDF();
    doc.text('Cine Aurora - Comprobante histórico', 20, 25);
    doc.setFontSize(11);
    doc.text(doc.splitTextToSize(r.pelicula.titulo, 170), 20, 40);
    doc.text(`${r.sala} - ${new Date(r.funcion.inicio).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })} (Argentina)`, 20, 65);
    doc.text(`Butacas: ${r.entradas.map((e) => e.butaca).join(', ')}`, 20, 80);
    doc.text(`Estado: ${r.estado} - Total ARS ${r.total.toFixed(2)}`, 20, 95);
    if (r.pelicula.clasificacion !== 'ATP')
      doc.text('Debe asistir acompañado de un adulto.', 20, 110);
    doc.text(`Código único: ${r.qr_compra}`, 20, 130);
    if (r.estado === 'confirmada')
      doc.addImage(
        await qr.toDataURL(r.qr_compra, { width: 300, margin: 2 }),
        'PNG',
        20,
        145,
        65,
        65,
      );
    if (r.candy.length) {
      doc.addPage();
      doc.text('Candy asociado al mismo QR de compra', 20, 25);
      let y = 40;
      for (const i of r.candy) {
        if (y > 250) {
          doc.addPage();
          y = 25;
        }
        doc.text(doc.splitTextToSize(`${i.cantidad} x ${i.nombre}`, 170), 20, y);
        y += 25;
      }
    }
    doc.save('aurora-compra-historica.pdf');
  }
}
