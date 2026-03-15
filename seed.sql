-- Med Reminder - Seed Data
-- Run: npx wrangler d1 execute med-reminder --file=seed.sql
-- WARNING: Change passwords after first login!

-- Default users
INSERT INTO users (username, pin_hash, role, display_name) VALUES
  ('admin',      'admin1234', 'admin',     '管理员'),
  ('caregiver1', 'care1234',  'caregiver', '家庭护理员'),
  ('patient1',   '1234',      'patient',   '患者');

-- Patient record
INSERT INTO patients (name, notes, created_by) VALUES
  ('帕金森患者', '帕金森病合并心血管疾病', 1);

-- Access control
INSERT INTO user_patient_access (user_id, patient_id, access_level) VALUES
  (1, 1, 'full'),   -- admin: full
  (2, 1, 'full'),   -- caregiver: full
  (3, 1, 'view');   -- patient: view only

-- Time blocks
INSERT INTO time_blocks (patient_id, label, time_hhmm, context, sort_order) VALUES
  (1, '07:30', '07:30', '饭前',   1),
  (1, '08:30', '08:30', '早饭后', 2),
  (1, '12:30', '12:30', '饭前',   3),
  (1, '18:30', '18:30', '晚饭后', 4),
  (1, '20:30', '20:30', '睡前',   5);

-- 07:30 medications
INSERT INTO medications (block_id, name, dose, note, sort_order) VALUES
  (1, '息宁缓释片（Carbidopa/Levodopa）', '50/200mg × 1片', '空腹或饭前30分钟，避免高蛋白', 1),
  (1, '恩他卡朋（柯丹）',                 '200mg × 1片',    '与息宁同服，延长药效',          2),
  (1, '盐酸罗匹尼罗片',                   '0.5mg × 2片',    '可同时服用，控制晨间症状',       3);

-- 08:30 medications
INSERT INTO medications (block_id, name, dose, note, sort_order) VALUES
  (2, '硫酸氢氯吡格雷片', '75mg × 1片', '抗血小板药，防中风或心血管事件',         1),
  (2, '丹心滴丸',         '10颗',       '活血药，可与早餐后其他药一同服用',       2);

-- 12:30 medications
INSERT INTO medications (block_id, name, dose, note, sort_order) VALUES
  (3, '息宁缓释片',         '50/200mg × 1片', '饭前或饭后1小时服用',              1),
  (3, '恩他卡朋（柯丹）',   '200mg × 1片',    '与息宁同服',                       2),
  (3, '盐酸罗匹尼罗片',     '0.5mg × 2片',    '维持午后药效稳定',                 3),
  (3, '盐酸金刚烷胺片',     '100mg × 1片',    '饭后服，减少异动症，提升神经功能', 4);

-- 18:30 medications
INSERT INTO medications (block_id, name, dose, note, sort_order) VALUES
  (4, '盐酸地尔硫卓片',   '30mg × 1片', '降压，饭后服用减少胃部刺激',              1),
  (4, '阿托伐他汀钙片',   '20mg × 1片', '降脂药，早餐后服吸收好',                  2),
  (4, '丹心滴丸',         '10颗',       '建议与氯吡格雷间隔15~30分钟',             3);

-- 20:30 medications
INSERT INTO medications (block_id, name, dose, note, sort_order) VALUES
  (5, '息宁缓释片',       '50/200mg × 1片', '改善夜间僵硬与晨僵',                  1),
  (5, '恩他卡朋（柯丹）', '200mg × 1片',    '与息宁同服，延长夜间药效',            2),
  (5, '盐酸罗匹尼罗片',   '0.5mg × 2片',    '固定睡前服用，改善夜间"关机"与助眠', 3);
