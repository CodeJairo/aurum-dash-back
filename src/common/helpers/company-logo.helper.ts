import { Readable } from 'stream';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';

export interface CompanyLogo {
  buffer: Buffer;
  extension: 'png' | 'jpeg' | 'gif';
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Carga el logo de la empresa (si tiene uno configurado) desde el almacenamiento.
 * Devuelve null si la empresa no tiene logo o si el archivo no se puede leer,
 * para que los reportes se generen igual (sin logo) en lugar de fallar.
 *
 * Nota: ExcelJS solo soporta png/jpeg/gif; un logo webp se omite.
 */
export async function loadCompanyLogo(
  prisma: PrismaService,
  storage: StorageService,
  companyId: string,
): Promise<CompanyLogo | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { logoKey: true },
  });
  if (!company?.logoKey) return null;

  const lowerKey = company.logoKey.toLowerCase();
  let extension: CompanyLogo['extension'] | null = null;
  if (lowerKey.endsWith('.png')) extension = 'png';
  else if (lowerKey.endsWith('.jpg') || lowerKey.endsWith('.jpeg')) extension = 'jpeg';
  else if (lowerKey.endsWith('.gif')) extension = 'gif';
  if (!extension) return null;

  try {
    const { stream } = await storage.getFileStream(company.logoKey);
    const buffer = await streamToBuffer(stream);
    return buffer.length > 0 ? { buffer, extension } : null;
  } catch {
    return null;
  }
}

/** Lee ancho/alto en píxeles de un PNG o JPEG a partir de su cabecera. */
export function getImageSize(buffer: Buffer): { width: number; height: number } | null {
  try {
    // PNG: firma de 8 bytes + IHDR (ancho y alto en bytes 16-23)
    if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    // JPEG: recorrer marcadores hasta un SOFn
    if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2;
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) return null;
        const marker = buffer[offset + 1];
        const length = buffer.readUInt16BE(offset + 2);
        const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
        if (isSof) {
          return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
        }
        offset += 2 + length;
      }
    }
  } catch {
    // formato no reconocido
  }
  return null;
}

/** Estima en píxeles el recuadro que ocupa una imagen anclada entre dos celdas. */
function estimateRangeBoxPx(worksheet: any, range: any): { width: number; height: number } | null {
  if (range?.ext?.width && range?.ext?.height) {
    return { width: range.ext.width, height: range.ext.height };
  }
  const tl = range?.tl;
  const br = range?.br;
  if (!tl || !br) return null;
  const colPx = (c: number) => Math.round(((worksheet.getColumn(c + 1)?.width as number) || 9) * 7 + 5);
  const rowPx = (r: number) => Math.round((((worksheet.getRow(r + 1)?.height as number) || 15) * 4) / 3);
  let width = 0;
  for (let c = Math.floor(tl.col); c < Math.floor(br.col); c++) width += colPx(c);
  let height = 0;
  for (let r = Math.floor(tl.row); r < Math.floor(br.row); r++) height += rowPx(r);
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * Quita los logos embebidos en una hoja de plantilla y, si hay logo de empresa,
 * lo inserta en la posición del primer logo de la plantilla, dentro del mismo
 * recuadro y conservando su proporción (sin deformarlo).
 * Nunca lanza: ante cualquier error el documento queda sin logo.
 */
export function replaceTemplateLogo(
  workbook: { addImage: (img: any) => number },
  worksheet: any,
  logo: CompanyLogo | null,
  fallbackBox: { width: number; height: number } = { width: 160, height: 90 },
): void {
  try {
    const templateImages = typeof worksheet.getImages === 'function' ? worksheet.getImages() : [];
    const range = templateImages[0]?.range;
    const box = (range && estimateRangeBoxPx(worksheet, range)) || fallbackBox;
    const tl = range?.tl ? { col: range.tl.col, row: range.tl.row } : { col: 1, row: 1 };

    if (Array.isArray(worksheet._media)) {
      worksheet._media = worksheet._media.filter((m: any) => m.type !== 'image');
    }
    if (!logo) return;

    const size = getImageSize(logo.buffer);
    let ext = { width: box.width, height: box.height };
    if (size && size.width > 0 && size.height > 0) {
      const scale = Math.min(box.width / size.width, box.height / size.height);
      ext = { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
    }

    const imageId = workbook.addImage({ buffer: logo.buffer, extension: logo.extension });
    worksheet.addImage(imageId, { tl, ext, editAs: 'oneCell' });
  } catch {
    // El documento se genera igual sin logo
  }
}
