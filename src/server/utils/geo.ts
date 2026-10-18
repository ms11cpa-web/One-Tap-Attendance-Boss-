/**
 * Geographic Haversine Distance & Geofencing Calculation
 */

export interface GeofenceCheckResult {
  allowed: boolean;
  distanceMeters: number;
  message?: string;
}

export function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (value: number) => (value * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function verifyLocationGeofence(
  userLat: number,
  userLon: number,
  accuracyMeters: number,
  officeLat: number,
  officeLon: number,
  maxRadiusMeters: number,
  maxAccuracyThresholdMeters: number
): GeofenceCheckResult {
  if (
    typeof userLat !== 'number' ||
    typeof userLon !== 'number' ||
    isNaN(userLat) ||
    isNaN(userLon)
  ) {
    return {
      allowed: false,
      distanceMeters: 0,
      message: 'Invalid GPS coordinates provided by device.',
    };
  }

  // Check GPS reading accuracy
  if (accuracyMeters > maxAccuracyThresholdMeters) {
    return {
      allowed: false,
      distanceMeters: 0,
      message: `Your GPS accuracy (${Math.round(accuracyMeters)}m) exceeds the permitted threshold (${maxAccuracyThresholdMeters}m). Please move to an open area and retry.`,
    };
  }

  const distance = calculateHaversineDistanceMeters(userLat, userLon, officeLat, officeLon);

  if (distance > maxRadiusMeters) {
    return {
      allowed: false,
      distanceMeters: distance,
      message: `Attendance rejected. You are ${distance} metres away from your office. Maximum permitted distance is ${maxRadiusMeters} metres.`,
    };
  }

  return {
    allowed: true,
    distanceMeters: distance,
  };
}
