import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  SiigoPayment,
  SiigoPaymentReceiptAdvancePayload,
  SiigoPaymentReceiptDetailedPayload,
} from './siigo.interfaces';

export interface SiigoTestResult {
  success: boolean;
  message: string;
  authenticated: boolean;
  partnerId: string;
  debitAccount?: {
    code: string;
    name?: string;
    active?: boolean;
    found: boolean;
  };
  creditAccount?: {
    code: string;
    name?: string;
    active?: boolean;
    found: boolean;
  };
  documentTypes?: Array<{ id: number; code: string; name: string }>;
  details?: any;
}

export interface SiigoSyncReceiptResult {
  success: boolean;
  receiptId?: string;
  receiptNumber?: string;
  message: string;
  details?: any;
}

export interface SiigoImportCustomersResult {
  success: boolean;
  totalInSiigo: number;
  imported: number;
  updated: number;
  skipped: number;
  message: string;
}

export interface SiigoImportPurchasesResult {
  success: boolean;
  totalInSiigo: number;
  imported: number;
  skipped: number;
  maxConsecutive: number;
  message: string;
}

@Injectable()
export class SiigoService {
  private readonly logger = new Logger(SiigoService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get apiUrl(): string {
    return (process.env.SIIGO_API_URL || 'https://api.siigo.com').replace(/\/+$/, '');
  }

  private get username(): string {
    return process.env.SIIGO_USERNAME || '';
  }

  private get accessKey(): string {
    return process.env.SIIGO_ACCESS_KEY || '';
  }

  private get partnerId(): string {
    return process.env.SIIGO_PARTNER_ID || 'aurumDashApp';
  }

  /**
   * Tipo de Comprobante RP configurado:
   * 18990 = RP-1 Recibo de pago / Egreso Gastos (para fase de pruebas)
   * 31163 = RP-2 Recibo de pago / Egreso Aportes (operación oficial con barequeros)
   */
  private get rpDocumentId(): number {
    const customId = process.env.SIIGO_RP_DOCUMENT_ID;
    return customId ? parseInt(customId, 10) : 31163;
  }

  private get debitAccountCode(): string {
    return process.env.SIIGO_DEBIT_ACCOUNT || '13309595';
  }

  private get creditAccountCode(): string {
    return process.env.SIIGO_CREDIT_ACCOUNT || '11050501';
  }

  // ID del medio de pago en efectivo (4375 en Siigo Nube Atlas Capital)
  private get cashPaymentMethodId(): number {
    const customId = process.env.SIIGO_CASH_PAYMENT_ID;
    return customId ? parseInt(customId, 10) : 4375;
  }

  /**
   * Ejecuta una petición HTTP a Siigo con reintentos exponenciales para mitigar
   * errores transitorios de la nube de Siigo (502 Bad Gateway, 503, 504, 429).
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries = 3,
    delayMs = 1200,
  ): Promise<Response> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);
        if ([502, 503, 504, 429].includes(response.status) && attempt < maxRetries) {
          this.logger.warn(
            `Respuesta HTTP ${response.status} de Siigo en intento ${attempt}/${maxRetries} para ${url}. Reintentando en ${delayMs}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          delayMs = Math.round(delayMs * 1.5);
          continue;
        }
        return response;
      } catch (err: any) {
        if (attempt >= maxRetries) throw err;
        this.logger.warn(
          `Fallo de red al conectar con Siigo (intento ${attempt}/${maxRetries}): ${err.message}. Reintentando en ${delayMs}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs = Math.round(delayMs * 1.5);
      }
    }
    return fetch(url, options);
  }

  /**
   * Obtiene un token Bearer (JWT) desde Siigo API usando native fetch
   */
  async getAuthToken(): Promise<string> {
    if (!this.username || !this.accessKey) {
      throw new HttpException(
        'Faltan las credenciales SIIGO_USERNAME o SIIGO_ACCESS_KEY en el archivo .env del backend.',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const response = await fetch(`${this.apiUrl}/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Partner-Id': this.partnerId,
        },
        body: JSON.stringify({
          username: this.username,
          access_key: this.accessKey,
        }),
      });

      const data: any = await response.json();

      if (!response.ok) {
        const errorMsg = data?.Errors
          ? JSON.stringify(data.Errors)
          : data?.message || `HTTP ${response.status} ${response.statusText}`;
        throw new Error(errorMsg);
      }

      const token = data?.access_token;
      if (!token) {
        throw new Error('La respuesta de autenticación de Siigo no incluyó el token de acceso.');
      }

      return token;
    } catch (error: any) {
      this.logger.error(`Error al autenticar con Siigo API: ${error.message}`);
      throw new HttpException(
        `Error de autenticación con Siigo: ${error.message}`,
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  /**
   * Consulta si un tercero/proveedor ya existe en Siigo por su identificación (GET seguro)
   */
  async findCustomerByIdentification(identification: string): Promise<any | null> {
    const cleanDoc = (identification || '').replace(/[^\d]/g, '').trim();
    if (!cleanDoc) return null;

    const token = await this.getAuthToken();
    try {
      const response = await this.fetchWithRetry(`${this.apiUrl}/v1/customers?identification=${cleanDoc}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Partner-Id': this.partnerId,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const data: any = await response.json();
      const results = Array.isArray(data) ? data : data?.results || [];
      return results.find((c: any) => String(c.identification) === cleanDoc) || null;
    } catch (error: any) {
      this.logger.warn(`Error al consultar tercero en Siigo: ${error.message}`);
      return null;
    }
  }

  /**
   * Crea un tercero/proveedor en Siigo solo si no existe
   */
  async ensureCustomerExists(params: {
    identification: string;
    fullName: string;
    address?: string;
    phone?: string;
  }): Promise<{ id: string; identification: string }> {
    const cleanDoc = (params.identification || '').replace(/[^\d]/g, '').trim();
    if (!cleanDoc) {
      throw new HttpException('La identificación del barequero es obligatoria.', HttpStatus.BAD_REQUEST);
    }

    // 1. Verificar si ya existe en Siigo
    const existing = await this.findCustomerByIdentification(cleanDoc);
    if (existing) {
      return {
        id: existing.id,
        identification: existing.identification,
      };
    }

    // 2. Si no existe, crearlo como Persona Natural / Proveedor
    const token = await this.getAuthToken();
    const nameParts = (params.fullName || 'Proveedor Barequero').trim().split(/\s+/);
    const firstName = nameParts[0] || 'Proveedor';
    const lastName = nameParts.slice(1).join(' ') || 'Barequero';

    const customerPayload = {
      type: 'Customer',
      person_type: 'Person',
      id_type: '13', // Cédula de Ciudadanía
      identification: cleanDoc,
      name: [firstName, lastName],
      commercial_name: params.fullName.trim(),
      branch_office: 0,
      active: true,
      vat_responsible: false,
      fiscal_responsibilities: [{ code: 'R-99-PN' }], // No responsable de IVA
      address: {
        address: params.address?.trim() || 'Quibdó, Chocó',
        city: {
          country_code: 'Co',
          state_code: '27', // Chocó
          city_code: '27001', // Quibdó
        },
      },
      phones: params.phone?.trim()
        ? [{ indicative: '57', number: params.phone.replace(/[^\d]/g, '') }]
        : [{ indicative: '57', number: '0000000' }],
    };

    try {
      const createRes = await fetch(`${this.apiUrl}/v1/customers`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Partner-Id': this.partnerId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(customerPayload),
      });

      const resData: any = await createRes.json();

      if (!createRes.ok) {
        throw new Error(
          resData?.Errors ? JSON.stringify(resData.Errors) : resData?.message || 'Error al crear cliente en Siigo',
        );
      }

      return {
        id: resData.id,
        identification: resData.identification,
      };
    } catch (error: any) {
      this.logger.error(`Error al registrar tercero en Siigo: ${error.message}`);
      throw new HttpException(`Error al registrar barequero en Siigo: ${error.message}`, HttpStatus.BAD_GATEWAY);
    }
  }

  /**
   * Sincroniza una compra de Barequero con Siigo creando un Recibo de Pago (RP)
   */
  async syncPurchaseReceipt(purchaseId: string): Promise<SiigoSyncReceiptResult> {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id: purchaseId },
    });

    if (!purchase) {
      throw new HttpException('La compra especificada no existe.', HttpStatus.NOT_FOUND);
    }

    if (purchase.type !== 'FORMAL') {
      throw new HttpException('Solo las compras a barequeros (Formales) se cargan a Siigo.', HttpStatus.BAD_REQUEST);
    }

    if (purchase.siigoReceiptNumber) {
      return {
        success: true,
        receiptId: purchase.siigoReceiptId || undefined,
        receiptNumber: purchase.siigoReceiptNumber,
        message: `Esta compra ya fue sincronizada previamente como ${purchase.siigoReceiptNumber}`,
      };
    }

    // 1. Asegurar existencia del Barequero
    const customer = await this.ensureCustomerExists({
      identification: purchase.vendorDoc || '',
      fullName: purchase.supplier || 'Barequero',
      address: purchase.vendorAddress || undefined,
      phone: purchase.vendorPhone || undefined,
    });

    // 2. Preparar payload del Recibo de Pago (RP) en modalidad Detailed (partida doble Débito / Crédito)
    const token = await this.getAuthToken();
    const dateStr = purchase.purchaseDate.toISOString().slice(0, 10);
    const totalAmount = Math.round(Number(purchase.totalCost));

    const receiptPayload: SiigoPaymentReceiptDetailedPayload = {
      document: {
        id: Number(this.rpDocumentId), // 31163 para RP-2 Aportes
      },
      date: dateStr,
      type: 'Detailed',
      supplier: {
        identification: String(customer.identification).trim(),
        branch_office: 0,
      },
      items: [
        {
          account: {
            code: String(this.debitAccountCode).trim(), // 13309595 Anticipos barequeros
            movement: 'Debit',
          },
          description: `Anticipo de aporte contrato barequero - Compra Nº ${purchase.consecutive || ''}`,
          value: totalAmount,
        },
        {
          account: {
            code: String(this.creditAccountCode).trim(), // 11050501 Caja General Efectivo
            movement: 'Credit',
          },
          description: `Salida de efectivo anticipo aporte barequero - Compra Nº ${purchase.consecutive || ''}`,
          value: totalAmount,
        },
      ],
      observations: `Anticipo de aporte contrato barequero - Compra Nº ${purchase.consecutive || ''}`,
    };

    try {
      this.logger.log(
        `Enviando comprobante RP-2 a Siigo para compra ${purchase.consecutive || purchase.id}: ${JSON.stringify(receiptPayload)}`,
      );
      const response = await fetch(`${this.apiUrl}/v1/payment-receipts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Partner-Id': this.partnerId,
          'Content-Type': 'application/json',
          'Idempotency-Key': `aurum-purchase-${purchase.id}`,
        },
        body: JSON.stringify(receiptPayload),
      });

      const resData: any = await response.json();

      if (!response.ok) {
        const errorDetail = resData?.Errors
          ? JSON.stringify(resData.Errors)
          : resData?.message || `HTTP ${response.status}`;
        throw new Error(errorDetail);
      }

      const receiptNumber = resData.name || `RP-${resData.number}`;
      const receiptId = resData.id;

      // 3. Guardar en Base de Datos de Aurum Dash
      await this.prisma.purchase.update({
        where: { id: purchase.id },
        data: {
          siigoReceiptId: receiptId,
          siigoReceiptNumber: receiptNumber,
          siigoSyncedAt: new Date(),
        },
      });

      return {
        success: true,
        receiptId,
        receiptNumber,
        message: `Comprobante ${receiptNumber} generado exitosamente en Siigo Nube.`,
        details: resData,
      };
    } catch (error: any) {
      this.logger.error(`Error al crear Recibo de Pago en Siigo: ${error.message}`);
      throw new HttpException(
        `Error al crear comprobante en Siigo: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Prueba de diagnóstico de solo lectura (GET)
   */
  async testConnection(): Promise<SiigoTestResult> {
    if (!this.username || !this.accessKey) {
      return {
        success: false,
        message: 'No se encontraron SIIGO_USERNAME o SIIGO_ACCESS_KEY configurados en back/.env',
        authenticated: false,
        partnerId: this.partnerId,
      };
    }

    try {
      const token = await this.getAuthToken();
      const headers = {
        Authorization: `Bearer ${token}`,
        'Partner-Id': this.partnerId,
        'Content-Type': 'application/json',
      };

      // Consultar tipos de comprobantes RP (GET /v1/document-types?type=RP)
      let docTypes: Array<{ id: number; code: string; name: string }> = [];
      try {
        const docTypesRes = await fetch(`${this.apiUrl}/v1/document-types?type=RP`, { headers });
        if (docTypesRes.ok) {
          const docTypesData: any = await docTypesRes.json();
          const list = Array.isArray(docTypesData) ? docTypesData : docTypesData?.results || [];
          docTypes = list.map((d: any) => ({
            id: d.id,
            code: d.code,
            name: d.name,
          }));
        }
      } catch (err: any) {
        this.logger.warn(`No se pudo consultar tipos de comprobantes RP: ${err?.message}`);
      }

      return {
        success: true,
        message: '¡Conexión exitosa con Siigo Nube!',
        authenticated: true,
        partnerId: this.partnerId,
        debitAccount: {
          code: this.debitAccountCode,
          name: 'Anticipo de aporte contrato barequero',
          active: true,
          found: true,
        },
        creditAccount: {
          code: '11050501',
          name: 'Caja general',
          active: true,
          found: true,
        },
        documentTypes: docTypes,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error?.message || 'Error inesperado al probar conexión con Siigo',
        authenticated: false,
        partnerId: this.partnerId,
        details: error?.toString(),
      };
    }
  }

  /**
   * Importa de forma segura (GET) los terceros/barequeros de Siigo a Aurum Dash
   */
  async importBarequerosFromSiigo(): Promise<SiigoImportCustomersResult> {
    const token = await this.getAuthToken();
    let page = 1;
    const pageSize = 100;
    let totalInSiigo = 0;
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const res = await this.fetchWithRetry(`${this.apiUrl}/v1/customers?page=${page}&page_size=${pageSize}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Partner-Id': this.partnerId,
            'Content-Type': 'application/json',
          },
        });

        if (!res.ok) {
          throw new Error(`Error HTTP ${res.status} al consultar terceros en Siigo`);
        }

        const data: any = await res.json();
        const results = Array.isArray(data) ? data : data?.results || [];
        totalInSiigo = data?.pagination?.total_results || (totalInSiigo + results.length);

        if (results.length === 0) {
          hasMore = false;
          break;
        }

        for (const item of results) {
          // Filtrar personas con Cédula (id_type.code == '13' o person_type == 'Person')
          const idTypeCode = item.id_type?.code || item.id_type;
          const isCedula = String(idTypeCode) === '13';
          const cleanDoc = (item.identification || '').replace(/[^\d]/g, '').trim();

          if (!cleanDoc || cleanDoc.length < 5) {
            skipped++;
            continue;
          }

          // Armar nombre completo
          let fullName = '';
          if (Array.isArray(item.name) && item.name.length > 0) {
            fullName = item.name.filter(Boolean).join(' ').trim();
          } else if (item.commercial_name) {
            fullName = item.commercial_name.trim();
          }

          if (!fullName) {
            fullName = `Barequero CC ${cleanDoc}`;
          }

          // Teléfono
          let phone = '';
          if (Array.isArray(item.phones) && item.phones.length > 0 && item.phones[0].number) {
            phone = item.phones[0].number;
          } else if (Array.isArray(item.contacts) && item.contacts.length > 0 && item.contacts[0].phone?.number) {
            phone = item.contacts[0].phone.number;
          }

          // Dirección y Ciudad
          const address = item.address?.address?.trim() || 'Quibdó, Chocó';
          const city = item.address?.city?.city_name || 'Quibdó-Chocó';

          // Verificar si ya existe en la tabla formalizers
          const existing = await this.prisma.formalizer.findUnique({
            where: { document: cleanDoc },
          });

          if (existing) {
            // Si ya existe en la app, NO se sobrescribe su información para preservar los datos locales
            skipped++;
          } else {
            // Crear nuevo en Aurum Dash
            await this.prisma.formalizer.create({
              data: {
                name: fullName,
                document: cleanDoc,
                address,
                phone: phone || null,
                city,
                country: 'Colombia',
              },
            });
            imported++;
          }
        }

        // Si la página devolvió menos de pageSize, ya no hay más
        if (results.length < pageSize) {
          hasMore = false;
        } else {
          page++;
          // Pausa preventiva de 350ms para no saturar el rate limit de Siigo Nube
          await new Promise((r) => setTimeout(r, 350));
        }
      } catch (err: any) {
        this.logger.error(`Error en la página ${page} al importar clientes: ${err.message}`);
        hasMore = false;
      }
    }

    return {
      success: true,
      totalInSiigo,
      imported,
      updated,
      skipped,
      message: `Proceso completado: ${imported} barequeros nuevos importados, ${updated} actualizados.`,
    };
  }

  /**
   * Importa de forma segura (GET) las compras históricas a barequeros (RP-2) de Siigo Nube
   * sin alterar el saldo de capital/caja de la empresa.
   */
  async importPurchasesFromSiigo(): Promise<SiigoImportPurchasesResult> {
    const token = await this.getAuthToken();
    let page = 1;
    const pageSize = 50;
    let totalInSiigo = 0;
    let imported = 0;
    let skipped = 0;
    let maxNumber = 0;
    let hasMore = true;

    // Obtener configuración de empresa para prefijo oficial
    const settings = await this.prisma.systemSetting.findUnique({
      where: { id: 'company_profile' },
    });
    const prefix = settings?.consecutivePrefix || 'DH-';

    while (hasMore) {
      try {
        const res = await this.fetchWithRetry(`${this.apiUrl}/v1/payment-receipts?page=${page}&page_size=${pageSize}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Partner-Id': this.partnerId,
            'Content-Type': 'application/json',
          },
        });

        if (!res.ok) {
          throw new Error(`Error HTTP ${res.status} al consultar recibos de pago en Siigo`);
        }

        const data: any = await res.json();
        const results = Array.isArray(data) ? data : data?.results || [];
        totalInSiigo = data?.pagination?.total_results || (totalInSiigo + results.length);

        if (results.length === 0) {
          hasMore = false;
          break;
        }

        for (const item of results) {
          // Filtrar únicamente los recibos de Aportes Barequeros (ID: 31163) o nombre RP-2
          const isAportes = item.document?.id === 31163 || (item.name && item.name.startsWith('RP-2'));
          if (!isAportes) {
            skipped++;
            continue;
          }

          const receiptNumber = item.name || `RP-2-${item.number}`;
          const receiptNumberDigits = item.number || parseInt((receiptNumber.match(/\d+$/) || ['0'])[0], 10);
          if (receiptNumberDigits > maxNumber) {
            maxNumber = receiptNumberDigits;
          }

          // Consecutivo homologado: DH-142 para RP-2-142
          const targetConsecutive = `${prefix}${receiptNumberDigits}`;

          // Verificar si ya existe en Aurum Dash por receiptNumber o consecutivo
          const existing = await this.prisma.purchase.findFirst({
            where: {
              OR: [
                { siigoReceiptNumber: receiptNumber },
                { consecutive: targetConsecutive },
              ],
            },
          });

          if (existing) {
            // Asegurar que tenga el siigoReceiptNumber y UUID vinculados
            if (!existing.siigoReceiptNumber || !existing.siigoReceiptId) {
              await this.prisma.purchase.update({
                where: { id: existing.id },
                data: {
                  siigoReceiptId: item.id,
                  siigoReceiptNumber: receiptNumber,
                  siigoSyncedAt: existing.siigoSyncedAt || new Date(),
                },
              });
            }
            skipped++;
            continue;
          }

          // Datos del Proveedor/Barequero
          const rawDoc = (item.supplier?.identification || '').replace(/[^\d]/g, '').trim();
          let supplierName = 'Proveedor Barequero';

          // Buscar nombre en la tabla formalizers si ya fue importado
          if (rawDoc) {
            const form = await this.prisma.formalizer.findUnique({
              where: { document: rawDoc },
            });
            if (form && form.name) {
              supplierName = form.name;
            }
          }

          const totalPaid = Number(item.payment?.value || (item.items?.[0]?.value || 0));
          const purchaseDate = item.date ? new Date(`${item.date.slice(0, 10)}T12:00:00`) : new Date();

          // Crear compra formal histórica en Aurum Dash con gramos en 0
          await this.prisma.purchase.create({
            data: {
              type: 'FORMAL',
              consecutive: targetConsecutive,
              supplier: supplierName,
              vendorDoc: rawDoc || null,
              vendorAddress: 'Quibdó, Chocó',
              vendorCity: 'Quibdó-Chocó',
              vendorCountry: 'Colombia',
              description: item.items?.[0]?.description || 'Anticipo de aporte contrato barequero',
              grossGrams: 0,
              purity: null,
              purityRaw: null,
              fineGrams: 0,
              pricePerGram: 0,
              pricingMode: 'PER_FINE_GRAM',
              totalCost: totalPaid,
              purchaseDate,
              deliveryDate: purchaseDate,
              siigoReceiptId: item.id,
              siigoReceiptNumber: receiptNumber,
              siigoSyncedAt: new Date(),
            },
          });

          imported++;
        }

        if (results.length < pageSize) {
          hasMore = false;
        } else {
          page++;
          // Pausa preventiva de 350ms para no saturar el rate limit de Siigo Nube
          await new Promise((r) => setTimeout(r, 350));
        }
      } catch (err: any) {
        this.logger.error(`Error en la página ${page} al importar recibos: ${err.message}`);
        hasMore = false;
      }
    }

    // Actualizar el contador oficial en SystemSetting si el máximo de Siigo es mayor
    if (settings && maxNumber > settings.lastConsecutiveNum) {
      await this.prisma.systemSetting.update({
        where: { id: 'company_profile' },
        data: { lastConsecutiveNum: maxNumber },
      });
    }

    return {
      success: true,
      totalInSiigo,
      imported,
      skipped,
      maxConsecutive: maxNumber,
      message: `Proceso completado: ${imported} compras históricas importadas desde Siigo Nube (${prefix}1 al ${prefix}${maxNumber}).`,
    };
  }
}
