(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.trackingUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TRACKING_ROUNDS = Array.from({ length: 13 }, (_, index) => {
    const week = index * 2;
    return {
      value: `W${week}`,
      week,
      label: index === 0 ? 'ครั้งที่ 1 (เริ่มต้น)' : `ครั้งที่ ${index + 1} (สัปดาห์ ${week})`,
    };
  });

  function roundWeek(round) {
    const match = /^W(\d+)$/.exec(String(round || '').trim());
    return match ? Number(match[1]) : null;
  }

  function getWeeksForRound(round) {
    const week = roundWeek(round);
    return week && week % 2 === 0 && week <= 24 ? [week - 1, week] : [];
  }

  function isLabRound(round) {
    return ['W0', 'W12', 'W24'].includes(String(round));
  }

  function interpretAvoidanceScore(score) {
    const value = Number(score);
    if (!Number.isFinite(value) || value < 1 || value > 5) {
      return { label: 'ไม่มีข้อมูล', description: 'ยังไม่ได้บันทึกคะแนน', level: 0 };
    }
    if (value >= 4.5) return { label: 'สม่ำเสมอ', description: 'เลี่ยงได้ดีมาก / รสจืดปกติ ไม่กินเลย', level: 5 };
    if (value >= 3.5) return { label: 'บ่อยครั้ง', description: 'เลี่ยงได้ดี / ทานรสอ่อนเป็นปกติ', level: 4 };
    if (value >= 2.5) return { label: 'บางครั้ง', description: 'ปานกลาง / มีสลับกินรสจัดบ้าง', level: 3 };
    if (value >= 1.5) return { label: 'นาน ๆ ที', description: 'เลี่ยงได้น้อย / ยังทานตามความชอบ', level: 2 };
    return { label: 'ไม่เคยเลี่ยง', description: 'ทานหวานจัด มันจัด เค็มจัดปกติ', level: 1 };
  }

  function numberOrZero(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function summarizeWeek(data) {
    const exerciseMinutes = numberOrZero(data.exercise_minutes);
    const scores = [data.avoid_sweet, data.avoid_oil, data.avoid_salt].map(numberOrZero);
    const avoidanceAverage = Math.round((scores.reduce((sum, score) => sum + score, 0) / 3) * 100) / 100;
    return {
      exerciseMinutes,
      exercisePassed: exerciseMinutes >= 150,
      healthyMenuDays: numberOrZero(data.healthy_menu_days),
      sleepAverage: numberOrZero(data.sleep_avg),
      avoidanceAverage,
      avoidanceLabel: interpretAvoidanceScore(avoidanceAverage).label,
    };
  }

  function roundLabel(round) {
    const configured = TRACKING_ROUNDS.find((item) => item.value === round);
    if (configured) return configured.label;
    const legacy = { M0: 'ข้อมูลเดิม: เริ่มต้น', M3: 'ข้อมูลเดิม: 3 เดือน', M6: 'ข้อมูลเดิม: 6 เดือน', M9: 'ข้อมูลเดิม: 9 เดือน' };
    return legacy[round] || String(round || '-');
  }

  function roundSortValue(round) {
    const week = roundWeek(round);
    if (week !== null) return week;
    return { M0: 0, M3: 12, M6: 24, M9: 36 }[round] ?? 999;
  }

  return {
    TRACKING_ROUNDS,
    getWeeksForRound,
    isLabRound,
    interpretAvoidanceScore,
    summarizeWeek,
    roundLabel,
    roundSortValue,
  };
});
