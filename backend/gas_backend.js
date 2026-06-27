/**
 * Google Apps Script Web App Backend
 * สำหรับแอปพลิเคชันติดตามพฤติกรรมสุขภาพ "มุ่งเป้าปัตตานี"
 * ทำหน้าที่เป็น REST API สำหรับอ่านและบันทึกข้อมูลใน Google Sheets
 */

// ตั้งค่าใน Apps Script: Project Settings -> Script properties -> API_PASSCODE
function getApiPasscode() {
  return PropertiesService.getScriptProperties().getProperty("API_PASSCODE") || "";
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

  var activeVillages = ["หมู่ 2 บ้านตรัง", "หมู่ 3 บ้านเขาวัง", "หมู่ 4 บ้านม่วงเงิน"];
  var villageSummary = activeVillages.map(function(village) {
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
    villageSummary: villageSummary
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
      // พบแถวเป้าหมาย อัปเดตคอลัมน์ที่ส่งมา
      headers.forEach(function(header, colIdx) {
        if (data[header] !== undefined && header !== "id") {
          sheet.getRange(i + 1, colIdx + 1).setValue(data[header]);
        }
      });
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

  var activeVillages = ["หมู่ 2 บ้านตรัง", "หมู่ 3 บ้านเขาวัง", "หมู่ 4 บ้านม่วงเงิน"];
  var updatedRows = [];

  for (var i = 1; i < rows.length; i++) {
    var address = rows[i][addressColIdx] ? rows[i][addressColIdx].toString() : "";
    var addressOnly = address.split(/\s+/)[0];
    var village = activeVillages[(i - 1) % activeVillages.length];
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
  if (idColIdx === -1 || addressColIdx === -1 || villageColIdx === -1) {
    return errorResponse("ไม่พบคอลัมน์ id, address หรือ village ในแผ่นงาน Targets");
  }

  var locationById = {};
  locations.forEach(function(item) {
    locationById[parseInt(item.id)] = {
      address: item.address || "",
      village: item.village || ""
    };
  });

  var updated = 0;
  var addressValues = [];
  var villageValues = [];

  for (var i = 1; i < rows.length; i++) {
    var id = parseInt(rows[i][idColIdx]);
    var location = locationById[id];
    if (location) {
      addressValues.push([location.address]);
      villageValues.push([location.village]);
      updated++;
    } else {
      addressValues.push([rows[i][addressColIdx]]);
      villageValues.push([rows[i][villageColIdx]]);
    }
  }

  var addressRange = sheet.getRange(2, addressColIdx + 1, addressValues.length, 1);
  var villageRange = sheet.getRange(2, villageColIdx + 1, villageValues.length, 1);
  addressRange.setNumberFormat("@");
  villageRange.setNumberFormat("@");
  addressRange.setValues(addressValues);
  villageRange.setValues(villageValues);

  return successResponse({
    message: "อัปเดตบ้านเลขที่และหมู่บ้านตาม ID เรียบร้อยแล้ว",
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
        return successResponse({ message: "อัปเดตข้อมูลรอบ " + data.quarter + " เรียบร้อยแล้ว (เขียนทับข้อมูลเดิม)", id: rows[i][headers.indexOf("id")] });
      }
    }
  }

  var newRow = headers.map(function(header) {
    return data[header] !== undefined ? data[header] : "";
  });
  
  sheet.appendRow(newRow);
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
  return successResponse({ message: "บันทึกพฤติกรรมสุขภาพรายวันเรียบร้อยแล้ว", id: nextId });
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
    "Targets": ["id", "name", "address", "village", "age", "height", "type", "chronic_disease", "co_morbidity", "onset_year", "medicines"],
    "QuarterlyData": ["id", "target_id", "quarter", "date", "weight", "bmi", "waist", "dtx", "bp", "body_fat", "muscle_mass", "visceral_fat", "body_age", "physical_activity", "food_overeat", "food_unhealthy", "food_habit", "remark", "veggie_fruit", "depression_2q", "sleep", "smoking", "alcohol", "hba1c", "egfr", "creatinine", "triglyceride", "ldl", "cholesterol"],
    "DailyLogs": ["id", "target_id", "week", "day", "date", "avoid_sweet", "avoid_oil", "avoid_salt", "menu", "exercise_type", "exercise_duration", "water", "sleep_hours"]
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
