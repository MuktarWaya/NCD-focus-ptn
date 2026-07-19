const assert = require('assert');
const tracking = require('../tracking-utils.js');

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

test('creates all 13 physical checkup rounds from baseline through week 24', () => {
  assert.deepStrictEqual(
    tracking.TRACKING_ROUNDS.map((round) => round.value),
    ['W0', 'W2', 'W4', 'W6', 'W8', 'W10', 'W12', 'W14', 'W16', 'W18', 'W20', 'W22', 'W24']
  );
});

test('maps a follow-up round to the two paper-logbook weeks it summarizes', () => {
  assert.deepStrictEqual(tracking.getWeeksForRound('W2'), [1, 2]);
  assert.deepStrictEqual(tracking.getWeeksForRound('W12'), [11, 12]);
  assert.deepStrictEqual(tracking.getWeeksForRound('W24'), [23, 24]);
  assert.deepStrictEqual(tracking.getWeeksForRound('W0'), []);
});

test('limits laboratory entry to baseline, week 12, and week 24', () => {
  assert.strictEqual(tracking.isLabRound('W0'), true);
  assert.strictEqual(tracking.isLabRound('W12'), true);
  assert.strictEqual(tracking.isLabRound('W24'), true);
  assert.strictEqual(tracking.isLabRound('W10'), false);
});

test('interprets decimal avoidance averages using the five supplied effort levels', () => {
  assert.strictEqual(tracking.interpretAvoidanceScore(4.5).label, 'สม่ำเสมอ');
  assert.strictEqual(tracking.interpretAvoidanceScore(3.5).label, 'บ่อยครั้ง');
  assert.strictEqual(tracking.interpretAvoidanceScore(2.5).label, 'บางครั้ง');
  assert.strictEqual(tracking.interpretAvoidanceScore(1.5).label, 'นาน ๆ ที');
  assert.strictEqual(tracking.interpretAvoidanceScore(1.49).label, 'ไม่เคยเลี่ยง');
});

test('summarizes a paper-logbook week without requiring daily online records', () => {
  assert.deepStrictEqual(
    tracking.summarizeWeek({
      exercise_minutes: 100,
      healthy_menu_days: 7,
      sleep_avg: 6.76,
      avoid_sweet: 3,
      avoid_oil: 4,
      avoid_salt: 3,
    }),
    {
      exerciseMinutes: 100,
      exercisePassed: false,
      healthyMenuDays: 7,
      sleepAverage: 6.76,
      avoidanceAverage: 3.33,
      avoidanceLabel: 'บางครั้ง',
    }
  );
});
