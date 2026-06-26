---
name: NCDs Focus Design System
description: Design tokens and styling guides for the health behavior tracking dashboard, optimized for Google Sites embedding and Google Stitch canvas.
tokens:
  colors:
    primary: "#0ea5e9"        # Teal/Sky Blue (Main branding, trust, medical)
    primary_light: "#f0f9ff"  # Light blue highlights
    secondary: "#6366f1"      # Indigo (Secondary actions, daily logs)
    success: "#10b981"        # Emerald (Improved metrics, positive outcomes)
    success_light: "#ecfdf5"  # Light green background
    warning: "#f59e0b"        # Amber Yellow (Risk groups, alert warnings)
    warning_light: "#fef3c7"  # Light yellow background
    danger: "#ef4444"         # Coral Red (Patient groups, urgent alerts)
    danger_light: "#fef2f2"   # Light red background
    surface: "#ffffff"        # Cards and panels (semi-transparent in glassmorphism)
    background: "#f4f6fa"     # Base background color
    text_main: "#0f172a"      # High contrast text (dark slate)
    text_muted: "#64748b"     # Muted text (slate gray)
  typography:
    font_primary: "'Outfit', 'Sarabun', sans-serif"
  radius:
    card: "20px"
    button: "12px"
    badge: "9999px"
  shadows:
    card: "0 8px 32px 0 rgba(31, 38, 135, 0.05)"
    button: "0 4px 12px rgba(14, 165, 233, 0.2)"
  glass:
    blur: "12px"
    border: "rgba(255, 255, 255, 0.4)"
---

# NCDs Focus App - Brand Design System

เอกสารนี้ระบุข้อกำหนดในการออกแบบสำหรับระบบติดตามพฤติกรรมสุขภาพ "มุ่งเป้าปัตตานี" โดยมุ่งเน้นความเป็นมืออาชีพ น่าเชื่อถือ และใช้งานง่ายสำหรับเจ้าหน้าที่สาธารณสุขและ อสม.

## ดีไซน์และบรรยากาศ (Design Aesthetics & Vibe)

1. **ความเป็นมิตรและน่าเชื่อถือ (Trustworthy & Clean)**:
   - ใช้สีฟ้า Teal/Sky Blue (`primary`) ร่วมกับสีขาวสะท้อนความสะอาดและเป็นมิตรทางการแพทย์
   - การแบ่งสีระบุความเสี่ยงที่ชัดเจน ได้แก่ เหลืองส้มเตือนภัย (`warning`) และสีแดงเมื่อค่าน้ำตาล/ความดันวิกฤต (`danger`)
2. **ความพรีเมียมโปร่งแสง (Premium Glassmorphism)**:
   - ตกแต่งพื้นผิวการ์ดและพาเนลให้มีลักษณะคล้ายกระจกฝ้าโปร่งแสง (`glass: blur`) 
   - ขอบการ์ดบางเบาสะท้อนแสง (`glass: border`) บนพื้นหลังสีโทนเย็นอ่อน เพื่อให้ดูมีมิติหรูหรา
3. **การเข้ากันได้ของฟอนต์ (Typography harmony)**:
   - ตัวเลขละตินและภาษาอังกฤษใช้ฟอนต์ **Outfit** ที่ดูโมเดิร์น สะอาดตา
   - ภาษาไทยใช้ฟอนต์ **Sarabun** ที่อ่านง่าย เหมาะสำหรับการบันทึกและตรวจสอบข้อมูลทางการแพทย์
4. **ความอ่อนโยนของทรงการ์ด (Soft Rounded Edges)**:
   - ใช้ความโค้งมนขนาดใหญ่ (`radius: card: 20px`) เพื่อให้การแสดงผลดูสบายตา ไม่แข็งกระด้าง
   - ปุ่มมีความโค้งมนกระชับ (`radius: button: 12px`) และมีเงาสะท้อนระดับไมโคร (`shadows: button`)
