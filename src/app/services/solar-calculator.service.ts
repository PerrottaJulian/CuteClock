import { Injectable } from '@angular/core';

export interface SolarTimes {
  sunrise: number;    // hora decimal continua
  solarNoon: number;  // hora decimal continua
  sunset: number;     // hora decimal continua
  isPolarDay: boolean;
  isPolarNight: boolean;
}

/**
 * Calculador solar astronómico simplificado basado en el algoritmo NOAA.
 * Determina orto, mediodía solar y ocaso en base a coordenadas terrestres reales.
 */
@Injectable({
  providedIn: 'root',
})
export class SolarCalculatorService {
  /**
   * Calcula las horas solares para una fecha y coordenadas dadas.
   */
  calculateSolarTimes(date: Date, latitude: number, longitude: number): SolarTimes {
    const startOfYear = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - startOfYear.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);

    // Ángulo fraccionario del año en radianes
    const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (date.getHours() - 12) / 24);

    // Ecuación del tiempo en minutos
    const eqtime =
      229.18 *
      (0.000075 +
        0.001868 * Math.cos(gamma) -
        0.032077 * Math.sin(gamma) -
        0.014615 * Math.cos(2 * gamma) -
        0.040849 * Math.sin(2 * gamma));

    // Declinación solar en radianes
    const decl =
      0.006918 -
      0.399912 * Math.cos(gamma) +
      0.070257 * Math.sin(gamma) -
      0.006758 * Math.cos(2 * gamma) +
      0.000907 * Math.sin(2 * gamma) -
      0.002697 * Math.cos(3 * gamma) +
      0.00148 * Math.sin(3 * gamma);

    const latRad = (latitude * Math.PI) / 180;
    // Ángulo cenital solar al amanecer/atardecer considerando refracción (90.833°)
    const zenithRad = (90.833 * Math.PI) / 180;

    const cosHa =
      Math.cos(zenithRad) / (Math.cos(latRad) * Math.cos(decl)) -
      Math.tan(latRad) * Math.tan(decl);

    let isPolarDay = false;
    let isPolarNight = false;
    let haDeg = 0;

    if (cosHa > 1) {
      isPolarNight = true;
    } else if (cosHa < -1) {
      isPolarDay = true;
    } else {
      haDeg = (Math.acos(cosHa) * 180) / Math.PI;
    }

    const timezoneOffsetHours = -date.getTimezoneOffset() / 60;

    // Mediodía solar en minutos UTC
    const solarNoonUtcMinutes = 720 - 4 * longitude - eqtime;
    const solarNoonDecimal = (solarNoonUtcMinutes / 60 + timezoneOffsetHours + 24) % 24;

    const haHours = haDeg / 15;
    const sunriseDecimal = isPolarNight || isPolarDay ? 6.0 : (solarNoonDecimal - haHours + 24) % 24;
    const sunsetDecimal = isPolarNight || isPolarDay ? 18.0 : (solarNoonDecimal + haHours + 24) % 24;

    return {
      sunrise: sunriseDecimal,
      solarNoon: solarNoonDecimal,
      sunset: sunsetDecimal,
      isPolarDay,
      isPolarNight,
    };
  }
}
