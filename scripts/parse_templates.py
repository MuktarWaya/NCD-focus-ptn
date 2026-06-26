import pandas as pd
import numpy as np
import random
from datetime import datetime, timedelta
import os
import csv

# Set random seed for reproducibility
random.seed(42)
np.random.seed(42)

# Create folders if they don't exist
os.makedirs('scripts', exist_ok=True)
os.makedirs('data', exist_ok=True)

# Thai names for mock data generation
first_names_male = ["สมชาย", "วิชัย", "ประเสริฐ", "นพดล", "เกียรติ", "มนัส", "อภิชาติ", "สุรพล", "ปกรณ์", "ชาญ", "ณรงค์", "มานะ", "สมศักดิ์", "ธีรพล", "เอกชัย", "อนันต์", "สมบัติ", "ปิยะ", "เกรียงไกร", "บุญมี"]
first_names_female = ["สมศรี", "วิภา", "ลัดดา", "จงรัก", "พัชรี", "นงลักษณ์", "วนิดา", "อารีย์", "ยุพา", "สุวรรณา", "รัตนา", "นารี", "ศิริพร", "เพ็ญศรี", "อุบล", "มาลี", "กมลวรรณ", "จินตนา", "ดวงใจ", "ศิรินทร์"]
last_names = ["รักดี", "ใจดี", "เจริญสุข", "รุ่งเรือง", "ดีเลิศ", "มีมาก", "สว่างวงศ์", "สุวรรณเดช", "เลิศวิไล", "มั่นคง", "ทองอนันต์", "ศิริวัฒน์", "ประสิทธิ์", "พัฒนากร", "สมบูรณ์", "แก้วมณี", "สุขสวัสดิ์", "ประเสริฐผล", "คงเหลือ", "ชูจิตต์"]

addresses = [f"{random.randint(1, 150)}/3 ม.1 ต.มายอ อ.มายอ" for _ in range(250)]

def generate_thai_name():
    is_male = random.choice([True, False])
    if is_male:
        return f"นาย{random.choice(first_names_male)} {random.choice(last_names)}"
    else:
        return f"นาง{random.choice(first_names_female)} {random.choice(last_names)}"

# Target counts
total_targets = 200
risk_count = 110
patient_count = 90

targets = []
quarterly_data = []
daily_logs = []

# Chronic diseases for patient group
chronic_diseases_pool = ["DM (เบาหวาน)", "HT (ความดันโลหิตสูง)", "DM + HT", "Dyslipidemia (ไขมันในเลือดสูง)"]
comorbidities_pool = ["ไม่มี", "โรคอ้วน", "โรคหัวใจ", "โรคไตระยะที่ 1", "โรคไตระยะที่ 2"]
medicines_pool = [
    "Metformin (500mg) 1x2 pc", 
    "Amlodipine (5mg) 1x1 od pc", 
    "Losartan (50mg) 1x1 od pc", 
    "Atorvastatin (20mg) 1x1 od hs",
    "Metformin (500mg) 1x2 pc + Amlodipine (5mg) 1x1 od pc"
]

# 1. Generate Targets
target_id_counter = 1

# Generate Risk Group targets
for i in range(risk_count):
    height = round(random.uniform(150.0, 178.0), 1)
    # We want BMI between 23 and 30 for risk group
    bmi = random.uniform(22.0, 31.0)
    weight = round(bmi * ((height / 100) ** 2), 1)
    bmi = round(weight / ((height / 100) ** 2), 1)
    
    age = random.randint(35, 75)
    name = generate_thai_name()
    address = random.choice(addresses)
    
    targets.append({
        "id": target_id_counter,
        "name": name,
        "address": address,
        "age": age,
        "height": height,
        "type": "กลุ่มเสี่ยง",
        "chronic_disease": "ไม่มี",
        "co_morbidity": "โรคอ้วน" if bmi >= 25 else "ไม่มี",
        "onset_year": "-",
        "medicines": "-"
    })
    target_id_counter += 1

# Generate Patient Group targets
for i in range(patient_count):
    height = round(random.uniform(148.0, 175.0), 1)
    bmi = random.uniform(23.0, 33.0)
    weight = round(bmi * ((height / 100) ** 2), 1)
    bmi = round(weight / ((height / 100) ** 2), 1)
    
    age = random.randint(40, 80)
    name = generate_thai_name()
    address = random.choice(addresses)
    
    targets.append({
        "id": target_id_counter,
        "name": name,
        "address": address,
        "age": age,
        "height": height,
        "type": "กลุ่มป่วย",
        "chronic_disease": random.choice(chronic_diseases_pool),
        "co_morbidity": random.choice(comorbidities_pool),
        "onset_year": str(random.randint(2018, 2024)),
        "medicines": random.choice(medicines_pool)
    })
    target_id_counter += 1

# Write Targets to CSV
with open('data/targets.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=["id", "name", "address", "age", "height", "type", "chronic_disease", "co_morbidity", "onset_year", "medicines"])
    writer.writeheader()
    writer.writerows(targets)

# 2. Generate Quarterly Data (Month 0, Month 3, Month 6, Month 9)
quarterly_id_counter = 1
start_date = datetime(2025, 6, 1)

for t in targets:
    t_id = t["id"]
    t_type = t["type"]
    height = t["height"]
    
    # Establish baseline values at Month 0
    baseline_bmi = random.uniform(22.0, 32.0)
    baseline_weight = round(baseline_bmi * ((height / 100) ** 2), 1)
    baseline_waist = round(baseline_weight * 1.1 + random.uniform(-5, 5))
    
    # BP systolic baseline
    if t_type == "กลุ่มป่วย" and "HT" in t["chronic_disease"]:
        baseline_bp_sys = random.randint(135, 160)
    else:
        baseline_bp_sys = random.randint(120, 140)
    baseline_bp_dia = int(baseline_bp_sys * 0.6 + random.randint(5, 10))
    
    # DTX sugar baseline
    if t_type == "กลุ่มป่วย" and "DM" in t["chronic_disease"]:
        baseline_dtx = random.randint(110, 180)
        baseline_hba1c = round(random.uniform(6.5, 9.0), 1)
    else:
        baseline_dtx = random.randint(85, 115)
        baseline_hba1c = 0.0 # Not checked or normal
        
    baseline_fat = round(random.uniform(22.0, 38.0), 1)
    baseline_muscle = round(random.uniform(24.0, 35.0), 1)
    baseline_visceral = random.randint(4, 15)
    baseline_body_age = int(t["age"] + random.randint(-5, 8))
    
    # Lab details (only for patients)
    egfr = round(random.uniform(60.0, 100.0), 1) if t_type == "กลุ่มป่วย" else ""
    creatinine = round(random.uniform(0.6, 1.3), 2) if t_type == "กลุ่มป่วย" else ""
    trigly = random.randint(130, 280) if t_type == "กลุ่มป่วย" else ""
    ldl = random.randint(100, 180) if t_type == "กลุ่มป่วย" else ""
    chlo = random.randint(180, 260) if t_type == "กลุ่มป่วย" else ""

    # Behavior base
    smoking = random.choice(["ไม่สูบ", "ไม่สูบ", "ไม่สูบ", "สูบ"])
    alcohol = random.choice(["ไม่ดื่ม", "ไม่ดื่ม", "ไม่ดื่ม", "ดื่ม"])
    sleep = random.choice(["≥ 7-8 ชม.", "≤ 7-8 ชม."])
    depression = random.choice(["ไม่มี", "ไม่มี", "ไม่มี", "มี"])
    veggie = random.randint(2, 5)

    # Determine trend for this person (70% improve over quarters due to program, 20% stable, 10% get worse)
    trend_type = random.choice(["improve", "improve", "improve", "stable", "worse"])
    
    quarters = ["M0", "M3", "M6", "M9"]
    for q_idx, q in enumerate(quarters):
        q_date = (start_date + timedelta(days=q_idx * 90)).strftime("%d/%m/%Y")
        
        # Calculate trend multiplier
        if trend_type == "improve":
            mult = 1.0 - (q_idx * 0.02) # weight/sugar goes down
            bp_change = - (q_idx * 4)
            dtx_change = - (q_idx * 6)
            fat_change = - (q_idx * 0.8)
            muscle_change = + (q_idx * 0.4)
            pa = ">= 150 นาที" if q_idx > 0 else random.choice([">= 150 นาที", "< 150 นาที"])
            food_overeat = "N" if q_idx > 0 else random.choice(["Y", "N"])
            food_unhealthy = "N" if q_idx > 0 else random.choice(["Y", "N"])
            food_habit = "กินข้าวกล้อง ผักต้ม ปลาช่อนนึ่ง ลดเค็ม" if q_idx > 0 else "กินข้าวเหนียว ของทอด"
        elif trend_type == "worse":
            mult = 1.0 + (q_idx * 0.015) # weight/sugar goes up
            bp_change = + (q_idx * 3)
            dtx_change = + (q_idx * 5)
            fat_change = + (q_idx * 0.6)
            muscle_change = - (q_idx * 0.3)
            pa = "ไม่ออกเลย"
            food_overeat = "Y"
            food_unhealthy = "Y"
            food_habit = "ชอบทานแกงกะทิ ขนมหวาน ชาเย็น"
        else: # stable
            mult = 1.0 + random.uniform(-0.01, 0.01)
            bp_change = random.randint(-3, 3)
            dtx_change = random.randint(-5, 5)
            fat_change = random.uniform(-0.3, 0.3)
            muscle_change = random.uniform(-0.2, 0.2)
            pa = random.choice([">= 150 นาที", "< 150 นาที"])
            food_overeat = random.choice(["Y", "N"])
            food_unhealthy = random.choice(["Y", "N"])
            food_habit = "กินอาหารทั่วไป แกงส้ม ผัดผักข้าวสวย"
            
        w = round(baseline_weight * mult, 1)
        bmi = round(w / ((height / 100) ** 2), 1)
        waist = round(baseline_waist * mult, 1)
        bp_s = max(100, int(baseline_bp_sys + bp_change + random.randint(-2, 2)))
        bp_d = max(60, int(baseline_bp_dia + (bp_change * 0.6) + random.randint(-2, 2)))
        dtx = max(70, int(baseline_dtx + dtx_change + random.randint(-5, 5)))
        
        # HbA1C trend
        hba1c_val = ""
        if t_type == "กลุ่มป่วย" and "DM" in t["chronic_disease"]:
            hba1c_val = round(max(5.5, baseline_hba1c + (dtx_change * 0.04) + random.uniform(-0.2, 0.2)), 1)
            
        fat = round(max(10.0, baseline_fat + fat_change), 1)
        muscle = round(max(15.0, baseline_muscle + muscle_change), 1)
        visceral = max(1, int(baseline_visceral + (fat_change * 0.5)))
        body_age = int(baseline_body_age + (fat_change * 0.8))
        
        quarterly_data.append({
            "id": quarterly_id_counter,
            "target_id": t_id,
            "quarter": q,
            "date": q_date,
            "weight": w,
            "bmi": bmi,
            "waist": waist,
            "dtx": dtx,
            "bp": f"{bp_s}/{bp_d}",
            "body_fat": fat,
            "muscle_mass": muscle,
            "visceral_fat": visceral,
            "body_age": body_age,
            "physical_activity": pa,
            "food_overeat": food_overeat,
            "food_unhealthy": food_unhealthy,
            "food_habit": food_habit,
            "remark": "เข้าร่วมกิจกรรมครบ" if trend_type == "improve" else "ไม่ค่อยเข้าร่วมกิจกรรม",
            "veggie_fruit": veggie,
            "depression_2q": depression,
            "sleep": sleep,
            "smoking": smoking,
            "alcohol": alcohol,
            "hba1c": hba1c_val,
            "egfr": egfr,
            "creatinine": creatinine,
            "triglyceride": trigly,
            "ldl": ldl,
            "cholesterol": chlo
        })
        quarterly_id_counter += 1

# Write Quarterly Data to CSV
with open('data/quarterly_data.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=[
        "id", "target_id", "quarter", "date", "weight", "bmi", "waist", "dtx", "bp", 
        "body_fat", "muscle_mass", "visceral_fat", "body_age", "physical_activity", 
        "food_overeat", "food_unhealthy", "food_habit", "remark", "veggie_fruit", 
        "depression_2q", "sleep", "smoking", "alcohol", "hba1c", "egfr", "creatinine", 
        "triglyceride", "ldl", "cholesterol"
    ])
    writer.writeheader()
    writer.writerows(quarterly_data)

# 3. Generate Daily Logs for a subset of targets (first 10 targets, 14 days of logs each)
daily_id_counter = 1
days_of_week = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"]
menus = ["แกงจืดเต้าหู้หมูสับใส่ผักกาดขาว", "สลัดผักอกไก่ไข่ต้ม", "ปลาช่อนนึ่งแจ่วพร้อมผักลวก", "ต้มยำปลานิลน้ำใสใส่เห็ด", "แกงส้มมะละกอกุ้งสด", "ยำวุ้นเส้นอกไก่สับลดโซเดียม", "น้ำพริกปลาทูผักลวก", "ต้มจืดวุ้นเส้นอกไก่"]
exercises = ["เดินเร็ว", "วิ่งเหยาะๆ", "ปั่นจักรยาน", "โยคะ", "ฮูล่าฮูป", "-"]

for t_id in range(1, 16):  # First 15 targets
    log_start_date = datetime(2025, 9, 1)
    for day_idx in range(14):  # 2 weeks
        log_date = log_start_date + timedelta(days=day_idx)
        week_num = f"สัปดาห์ที่ {day_idx // 7 + 1}"
        day_name = days_of_week[log_date.weekday()]
        
        avoid_sweet = random.randint(3, 5)
        avoid_oil = random.randint(2, 5)
        avoid_salt = random.randint(3, 5)
        menu = random.choice(menus)
        ex = random.choice(exercises)
        ex_dur = 0 if ex == "-" else random.choice([20, 30, 45, 60])
        water = random.randint(6, 10)
        sleep_h = random.choice([6.0, 6.5, 7.0, 7.5, 8.0, 8.5])
        
        daily_logs.append({
            "id": daily_id_counter,
            "target_id": t_id,
            "week": week_num,
            "day": day_name,
            "date": log_date.strftime("%d/%m/%Y"),
            "avoid_sweet": avoid_sweet,
            "avoid_oil": avoid_oil,
            "avoid_salt": avoid_salt,
            "menu": menu,
            "exercise_type": ex,
            "exercise_duration": ex_dur,
            "water": water,
            "sleep_hours": sleep_h
        })
        daily_id_counter += 1

# Write Daily Logs to CSV
with open('data/daily_logs.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=[
        "id", "target_id", "week", "day", "date", "avoid_sweet", "avoid_oil", 
        "avoid_salt", "menu", "exercise_type", "exercise_duration", "water", "sleep_hours"
    ])
    writer.writeheader()
    writer.writerows(daily_logs)

print("Mock data generation completed successfully!")
print(f"Generated {len(targets)} targets.")
print(f"Generated {len(quarterly_data)} quarterly tracking entries.")
print(f"Generated {len(daily_logs)} daily behavior logs.")
