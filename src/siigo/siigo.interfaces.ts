/**
 * Estructura estricta del medio de pago en Siigo API para POST /v1/payment-receipts
 * Para métodos de contado (como Efectivo 4375), Siigo requiere únicamente id y value.
 * No se debe enviar due_date (genera invalid_payment al ser contado) ni name (campo de solo lectura).
 */
export interface SiigoPayment {
  id: number;       // ID entero del método (ej: 4375)
  value: number;    // Valor numérico estricto (ej: 15960000)
}

/**
 * Proveedor o Tercero
 */
export interface SiigoSupplier {
  identification: string;
  branch_office?: number;
}

/**
 * Ítem contable en recibo de pago tipo Detailed
 */
export interface SiigoDetailedItem {
  account: {
    code: string;     // ej: "13309595"
    movement: 'Debit' | 'Credit';
  };
  description: string;
  value: number;
}

/**
 * Payload completo para creación de Recibo de Pago (RP) tipo Detailed
 * En modalidad Detailed con forma de pago en efectivo, items lleva el Débito (13309595)
 * y payment lleva la forma de pago (4375), a partir de la cual Siigo acredita automáticamente
 * la cuenta de caja (11050501) y asigna el total en el encabezado del comprobante.
 */
export interface SiigoPaymentReceiptDetailedPayload {
  document: {
    id: number;       // ej: 31163 para RP-2 Aportes
  };
  date: string;       // Formato YYYY-MM-DD
  type: 'Detailed';
  supplier: SiigoSupplier;
  items: SiigoDetailedItem[];
  payment: SiigoPayment;
  observations?: string;
}
