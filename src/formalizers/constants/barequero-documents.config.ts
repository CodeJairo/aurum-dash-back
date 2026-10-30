/**
 * Configuración centralizada de documentos requeridos para partícipes barequeros.
 * Si en el futuro se agregan o quitan requerimientos, solo se modifica esta lista.
 */
export const REQUIRED_BAREQUERO_DOCUMENT_CATEGORIES = [
  { key: 'CEDULA', label: 'Cédula', description: 'Cédula de Ciudadanía' },
  { key: 'ARM', label: 'ARM', description: 'Autorización / ARM' },
  { key: 'ALCALDIA', label: 'Alcaldía', description: 'Certificado de Alcaldía' },
  { key: 'APORTES', label: 'Aportes', description: 'Comprobante de Aportes' },
  { key: 'RC', label: 'RC', description: 'Registro Civil / RC' },
  { key: 'REGISTRADURIA', label: 'Registraduría', description: 'Certificado Registraduría' },
  { key: 'RUCOM', label: 'RUCOM', description: 'Registro Único de Comercializadores (RUCOM)' },
  { key: 'RUT', label: 'RUT', description: 'Registro Único Tributario (RUT)' },
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
  // Compatibilidad hacia atrás: si tiene CEDULA_FRONT o CEDULA_POSTERIOR, cuenta como CEDULA
  if (existingSet.has('CEDULA_FRONT') || existingSet.has('CEDULA_POSTERIOR')) {
    existingSet.add('CEDULA');
  }

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
