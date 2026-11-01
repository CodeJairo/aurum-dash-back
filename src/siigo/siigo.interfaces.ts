/**
 * Estructura estricta del medio de pago en Siigo API para POST /v1/payment-receipts
 * Siigo rechaza campos adicionales como "name" en la creación y exige tipos numéricos estrictos.
 */
export interface SiigoPayment {
  id: number;       // ID entero del método (ej: 4375)
  value: number;    // Valor numérico estricto (ej: 15960000)
  due_date: string; // Formato YYYY-MM-DD
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
 * En modalidad Detailed, la partida doble completa (Débito y Crédito) se envía en items,
 * sin el objeto payment para evitar el error invalid_payment por duplicidad de salida.
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
