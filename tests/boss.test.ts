import { hashPassword, verifyPassword } from '../src/server/auth/crypto.ts';
import {
  calculateHaversineDistanceMeters,
  verifyLocationGeofence,
} from '../src/server/utils/geo.ts';
import {
  calculateLateness,
  calculateExtraMinutes,
  calculateElapsedMinutes,
  formatMinutesToHumanDuration,
} from '../src/server/utils/time.ts';
import { getOrCreateNodeD1Database } from '../src/server/db/node-d1.ts';

async function runTests() {
  console.log('--- STARTING BOSS AUTOMATED TEST SUITE ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      failed++;
    }
  }

  // 1. Password security test
  console.log('\n1. Testing Cryptographic Security...');
  const pass = 'Password@123';
  const hashed = await hashPassword(pass);
  assert(hashed.includes(':'), 'PBKDF2 hash contains salt:derived bits');
  const valid = await verifyPassword(pass, hashed);
  assert(valid === true, 'Valid password verification succeeds');
  const invalid = await verifyPassword('WrongPassword', hashed);
  assert(invalid === false, 'Invalid password verification fails');

  // 2. Haversine & Geofence test
  console.log('\n2. Testing GPS Geofencing Calculations...');
  // Office at Gulshan 2 (23.7925, 90.4078)
  const officeLat = 23.7925;
  const officeLon = 90.4078;

  // Nearby spot (100m away)
  const nearbyLat = 23.7933;
  const nearbyLon = 90.4078;
  const distNearby = calculateHaversineDistanceMeters(officeLat, officeLon, nearbyLat, nearbyLon);
  assert(distNearby < 150, `Nearby distance calculation accurate (~${distNearby}m < 150m)`);

  const checkInside = verifyLocationGeofence(nearbyLat, nearbyLon, 15, officeLat, officeLon, 300, 100);
  assert(checkInside.allowed === true, 'Check-in inside permitted 300m radius succeeds');

  // Far spot (Uttara, ~8km away)
  const farLat = 23.8759;
  const farLon = 90.3795;
  const checkOutside = verifyLocationGeofence(farLat, farLon, 15, officeLat, officeLon, 300, 100);
  assert(checkOutside.allowed === false, 'Check-in outside permitted radius is rejected');
  assert(checkOutside.distanceMeters > 5000, `Rejection correctly indicates distance (${checkOutside.distanceMeters}m)`);

  // Inaccurate GPS reading
  const checkInaccurate = verifyLocationGeofence(nearbyLat, nearbyLon, 180, officeLat, officeLon, 300, 100);
  assert(checkInaccurate.allowed === false, 'GPS with accuracy margin worse than threshold (180m > 100m) is rejected');

  // 3. Time, Duration, and Lateness test
  console.log('\n3. Testing Time and Duration Calculations...');
  // Scheduled: 11:00 AM, Grace: 15 mins (arrival up to 11:15 is on-time)
  const late0 = calculateLateness('11:05', '11:00', 15);
  assert(late0 === 0, 'Arrival at 11:05 with 15m grace is 0m late');

  const late15 = calculateLateness('11:15', '11:00', 15);
  assert(late15 === 0, 'Arrival at 11:15 exactly is 0m late');

  const late25 = calculateLateness('11:25', '11:00', 15);
  assert(late25 === 25, 'Arrival at 11:25 is calculated as 25m late');

  // Extra time past 19:00
  const extra30 = calculateExtraMinutes('19:30', '19:00');
  assert(extra30 === 30, 'Out punch at 19:30 produces 30m extra time');

  // Total elapsed minutes
  const elapsed = calculateElapsedMinutes('11:00', '19:15');
  assert(elapsed === 495, '11:00 to 19:15 is 495 minutes');
  assert(formatMinutesToHumanDuration(elapsed) === '8h 15m', 'Duration human formatting outputs "8h 15m"');

  // 4. Database test
  console.log('\n4. Testing D1 Database & Migrations...');
  const db = await getOrCreateNodeD1Database();
  const adminUser = await db.prepare('SELECT employee_id, role, status FROM users WHERE employee_id = "EMP001"').first<any>();
  assert(adminUser !== null, 'Seeded Super Admin user exists');
  assert(adminUser.role === 'super_admin', 'Admin role matches super_admin');

  console.log(`\n========================================`);
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
