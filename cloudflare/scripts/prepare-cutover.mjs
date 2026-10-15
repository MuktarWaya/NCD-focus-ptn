import fs from 'node:fs/promises';
import path from 'node:path';
const [backupPath,privateDirectory,newUrl]=process.argv.slice(2);
if(!newUrl?.startsWith('https://')||!privateDirectory)throw Error('Usage: prepare-cutover.mjs PRIVATE_APPS_BACKUP PRIVATE_DIRECTORY VERIFIED_NEW_URL');
const backup=JSON.parse(await fs.readFile(backupPath,'utf8'));
const server=backup.content.files.filter(f=>f.type==='SERVER_JS');if(server.length!==1)throw Error('Unexpected Apps Script layout');
const adminToken=crypto.randomUUID()+crypto.randomUUID();
let source=server[0].source.replace('function doPost(e) {','function legacyDoPost(e) {').replace('function sendDailyTelegramSummary() {','function legacySendDailyTelegramSummary() {');
if(source===server[0].source)throw Error('Cannot install write freeze');
source+=`
// Final migration guard: legacy reads remain available, legacy writes and scheduled notifications stop.
function sendDailyTelegramSummary() { return errorResponse('ย้ายการแจ้งเตือนไป Cloudflare แล้ว'); }
function doPost(e) {
  try {
    var payload=JSON.parse(e.postData.contents);
    if(payload.action==='migrationExport' && payload.migrationToken===${JSON.stringify(adminToken)} && payload.passcode===getApiPasscode()) {
      var ss=SpreadsheetApp.getActiveSpreadsheet();
      var archive={};
      ['Targets','QuarterlyData','DailyLogs','OSM','NotificationLog'].forEach(function(name){
        var sheet=ss.getSheetByName(name);
        archive[name]={values:sheet?sheet.getDataRange().getValues():[]};
      });
      return successResponse({
        targets:getSheetData(ss.getSheetByName('Targets')),
        quarterly:getSheetData(ss.getSheetByName('QuarterlyData')),
        dailyLogs:getSheetData(ss.getSheetByName('DailyLogs')),
        workers:readOsmWorkers(ss),archive:archive,
        notificationsConfigured:!!(getTelegramBotToken_()&&getTelegramChatId_()),
        telegramToken:getTelegramBotToken_(),telegramChatId:getTelegramChatId_(),
        frozen:true
      });
    }
    if(['addTarget','updateTarget','addQuarterly','addDailyLog'].indexOf(payload.action)!==-1) {
      return errorResponse('ระบบเดิมหยุดรับบันทึกเพื่อย้ายข้อมูล กรุณาใช้ระบบใหม่ ${newUrl} หลังผู้ดูแลแจ้งเปิดใช้งาน ข้อมูลในฟอร์มยังอยู่');
    }
    return legacyDoPost(e);
  }catch(error){return errorResponse('ไม่สามารถประมวลผลคำขอได้');}
}
`;
await fs.writeFile(path.join(privateDirectory,'freeze-source.js'),source);
await fs.writeFile(path.join(privateDirectory,'cutover-admin.json'),JSON.stringify({adminToken,newUrl,preparedAt:new Date().toISOString()}));
console.log('Prepared private write-freeze source and admin export token; not deployed');
