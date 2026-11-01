/**
 * Estructura estricta del medio de pago en Siigo API para POST /v1/payment-receipts
 * Para métodos de contado (como Efectivo 4375), Siigo requiere únicamente id y value.
 * No se debe enviar due_date (genera invalid_payment al ser contado) ni name (campo de solo lectura).
 */
export interface SiigoPayment {
  id: number;       // ID entero del método (ej: 4375)
  value: number;    // Valor numérico estricto (ej: 15960000)
  due_date?: string; // Formato YYYY-MM-DD
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
 * Payload completo para creación de Recibo de Pago (RP) tipo AdvancePayment
 * En modalidad AdvancePayment, Siigo reconoce el pago como un anticipo oficial al proveedor,
 * asociando el medio de pago, liquidando el total en el PDF y el encabezado del comprobante.
 */
export interface SiigoPaymentReceiptAdvancePayload {
  document: {
    id: number;       // ej: 31163 para RP-2 Aportes
  };
  date: string;       // Formato YYYY-MM-DD
  type: 'AdvancePayment';
  supplier: SiigoSupplier;
  payment: SiigoPayment;
  observations?: string;
}

/**
 * Payload completo para creación de Recibo de Pago (RP) tipo Detailed
 */
export interface SiigoPaymentReceiptDetailedPayload {
  document: {
    id: number;       // ej: 31163 para RP-2 Aportes
  };
  date: string;       // Formato YYYY-MM-DD
  type: 'Detailed';
  supplier: SiigoSupplier;
  items: SiigoDetailedItem[];
  payment?: SiigoPayment;
  observations?: string;
}
