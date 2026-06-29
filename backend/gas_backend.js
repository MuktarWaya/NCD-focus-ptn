/**
 * Google Apps Script Web App Backend
 * สำหรับแอปพลิเคชันติดตามพฤติกรรมสุขภาพ "มุ่งเป้าปัตตานี"
 * ทำหน้าที่เป็น REST API สำหรับอ่านและบันทึกข้อมูลใน Google Sheets
 */

// ตั้งค่าใน Apps Script: Project Settings -> Script properties -> API_PASSCODE
function getApiPasscode() {
  return PropertiesService.getScriptProperties().getProperty("API_PASSCODE") || "";
}

var ACTIVE_VILLAGES = ["หมู่ 2 บ้านตรัง", "หมู่ 3 บ้านเขาวัง", "หมู่ 4 บ้านม่วงเงิน"];
var NOTIFICATION_LOG_SHEET = "NotificationLog";

function getTelegramBotToken_() {
  return PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_TOKEN") || "";
}

function getTelegramChatId_() {
  return PropertiesService.getScriptProperties().getProperty("TELEGRAM_CHAT_ID") || "";
}

function doGet(e) {
  return errorResponse("API นี้ต้องเรียกผ่าน POST พร้อมรหัสผ่านเท่านั้น");
}

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      return errorResponse("ไม่พบ Google Sheets");
    }
    
    var requestData = JSON.parse(e.postData.contents);
    
    var configuredPasscode = getApiPasscode();
    if (!configuredPasscode) {
      return errorResponse("ยังไม่ได้ตั้งค่า API_PASSCODE ใน Script properties");
    }
    
    // ตรวจสอบรหัสผ่าน API_PASSCODE
    if (requestData.passcode !== configuredPasscode) {
      return errorResponse("รหัสผ่านไม่ถูกต้อง (Invalid Passcode)");
    }
    
    var action = requestData.action;
    
    if (action === "getTargets") {
      return getTargets(ss);
    } else if (action === "getOsmWorkers") {
      return getOsmWorkers(ss);
    } else if (action === "getTargetDetail") {
      return getTargetDetail(ss, parseInt(requestData.data.id));
    } else if (action === "getDashboardStats") {
      return getDashboardStats(ss);
    } else if (action === "setupSheets") {
      setupSheetsForSpreadsheet(ss);
      return successResponse({ message: "ตรวจสอบและเติมหัวตารางชีตเรียบร้อยแล้ว" });
    } else if (action === "migrateMockVillages") {
      return migrateMockVillages(ss);
    } else if (action === "bulkUpdateTargetLocations") {
      return bulkUpdateTargetLocations(ss, requestData.data.locations || []);
    } else if (action === "addTarget") {
      return addTarget(ss, requestData.data);
    } else if (action === "updateTarget") {
      return updateTarget(ss, requestData.data);
    } else if (action === "addQuarterly") {
      return addQuarterly(ss, requestData.data);
    } else if (action === "addDailyLog") {
      return addDailyLog(ss, requestData.data);
    } else if (action === "sendDailyTelegramSummary") {
      return sendDailyTelegramSummary();
    } else if (action === "setupDailyNotificationTrigger") {
      return setupDailyNotificationTrigger();
    } else if (action === "authorizeNotificationServices") {
      return authorizeNotificationServices();
    } else {
      return errorResponse("ไม่พบ Action สำหรับการเขียนข้อมูล");
    }
  } catch (err) {
    return errorResponse(err.toString());
  }
}

// --- ฟังก์ชันหลัก ---

// 1. ดึงรายชื่อกลุ่มเป้าหมายทั้งหมด
function getTargets(ss) {
  var sheet = ss.getSheetByName("Targets");
  if (!sheet) return errorResponse("ไม่พบแผ่นงานชื่อ 'Targets'");
  
  var data = getSheetData(sheet);
  return successResponse(data);
}

function getOsmWorkers(ss) {
  var workers = readOsmWorkers(ss);
  return successResponse(workers);
}

function readOsmWorkers(ss) {
  var sheet = ss.getSheetByName("OSM");
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  var seen = {};
  var workers = [];
  values.forEach(function(row) {
    var worker = row[0] ? row[0].toString().trim() : "";
    if (worker && !seen[worker]) {
      seen[worker] = true;
      workers.push(worker);
    }
  });

  return workers;
}

// 2. ดึงรายละเอียดของบุคคล ประวัติรายไตรมาส และพฤติกรรมรายวัน
function getTargetDetail(ss, targetId) {
  var targetsSheet = ss.getSheetByName("Targets");
  var quarterlySheet = ss.getSheetByName("QuarterlyData");
  var dailySheet = ss.getSheetByName("DailyLogs");
  
  if (!targetsSheet) return errorResponse("ไม่พบแผ่นงาน 'Targets'");
  
  // ค้นหาเป้าหมาย
  var targets = getSheetData(targetsSheet);
  var target = targets.find(function(t) { return parseInt(t.id) === targetId; });
  if (!target) return errorResponse("ไม่พบข้อมูลกลุ่มเป้าหมาย ID: " + targetId);
  
  // ค้นหาประวัติรายไตรมาส
  var quarterly = [];
  if (quarterlySheet) {
    var qData = getSheetData(quarterlySheet);
    quarterly = qData.filter(function(q) { return parseInt(q.target_id) === targetId; });
    // เรียงตามเวลา (M0, M3, M6, M9)
    var qOrder = { "M0": 1, "M3": 2, "M6": 3, "M9": 4 };
    quarterly.sort(function(a, b) {
      return (qOrder[a.quarter] || 99) - (qOrder[b.quarter] || 99);
    });
  }
  
  // ค้นหาบันทึกรายวัน
  var dailyLogs = [];
  if (dailySheet) {
    var dData = getSheetData(dailySheet);
    dailyLogs = dData.filter(function(d) { return parseInt(d.target_id) === targetId; });
    // เรียงตามวันที่ลงบันทึก ล่าสุดอยู่บน
    dailyLogs.sort(function(a, b) {
      return parseDate(b.date) - parseDate(a.date);
    });
  }
  
  return successResponse({
    profile: target,
    quarterly: quarterly,
    dailyLogs: dailyLogs
  });
}

// 3. คำนวณค่าสถิติแดชบอร์ด
function getDashboardStats(ss) {
  var targetsSheet = ss.getSheetByName("Targets");
  var quarterlySheet = ss.getSheetByName("QuarterlyData");
  
  if (!targetsSheet) return errorResponse("ไม่พบแผ่นงาน 'Targets'");
  
  var targets = getSheetData(targetsSheet);
  var total = targets.length;
  
  var riskCount = targets.filter(function(t) { return t.type === "กลุ่มเสี่ยง"; }).length;
  var patientCount = targets.filter(function(t) { return t.type === "กลุ่มป่วย"; }).length;
  
  // คำนวณอัตราการพัฒนาทางสุขภาพดีขึ้น (เปรียบเทียบไตรมาสล่าสุดกับ M0)
  var improvedBmiCount = 0;
  var improvedBpCount = 0;
  var improvedDtxCount = 0;
  var totalWithFollowUp = 0;
  var targetGroups = {};
  
  if (quarterlySheet) {
    var qData = getSheetData(quarterlySheet);
    
    // จัดกลุ่มตาม target_id
    qData.forEach(function(row) {
      var tid = row.target_id;
      if (!targetGroups[tid]) targetGroups[tid] = [];
      targetGroups[tid].push(row);
    });
    
    Object.keys(targetGroups).forEach(function(tid) {
      var logs = targetGroups[tid];
      if (logs.length > 1) { // มีการติดตามผลมากกว่า 1 ครั้ง (มี M0 และไตรมาสอื่น)
        totalWithFollowUp++;
        
        // เรียงตาม M0, M3, M6, M9
        var qOrder = { "M0": 1, "M3": 2, "M6": 3, "M9": 4 };
        logs.sort(function(a, b) { return (qOrder[a.quarter] || 99) - (qOrder[b.quarter] || 99); });
        
        var m0 = logs[0];
        var latest = logs[logs.length - 1];
        
        // 1. BMI ลดลง (ดีขึ้น)
        if (latest.bmi && m0.bmi && parseFloat(latest.bmi) < parseFloat(m0.bmi)) {
          improvedBmiCount++;
        }
        
        // 2. ความดันโลหิตดีขึ้น (Systolic ล่าสุด น้อยกว่า M0)
        if (latest.bp && m0.bp) {
          var m0Sys = parseInt(m0.bp.toString().split("/")[0]);
          var latSys = parseInt(latest.bp.toString().split("/")[0]);
          if (latSys < m0Sys) improvedBpCount++;
        }
        
        // 3. ค่าน้ำตาล DTX ลดลง
        if (latest.dtx && m0.dtx && parseInt(latest.dtx) < parseInt(m0.dtx)) {
          improvedDtxCount++;
        }
      }
    });
  }

  var osmWorkers = readOsmWorkers(ss);
  var mockWorkers = [
    "อสม.นูรอัยนี มะ", "อสม.ฟาตีเมาะ สาและ", "อสม.ไซนับ ดอเลาะ", "อสม.อามีนะห์ มะลี",
    "อสม.รอกีเยาะ เจ๊ะมะ", "อสม.ซูไรดา ดือราแม", "อสม.ปาตีเมาะ มามะ", "อสม.มารียัม สะแลแม",
    "อสม.อาอีเสาะ ยะโกะ", "อสม.นูรีซัน มะสาและ", "อสม.ซารีนา ดือเร๊ะ", "อสม.รอฮานี สะมะแอ",
    "อสม.นูรฮายาตี เจ๊ะหะ", "อสม.ฮัสนะห์ มะแซ", "อสม.อัสมา สาและ", "อสม.ซูไฮลา มะลี",
    "อสม.มะยีดา ดอเลาะ", "อสม.รอซีดะห์ เจ๊ะเลาะ", "อสม.นูรอามีเนาะ ดือราแม", "อสม.ซัลมา มามะ",
    "อสม.อับดุลเลาะ สาและ", "อสม.มูฮัมหมัดอารีฟ ดอเลาะ", "อสม.อับดุลรอฮีม มะแซ", "อสม.มูฮัมหมัดซากี มะลี",
    "อสม.ซุลกิฟลี เจ๊ะมะ", "อสม.รอซาลี สะแลแม", "อสม.อับดุลฮากิม ดือเร๊ะ", "อสม.มูฮัมหมัดฟิตรี ยะโกะ",
    "อสม.ซาการียา มามะ", "อสม.อิสมาแอ สาและ", "อสม.นูรอาซีกีน เจ๊ะหะ", "อสม.ฟารีดา มะแซ",
    "อสม.ฮานีฟะห์ ดอเลาะ", "อสม.ซูไบดะห์ มะลี", "อสม.อาลีฟะห์ เจ๊ะเลาะ", "อสม.นูรฟารีซา ดือราแม",
    "อสม.ซาฟีนะห์ มามะ", "อสม.รอฮีมะห์ สาและ", "อสม.นูรอีมาน สะมะแอ", "อสม.ฮาซานะห์ ยะโกะ"
  ];
  var villageSummary = ACTIVE_VILLAGES.map(function(village) {
    var villageTargets = targets.filter(function(t) { return t.village === village; });
    var followed = villageTargets.filter(function(t) {
      return (targetGroups[t.id] || []).length > 0;
    }).length;
    var followUp = villageTargets.filter(function(t) {
      return (targetGroups[t.id] || []).length > 1;
    }).length;
    var risk = villageTargets.filter(function(t) { return t.type === "กลุ่มเสี่ยง"; }).length;
    var patient = villageTargets.filter(function(t) { return t.type === "กลุ่มป่วย"; }).length;
    var progressRate = villageTargets.length > 0 ? Math.round((followed / villageTargets.length) * 100) : 0;

    return {
      village: village,
      total: villageTargets.length,
      followed: followed,
      followUp: followUp,
      risk: risk,
      patient: patient,
      remaining: Math.max(villageTargets.length - followed, 0),
      progressRate: progressRate
    };
  });

  var workers = osmWorkers.length > 0 ? osmWorkers.slice() : mockWorkers.slice();
  targets.forEach(function(t) {
    var worker = t.responsible_worker || "ยังไม่ระบุคณะทำงาน";
    if (workers.indexOf(worker) === -1) workers.push(worker);
  });

  var workerSummary = workers.map(function(worker) {
    var workerTargets = targets.filter(function(t) {
      return (t.responsible_worker || "ยังไม่ระบุคณะทำงาน") === worker;
    });
    var followed = workerTargets.filter(function(t) {
      return (targetGroups[t.id] || []).length > 0;
    }).length;
    var followUp = workerTargets.filter(function(t) {
      return (targetGroups[t.id] || []).length > 1;
    }).length;
    var risk = workerTargets.filter(function(t) { return t.type === "กลุ่มเสี่ยง"; }).length;
    var patient = workerTargets.filter(function(t) { return t.type === "กลุ่มป่วย"; }).length;
    var progressRate = workerTargets.length > 0 ? Math.round((followed / workerTargets.length) * 100) : 0;

    return {
      worker: worker,
      total: workerTargets.length,
      followed: followed,
      followUp: followUp,
      risk: risk,
      patient: patient,
      remaining: Math.max(workerTargets.length - followed, 0),
      progressRate: progressRate
    };
  }).filter(function(item) {
    return item.total > 0 || item.worker !== "ยังไม่ระบุคณะทำงาน";
  });
  
  return successResponse({
    totalTargets: total,
    riskCount: riskCount,
    patientCount: patientCount,
    totalWithFollowUp: totalWithFollowUp,
    improvedBmiCount: improvedBmiCount,
    improvedBmiRate: totalWithFollowUp > 0 ? ((improvedBmiCount / totalWithFollowUp) * 100).toFixed(1) : "0",
    improvedBpCount: improvedBpCount,
    improvedBpRate: totalWithFollowUp > 0 ? ((improvedBpCount / totalWithFollowUp) * 100).toFixed(1) : "0",
    improvedDtxCount: improvedDtxCount,
    improvedDtxRate: totalWithFollowUp > 0 ? ((improvedDtxCount / totalWithFollowUp) * 100).toFixed(1) : "0",
    villageSummary: villageSummary,
    workerSummary: workerSummary
  });
}

// 4. บันทึกเป้าหมายใหม่
function addTarget(ss, data) {
  var sheet = ss.getSheetByName("Targets");
  if (!sheet) return errorResponse("ไม่พบแผ่นงาน 'Targets'");
  
  var headers = getSheetHeaders(sheet);
  var nextId = getNextId(sheet);
  data.id = nextId;
  
  var newRow = headers.map(function(header) {
    return data[header] !== undefined ? data[header] : "";
  });
  
  sheet.appendRow(newRow);
  notifyRecordEvent_(ss, "addTarget", data);
  return successResponse({ message: "เพิ่มข้อมูลกลุ่มเป้าหมายเรียบร้อยแล้ว", id: nextId });
}

// 5. อัปเดตข้อมูลเป้าหมายเดิม
function updateTarget(ss, data) {
  var sheet = ss.getSheetByName("Targets");
  if (!sheet) return errorResponse("ไม่พบแผ่นงาน 'Targets'");
  
  var id = parseInt(data.id);
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var idColIdx = headers.indexOf("id");
  
  if (idColIdx === -1) return errorResponse("ไม่พบคอลัมน์ 'id' ในแผ่นงาน Targets");
  
  for (var i = 1; i < rows.length; i++) {
    if (parseInt(rows[i][idColIdx]) === id) {
      var before = rowToObject_(headers, rows[i]);
      // พบแถวเป้าหมาย อัปเดตคอลัมน์ที่ส่งมา
      headers.forEach(function(header, colIdx) {
        if (data[header] !== undefined && header !== "id") {
          sheet.getRange(i + 1, colIdx + 1).setValue(data[header]);
        }
      });
      notifyRecordEvent_(ss, "updateTarget", data, before);
      return successResponse({ message: "อัปเดตข้อมูลกลุ่มเป้าหมายสำเร็จ" });
    }
  }
  return errorResponse("ไม่พบข้อมูล ID: " + id + " ในระบบ");
}

function migrateMockVillages(ss) {
  setupSheetsForSpreadsheet(ss);

  var sheet = ss.getSheetByName("Targets");
  if (!sheet) return errorResponse("ไม่พบแผ่นงาน 'Targets'");

  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return successResponse({ message: "ไม่มีข้อมูลกลุ่มเป้าหมายให้ปรับ", updated: 0 });

  var headers = rows[0];
  var addressColIdx = headers.indexOf("address");
  var villageColIdx = headers.indexOf("village");
  if (addressColIdx === -1 || villageColIdx === -1) {
    return errorResponse("ไม่พบคอลัมน์ address หรือ village ในแผ่นงาน Targets");
  }

  var updatedRows = [];

  for (var i = 1; i < rows.length; i++) {
    var address = rows[i][addressColIdx] ? rows[i][addressColIdx].toString() : "";
    var addressOnly = address.split(/\s+/)[0];
    var village = ACTIVE_VILLAGES[(i - 1) % ACTIVE_VILLAGES.length];
    updatedRows.push([addressOnly, village]);
  }

  sheet.getRange(2, addressColIdx + 1, updatedRows.length, 1).setValues(updatedRows.map(function(row) { return [row[0]]; }));
  sheet.getRange(2, villageColIdx + 1, updatedRows.length, 1).setValues(updatedRows.map(function(row) { return [row[1]]; }));

  return successResponse({
    message: "ปรับข้อมูล mock บ้านเลขที่และหมู่บ้านเรียบร้อยแล้ว",
    updated: updatedRows.length
  });
}

function bulkUpdateTargetLocations(ss, locations) {
  setupSheetsForSpreadsheet(ss);

  var sheet = ss.getSheetByName("Targets");
  if (!sheet) return errorResponse("ไม่พบแผ่นงาน 'Targets'");
  if (!locations || locations.length === 0) return errorResponse("ไม่มีข้อมูล locations สำหรับอัปเดต");

  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var idColIdx = headers.indexOf("id");
  var addressColIdx = headers.indexOf("address");
  var villageColIdx = headers.indexOf("village");
  var workerColIdx = headers.indexOf("responsible_worker");
  if (idColIdx === -1 || addressColIdx === -1 || villageColIdx === -1) {
    return errorResponse("ไม่พบคอลัมน์ id, address หรือ village ในแผ่นงาน Targets");
  }

  var locationById = {};
  locations.forEach(function(item) {
    locationById[parseInt(item.id)] = {
      address: item.address || "",
      village: item.village || "",
      responsible_worker: item.responsible_worker || ""
    };
  });

  var updated = 0;
  var addressValues = [];
  var villageValues = [];
  var workerValues = [];

  for (var i = 1; i < rows.length; i++) {
    var id = parseInt(rows[i][idColIdx]);
    var location = locationById[id];
    if (location) {
      addressValues.push([location.address]);
      villageValues.push([location.village]);
      if (workerColIdx !== -1) workerValues.push([location.responsible_worker]);
      updated++;
    } else {
      addressValues.push([rows[i][addressColIdx]]);
      villageValues.push([rows[i][villageColIdx]]);
      if (workerColIdx !== -1) workerValues.push([rows[i][workerColIdx]]);
    }
  }

  var addressRange = sheet.getRange(2, addressColIdx + 1, addressValues.length, 1);
  var villageRange = sheet.getRange(2, villageColIdx + 1, villageValues.length, 1);
  addressRange.setNumberFormat("@");
  villageRange.setNumberFormat("@");
  addressRange.setValues(addressValues);
  villageRange.setValues(villageValues);
  if (workerColIdx !== -1 && workerValues.length > 0) {
    var workerRange = sheet.getRange(2, workerColIdx + 1, workerValues.length, 1);
    workerRange.setNumberFormat("@");
    workerRange.setValues(workerValues);
  }

  return successResponse({
    message: "อัปเดตบ้านเลขที่ หมู่บ้าน และคณะทำงานตาม ID เรียบร้อยแล้ว",
    updated: updated
  });
}

// 6. เพิ่มประวัติผลสุขภาพ 3 เดือน (Quarterly Tracking)
function addQuarterly(ss, data) {
  var sheet = ss.getSheetByName("QuarterlyData");
  if (!sheet) return errorResponse("ไม่พบแผ่นงาน 'QuarterlyData'");
  
  var headers = getSheetHeaders(sheet);
  var nextId = getNextId(sheet);
  data.id = nextId;
  data.date = data.date || getTodayThaiDate();
  
  // คำนวณ BMI อัตโนมัติในสคริปต์
  if (data.weight && data.height) {
    var hM = parseFloat(data.height) / 100;
    data.bmi = (parseFloat(data.weight) / (hM * hM)).toFixed(1);
  }
  
  // ตรวจสอบว่ามีข้อมูลไตรมาสนี้ของคนนี้อยู่แล้วหรือไม่ ถ้ามีให้เขียนทับ
  var rows = sheet.getDataRange().getValues();
  var targetIdColIdx = headers.indexOf("target_id");
  var quarterColIdx = headers.indexOf("quarter");
  
  if (targetIdColIdx !== -1 && quarterColIdx !== -1) {
    for (var i = 1; i < rows.length; i++) {
      if (parseInt(rows[i][targetIdColIdx]) === parseInt(data.target_id) && 
          rows[i][quarterColIdx].toString().trim() === data.quarter.toString().trim()) {
        
        // เขียนทับแถวเดิม
        headers.forEach(function(header, colIdx) {
          if (data[header] !== undefined && header !== "id") {
            sheet.getRange(i + 1, colIdx + 1).setValue(data[header]);
          }
        });
        notifyRecordEvent_(ss, "updateQuarterly", data);
        return successResponse({ message: "อัปเดตข้อมูลรอบ " + data.quarter + " เรียบร้อยแล้ว (เขียนทับข้อมูลเดิม)", id: rows[i][headers.indexOf("id")] });
      }
    }
  }

  var newRow = headers.map(function(header) {
    return data[header] !== undefined ? data[header] : "";
  });
  
  sheet.appendRow(newRow);
  notifyRecordEvent_(ss, "addQuarterly", data);
  return successResponse({ message: "บันทึกผลสุขภาพรอบ " + data.quarter + " เรียบร้อยแล้ว", id: nextId });
}

// 7. เพิ่มบันทึกพฤติกรรมประจำวัน
function addDailyLog(ss, data) {
  var sheet = ss.getSheetByName("DailyLogs");
  if (!sheet) return errorResponse("ไม่พบแผ่นงาน 'DailyLogs'");
  
  var headers = getSheetHeaders(sheet);
  var nextId = getNextId(sheet);
  data.id = nextId;
  data.date = data.date || getTodayThaiDate();
  
  var newRow = headers.map(function(header) {
    return data[header] !== undefined ? data[header] : "";
  });
  
  sheet.appendRow(newRow);
  notifyRecordEvent_(ss, "addDailyLog", data);
  return successResponse({ message: "บันทึกพฤติกรรมสุขภาพรายวันเรียบร้อยแล้ว", id: nextId });
}

// --- ระบบแจ้งเตือน Telegram และ NotificationLog ---

function buildDailyNotificationSummaryFromData_(targets, quarterlyData, dailyLogs) {
  targets = targets || [];
  quarterlyData = quarterlyData || [];
  dailyLogs = dailyLogs || [];

  var activeTargets = targets.filter(function(target) {
    return ACTIVE_VILLAGES.indexOf(target.village) !== -1;
  });

  var quarterlyByTarget = {};
  quarterlyData.forEach(function(row) {
    var targetId = parseInt(row.target_id);
    if (!quarterlyByTarget[targetId]) quarterlyByTarget[targetId] = [];
    quarterlyByTarget[targetId].push(row);
  });

  var pending = [];
  var urgent = [];
  var villageMap = {};
  ACTIVE_VILLAGES.forEach(function(village) {
    villageMap[village] = { village: village, total: 0, followed: 0, pending: 0 };
  });

  activeTargets.forEach(function(target) {
    var targetId = parseInt(target.id);
    var village = target.village;
    var logs = quarterlyByTarget[targetId] || [];
    var villageItem = villageMap[village];
    villageItem.total++;
    if (logs.length > 0) {
      villageItem.followed++;
    } else {
      villageItem.pending++;
      pending.push(toNotificationTarget_(target, "ยังไม่มีผลติดตาม"));
    }

    var latest = getLatestQuarterlyLog_(logs);
    if (latest && isUrgentQuarterlyLog_(latest)) {
      urgent.push(toNotificationTarget_(target, "ต้องติดตามสุขภาพ"));
    }
  });

  return {
    totalTargets: activeTargets.length,
    followed: activeTargets.length - pending.length,
    pendingCount: pending.length,
    pending: pending,
    urgentCount: urgent.length,
    urgent: urgent,
    villageSummary: ACTIVE_VILLAGES.map(function(village) {
      return villageMap[village];
    })
  };
}

function buildDailyNotificationSummary_(ss) {
  var targetsSheet = ss.getSheetByName("Targets");
  var quarterlySheet = ss.getSheetByName("QuarterlyData");
  var dailySheet = ss.getSheetByName("DailyLogs");
  if (!targetsSheet) throw new Error("ไม่พบแผ่นงาน 'Targets'");

  return buildDailyNotificationSummaryFromData_(
    getSheetData(targetsSheet),
    quarterlySheet ? getSheetData(quarterlySheet) : [],
    dailySheet ? getSheetData(dailySheet) : []
  );
}

function buildDailyTelegramMessage_(summary, now) {
  now = now || new Date();
  var dateText = typeof Utilities !== "undefined" && Utilities.formatDate
    ? Utilities.formatDate(now, "Asia/Bangkok", "dd/MM/yyyy")
    : formatDateForMessage_(now);
  var lines = [];

  lines.push("NCD Focus PTN - สรุปแจ้งเตือนรายวัน " + dateText);
  lines.push("กลุ่มเป้าหมายใน 3 หมู่หลัก " + summary.totalTargets + " คน");
  lines.push("ติดตามแล้ว " + summary.followed + " คน | ค้างติดตาม " + summary.pendingCount + " คน");
  if (summary.urgentCount > 0) {
    lines.push("ต้องติดตามสุขภาพ " + summary.urgentCount + " คน");
  }
  lines.push("");
  lines.push("แยกตามหมู่บ้าน");
  summary.villageSummary.forEach(function(item) {
    lines.push("- " + item.village + ": ทั้งหมด " + item.total + ", ค้างติดตาม " + item.pending);
  });

  if (summary.pending.length > 0) {
    lines.push("");
    lines.push("รายชื่อค้างติดตาม");
    summary.pending.slice(0, 30).forEach(function(item, index) {
      lines.push((index + 1) + ". " + item.name + " | " + item.village + " | " + item.responsible_worker);
    });
    if (summary.pending.length > 30) {
      lines.push("...และอีก " + (summary.pending.length - 30) + " คน");
    }
  }

  if (summary.urgent.length > 0) {
    lines.push("");
    lines.push("รายชื่อต้องติดตามสุขภาพ");
    summary.urgent.slice(0, 15).forEach(function(item, index) {
      lines.push((index + 1) + ". " + item.name + " | " + item.village + " | " + item.responsible_worker);
    });
    if (summary.urgent.length > 15) {
      lines.push("...และอีก " + (summary.urgent.length - 15) + " คน");
    }
  }

  lines.push("");
  lines.push("หมายเหตุ: ข้อความนี้ไม่แสดงค่าตรวจสุขภาพละเอียด กรุณาเปิด dashboard เพื่อดูข้อมูลรายบุคคล");

  return lines.join("\n");
}

function sendDailyTelegramSummary() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return errorResponse("ไม่พบ Google Sheets");

    setupSheetsForSpreadsheet(ss);
    var summary = buildDailyNotificationSummary_(ss);
    var message = buildDailyTelegramMessage_(summary, new Date());
    var result = sendTelegramMessage_(message);
    appendNotificationLog_(ss, {
      type: "daily_summary",
      severity: summary.urgentCount > 0 ? "warning" : "info",
      target_id: "",
      target_name: "",
      village: "",
      responsible_worker: "",
      message: message,
      channel: "telegram",
      status: result.ok ? "sent" : "failed",
      sent_at: result.ok ? getTimestamp_() : "",
      dedupe_key: "daily_summary_" + Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyyMMdd"),
      error: result.error || ""
    });

    return successResponse({
      message: result.ok ? "ส่งสรุป Telegram รายวันแล้ว" : "สร้างสรุปแล้วแต่ส่ง Telegram ไม่สำเร็จ",
      sent: result.ok,
      error: result.error || ""
    });
  } catch (err) {
    return errorResponse(err.toString());
  }
}

function setupDailyNotificationTrigger() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(function(trigger) {
      if (trigger.getHandlerFunction() === "sendDailyTelegramSummary") {
        ScriptApp.deleteTrigger(trigger);
      }
    });
    ScriptApp.newTrigger("sendDailyTelegramSummary").timeBased().everyDays(1).atHour(7).create();
    return successResponse({ message: "ตั้งค่า trigger ส่ง Telegram รายวันเวลาประมาณ 07:00 น. เรียบร้อยแล้ว" });
  } catch (err) {
    return errorResponse(err.toString());
  }
}

function authorizeNotificationServices() {
  var triggers = ScriptApp.getProjectTriggers();
  var response = UrlFetchApp.fetch("https://api.telegram.org", {
    method: "get",
    muteHttpExceptions: true
  });
  Logger.log("พบ trigger ในโปรเจกต์ " + triggers.length + " รายการ");
  Logger.log("ทดสอบ UrlFetchApp ได้ HTTP " + response.getResponseCode());
  return successResponse({ message: "อนุญาตสิทธิ์ ScriptApp และ UrlFetchApp เรียบร้อยแล้ว" });
}

function notifyRecordEvent_(ss, type, data, before) {
  try {
    setupNotificationSheet_(ss);
    var target = getTargetForNotification_(ss, data.target_id || data.id, data);
    var message = buildRecordEventTelegramMessage_(type, target, data, before);
    if (!message) return;

    var severity = type === "addQuarterly" || type === "updateQuarterly"
      ? (isUrgentQuarterlyLog_(data) ? "warning" : "info")
      : "info";
    var result = sendTelegramMessage_(message);
    appendNotificationLog_(ss, {
      type: type,
      severity: severity,
      target_id: target.id || data.target_id || data.id || "",
      target_name: target.name || "",
      village: target.village || "",
      responsible_worker: target.responsible_worker || "",
      message: message,
      channel: "telegram",
      status: result.ok ? "sent" : "failed",
      sent_at: result.ok ? getTimestamp_() : "",
      dedupe_key: type + "_" + (target.id || data.target_id || data.id || "") + "_" + new Date().getTime(),
      error: result.error || ""
    });
  } catch (err) {
    try {
      appendNotificationLog_(ss, {
        type: type,
        severity: "error",
        target_id: data && (data.target_id || data.id) || "",
        target_name: "",
        village: "",
        responsible_worker: "",
        message: "Notification error: " + err.toString(),
        channel: "telegram",
        status: "failed",
        sent_at: "",
        dedupe_key: "notification_error_" + new Date().getTime(),
        error: err.toString()
      });
    } catch (ignored) {}
  }
}

function buildRecordEventTelegramMessage_(type, target, data, before) {
  var labelByType = {
    addTarget: "เพิ่มกลุ่มเป้าหมายใหม่",
    updateTarget: "แก้ไขข้อมูลสำคัญ",
    addQuarterly: "บันทึกผลตรวจ 3 เดือน",
    updateQuarterly: "อัปเดตผลตรวจ 3 เดือน",
    addDailyLog: "บันทึกพฤติกรรมรายวัน"
  };
  var label = labelByType[type];
  if (!label) return "";

  var lines = [];
  lines.push("NCD Focus PTN - " + label);
  lines.push("ชื่อ: " + (target.name || "-"));
  lines.push("หมู่บ้าน: " + (target.village || "-"));
  lines.push("ผู้รับผิดชอบ: " + (target.responsible_worker || "-"));

  if (type === "addQuarterly" || type === "updateQuarterly") {
    lines.push("รอบ: " + (data.quarter || "-"));
    if (isUrgentQuarterlyLog_(data)) {
      lines.push("สถานะ: ต้องติดตามสุขภาพ");
    }
  } else if (type === "addDailyLog") {
    lines.push("วันที่: " + (data.date || getTodayThaiDate()));
  } else if (type === "updateTarget" && before) {
    var changes = getImportantTargetChanges_(before, data);
    if (changes.length > 0) {
      lines.push("เปลี่ยนแปลง: " + changes.join(", "));
    }
  }

  lines.push("หมายเหตุ: ไม่แสดงค่าตรวจสุขภาพละเอียดในกลุ่ม");
  return lines.join("\n");
}

function sendTelegramMessage_(message) {
  var token = getTelegramBotToken_();
  var chatId = getTelegramChatId_();
  if (!token || !chatId) {
    return { ok: false, error: "ยังไม่ได้ตั้งค่า TELEGRAM_BOT_TOKEN หรือ TELEGRAM_CHAT_ID" };
  }

  try {
    var response = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      payload: JSON.stringify({
        chat_id: chatId,
        text: message,
        disable_web_page_preview: true
      })
    });
    var code = response.getResponseCode();
    var text = response.getContentText();
    if (code >= 200 && code < 300) return { ok: true, response: text };
    return { ok: false, error: "Telegram HTTP " + code + ": " + text };
  } catch (err) {
    return { ok: false, error: err.toString() };
  }
}

function appendNotificationLog_(ss, entry) {
  var sheet = setupNotificationSheet_(ss);
  var headers = getSheetHeaders(sheet);
  var row = headers.map(function(header) {
    if (header === "timestamp") return entry.timestamp || getTimestamp_();
    return entry[header] !== undefined ? entry[header] : "";
  });
  sheet.appendRow(row);
}

function setupNotificationSheet_(ss) {
  var sheet = ss.getSheetByName(NOTIFICATION_LOG_SHEET);
  var headers = ["timestamp", "type", "severity", "target_id", "target_name", "village", "responsible_worker", "message", "channel", "status", "sent_at", "dedupe_key", "error"];
  if (!sheet) {
    sheet = ss.insertSheet(NOTIFICATION_LOG_SHEET);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }

  var currentHeaders = getSheetHeaders(sheet);
  var missingHeaders = headers.filter(function(header) {
    return currentHeaders.indexOf(header) === -1;
  });
  if (missingHeaders.length > 0) {
    sheet.getRange(1, currentHeaders.length + 1, 1, missingHeaders.length).setValues([missingHeaders]);
  }
  return sheet;
}

function toNotificationTarget_(target, reason) {
  return {
    id: target.id || "",
    name: target.name || "",
    village: target.village || "",
    responsible_worker: target.responsible_worker || "ยังไม่ระบุคณะทำงาน",
    reason: reason || ""
  };
}

function getLatestQuarterlyLog_(logs) {
  if (!logs || logs.length === 0) return null;
  var qOrder = { "M0": 1, "M3": 2, "M6": 3, "M9": 4 };
  logs.sort(function(a, b) {
    return (qOrder[a.quarter] || 0) - (qOrder[b.quarter] || 0);
  });
  return logs[logs.length - 1];
}

function isUrgentQuarterlyLog_(log) {
  if (!log) return false;
  var dtx = parseFloat(log.dtx);
  if (!isNaN(dtx) && dtx > 160) return true;
  if (log.bp) {
    var parts = log.bp.toString().split("/");
    var sys = parseInt(parts[0], 10);
    var dia = parts.length > 1 ? parseInt(parts[1], 10) : 0;
    if ((!isNaN(sys) && sys > 140) || (!isNaN(dia) && dia > 90)) return true;
  }
  return false;
}

function getTargetForNotification_(ss, targetId, fallback) {
  fallback = fallback || {};
  if (!targetId) return fallback;
  var sheet = ss.getSheetByName("Targets");
  if (!sheet) return fallback;
  var targets = getSheetData(sheet);
  var found = targets.find(function(target) {
    return parseInt(target.id) === parseInt(targetId);
  });
  return found || fallback;
}

function getImportantTargetChanges_(before, after) {
  var labels = {
    name: "ชื่อ",
    village: "หมู่บ้าน",
    responsible_worker: "ผู้รับผิดชอบ",
    type: "ประเภทกลุ่ม",
    chronic_disease: "โรคประจำตัว",
    co_morbidity: "โรคร่วม"
  };
  return Object.keys(labels).filter(function(key) {
    return after[key] !== undefined && (before[key] || "").toString() !== (after[key] || "").toString();
  }).map(function(key) {
    return labels[key];
  });
}

function rowToObject_(headers, row) {
  var obj = {};
  headers.forEach(function(header, index) {
    obj[header] = row[index];
  });
  return obj;
}

function getTimestamp_() {
  return Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd HH:mm:ss");
}

function formatDateForMessage_(date) {
  var dd = String(date.getDate()).padStart(2, "0");
  var mm = String(date.getMonth() + 1).padStart(2, "0");
  var yyyy = date.getFullYear();
  return dd + "/" + mm + "/" + yyyy;
}

// --- ฟังก์ชันช่วยเหลือ (Helper Functions) ---

// ดึงข้อมูลแถวแรกที่เป็น Header ของ Sheet
function getSheetHeaders(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

// ดึงไอดีลำดับถัดไป (Auto Increment)
function getNextId(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 1;
  var idValue = sheet.getRange(lastRow, 1).getValue();
  return (parseInt(idValue) || lastRow - 1) + 1;
}

// แปลงข้อมูล Sheet เป็น JSON Array
function getSheetData(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1) return [];
  
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0];
  var data = [];
  
  for (var i = 1; i < values.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[i][j];
    }
    data.push(obj);
  }
  return data;
}

// ฟอร์แมต JSON สำหรับความสำเร็จ
function successResponse(data) {
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    data: data
  })).setMimeType(ContentService.MimeType.JSON);
}

// ฟอร์แมต JSON สำหรับกรณีเกิดข้อผิดพลาด
function errorResponse(message) {
  return ContentService.createTextOutput(JSON.stringify({
    success: false,
    error: message
  })).setMimeType(ContentService.MimeType.JSON);
}

// แปลงวันที่ฟอร์แมต DD/MM/YYYY เป็นวัตถุ Date
function parseDate(dateVal) {
  if (!dateVal) return new Date(0);
  if (dateVal instanceof Date) return dateVal;
  
  if (typeof dateVal === "string") {
    var parts = dateVal.split("/");
    if (parts.length === 3) {
      return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
  }
  
  try {
    var d = new Date(dateVal);
    if (!isNaN(d.getTime())) return d;
  } catch (e) {}
  
  return new Date(0);
}

// หาวันที่ปัจจุบันในเขตเวลาไทย (รูปแบบ DD/MM/YYYY)
function getTodayThaiDate() {
  var d = new Date();
  var utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  var thDate = new Date(utc + (3600000 * 7)); // GMT+7
  var dd = String(thDate.getDate()).padStart(2, '0');
  var mm = String(thDate.getMonth() + 1).padStart(2, '0');
  var yyyy = thDate.getFullYear();
  return dd + "/" + mm + "/" + yyyy;
}

// ฟังก์ชันสำหรับตั้งค่าสร้างแผ่นงาน (Tabs) และหัวตาราง (Headers) เริ่มต้นอัตโนมัติ
// สามารถกดเลือกและรันฟังก์ชันนี้จาก Apps Script Editor เพื่อเตรียมความพร้อมของชีตได้ทันที
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    Logger.log("ไม่พบ Google Sheets");
    return;
  }

  setupSheetsForSpreadsheet(ss);
}

function setupSheetsForSpreadsheet(ss) {
  var sheetsConfig = {
    "Targets": ["id", "name", "address", "village", "responsible_worker", "age", "height", "type", "chronic_disease", "co_morbidity", "onset_year", "medicines"],
    "QuarterlyData": ["id", "target_id", "quarter", "date", "weight", "bmi", "waist", "dtx", "bp", "body_fat", "muscle_mass", "visceral_fat", "body_age", "physical_activity", "food_overeat", "food_unhealthy", "food_habit", "remark", "veggie_fruit", "depression_2q", "sleep", "smoking", "alcohol", "hba1c", "egfr", "creatinine", "triglyceride", "ldl", "cholesterol"],
    "DailyLogs": ["id", "target_id", "week", "day", "date", "avoid_sweet", "avoid_oil", "avoid_salt", "menu", "exercise_type", "exercise_duration", "water", "sleep_hours"],
    "NotificationLog": ["timestamp", "type", "severity", "target_id", "target_name", "village", "responsible_worker", "message", "channel", "status", "sent_at", "dedupe_key", "error"]
  };
  
  Object.keys(sheetsConfig).forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    
    // หากชีตยังไม่มีข้อมูล ให้เขียนหัวตาราง (Row 1)
    if (sheet.getLastRow() === 0) {
      var headers = sheetsConfig[sheetName];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      Logger.log("สร้างแผ่นงาน '" + sheetName + "' และเขียนหัวตารางสำเร็จ");
    } else {
      var expectedHeaders = sheetsConfig[sheetName];
      var currentHeaders = getSheetHeaders(sheet);
      var missingHeaders = expectedHeaders.filter(function(header) {
        return currentHeaders.indexOf(header) === -1;
      });

      if (missingHeaders.length > 0) {
        sheet.getRange(1, currentHeaders.length + 1, 1, missingHeaders.length).setValues([missingHeaders]);
        Logger.log("เพิ่มคอลัมน์ที่ขาดในแผ่นงาน '" + sheetName + "': " + missingHeaders.join(", "));
      } else {
        Logger.log("แผ่นงาน '" + sheetName + "' มีหัวตารางครบแล้ว");
      }
    }
  });
  
  Logger.log("ตั้งค่าระบบฐานข้อมูลชีตเสร็จสมบูรณ์!");
}
