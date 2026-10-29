/**
 * Configuración centralizada de documentos requeridos para partícipes barequeros.
 * Si en el futuro se agregan o quitan requerimientos, solo se modifica esta lista.
 */
export const REQUIRED_BAREQUERO_DOCUMENT_CATEGORIES = [
  { key: 'CEDULA_FRONT', label: 'Cédula Frontal', description: 'Foto o escaneo frontal de la cédula' },
  { key: 'RUT', label: 'RUT', description: 'Registro Único Tributario actualizado' },
] as const;

export type RequiredDocKey = (typeof REQUIRED_BAREQUERO_DOCUMENT_CATEGORIES)[number]['key'];

export interface BarequeroDocumentStatus {
  isComplete: boolean;
  totalRequired: number;
  totalPresent: number;
  missingCategories: string[];
  presentCategories: string[];
}

export function evaluateBarequeroDocuments(
  existingCategories: string[],
): BarequeroDocumentStatus {
  const existingSet = new Set(existingCategories.map((c) => c.toUpperCase()));
  const missing: string[] = [];
  const present: string[] = [];

  for (const req of REQUIRED_BAREQUERO_DOCUMENT_CATEGORIES) {
    if (existingSet.has(req.key)) {
      present.push(req.label);
    } else {
      missing.push(req.label);
    }
  }

  return {
    isComplete: missing.length === 0,
    totalRequired: REQUIRED_BAREQUERO_DOCUMENT_CATEGORIES.length,
    totalPresent: present.length,
    missingCategories: missing,
    presentCategories: present,
  };
}
