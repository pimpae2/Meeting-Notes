# PROMPTNOTE พร้อมโน๊ต

Chrome Extension แบบ Side Panel สำหรับจดโน้ตระหว่างประชุม และส่งโน้ตเข้า Google Sheets

หน้าพาเนลใช้ dark theme สีดำหม่น เพื่อลดความเด่นบนหน้าจอเวลานำเสนอ

## ใช้งาน

1. เปิด `chrome://extensions`
2. เปิด Developer mode
3. กด Load unpacked แล้วเลือกโฟลเดอร์ `D:\Dev\Meeting-Notes`
4. กดไอคอน PROMPTNOTE บนแถบ Chrome เพื่อเปิด Side Panel

## โหมด Note

กรอกหัวข้อ รายละเอียด และลิงก์ แล้วกดบันทึก โน้ตจะถูกเก็บไว้ในเครื่องผ่าน Chrome storage

## โหมด Sheet

Extension ตั้งค่า Google Sheet เริ่มต้นเป็น:

`https://docs.google.com/spreadsheets/d/1luIsRBcM14cXsuj1xtHc33eZ44oar6Iv6JshyjZtC2s/edit?gid=1425714802#gid=1425714802`

เมื่อกดบันทึก ระบบจะเพิ่มเป็นแถวใหม่เสมอ ไม่เขียนทับข้อมูลเก่า

คอลัมน์ A ใช้สำหรับเลขลำดับอัตโนมัติ ระบบจะอ่านเลขล่าสุดในคอลัมน์ A แล้วใส่เลขถัดไปให้เอง

คอลัมน์ E ใช้สำหรับระบบจาก URL อัตโนมัติ:

- Port `8095`: DMS
- Port `8096`: SLF
- Port `8098`: SLF
- Port `8097`: LCS

ค่าเริ่มต้นของคอลัมน์คือ:

- หัวข้อ: คอลัมน์ B
- รายละเอียด: คอลัมน์ C
- ระบบจาก URL: คอลัมน์ E
- ลิงก์: คอลัมน์ F

สามารถเปลี่ยนคอลัมน์ได้โดยกดไอคอนตั้งค่าข้างช่อง Google Sheet URL ในโหมด Sheet เช่น เปลี่ยนหัวข้อเป็น `G`, รายละเอียดเป็น `H`, หรือลิงก์เป็น `AA`

## ต้องแชร์ Sheet แบบไหน

Extension เขียน Sheet ด้วยบัญชี Google ที่ผู้ใช้ล็อกอินผ่าน Chrome/OAuth

- ถ้าใช้บัญชีเจ้าของ Sheet อยู่แล้ว ไม่ต้องเปิดแชร์สาธารณะ
- ถ้าใช้บัญชีอื่น ให้แชร์ Sheet ให้บัญชีนั้นเป็น Editor
- ไม่แนะนำให้ตั้ง Anyone with the link เป็น Editor เว้นแต่เป็น Sheet ชั่วคราวหรือไม่สำคัญ
- ถ้าตั้ง Anyone with the link เป็น Viewer หรือ Commenter จะเขียนข้อมูลไม่ได้

## ตั้งค่า Google OAuth

โหมด Sheet ใช้ Google Sheets API และต้องตั้งค่า OAuth ก่อน

1. โหลด extension แบบ unpacked แล้วคัดลอก Extension ID จาก `chrome://extensions`
2. ไปที่ Google Cloud Console แล้วสร้าง OAuth client แบบ Chrome Extension
3. ใส่ Extension ID ที่คัดลอกไว้
4. นำ client ID ที่ได้มาใส่ใน `manifest.json` ตรง `oauth2.client_id`
5. Reload extension ใน `chrome://extensions`
6. เปิด Side Panel เลือก Sheet แล้วกดบันทึกครั้งแรก Chrome จะให้ล็อกอิน/อนุญาตสิทธิ์ Google
