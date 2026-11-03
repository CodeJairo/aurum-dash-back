/**
 * Analiza una cadena de duración (ej. "30d", "15m", "3600") y la convierte a milisegundos.
 * Soporta 'd' (días), 'h' (horas), 'm' (minutos), 's' (segundos).
 * Por defecto retorna 30 días si el formato no es reconocido.
 */
export function parseDuration(duration: string): number {
  if (!isNaN(Number(duration))) {
    return Number(duration);
  }

  const match = duration.match(/^(\d+)([dhms])$/);
  if (!match) {
    return 30 * 24 * 60 * 60 * 1000;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'm':
      return value * 60 * 1000;
    case 's':
      return value * 1000;
    default:
      return 30 * 24 * 60 * 60 * 1000;
  }
}
