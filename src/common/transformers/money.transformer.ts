import { Transform } from 'class-transformer';

/**
 * Transforma valores monetarios (números o cadenas con separadores de miles como "380.000" o "10.000.000")
 * a un número entero puro en pesos colombianos.
 */
export function TransformMoney() {
  return Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return value;
    if (typeof value === 'number') return isNaN(value) ? NaN : value;
    if (typeof value === 'string') {
      const clean = value.replace(/\D/g, '');
      return clean ? parseInt(clean, 10) : NaN;
    }
    return value;
  });
}
