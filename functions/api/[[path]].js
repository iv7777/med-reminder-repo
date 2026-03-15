const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
function err(msg, status = 400) { return json({ error: msg }, status); }

async function authenticate(request, DB) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  let userId, pin;
  try { [userId, pin] = atob(token).split(':'); } catch { return null; }
  return await DB.prepare('SELECT * FROM users WHERE id = ? AND pin_hash = ?')
    .bind(userId, pin).first() || null;
}

async function hasAccess(DB, userId, patientId, requireFull = false) {
  const row = await DB.prepare(
    'SELECT access_level FROM user_patient_access WHERE user_id = ? AND patient_id = ?'
  ).bind(userId, patientId).first();
  if (!row) return false;
  if (requireFull && row.access_level !== 'full') return false;
  return true;
}

export async function onRequest(context) {
  const { request, env } = context;
  const DB = env.DB;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === 'OPTIONS') return new Response(null, { headers: CORS });

  // ── AUTH ──────────────────────────────────────────────────────
  if (path === '/api/login' && method === 'POST') {
    const { username, pin } = await request.json();
    const user = await DB.prepare(
      'SELECT id, username, role, display_name FROM users WHERE username = ? AND pin_hash = ?'
    ).bind(username, pin).first();
    if (!user) return err('用户名或密码错误', 401);
    const token = btoa(`${user.id}:${pin}`);
    return json({ token, user });
  }

  // All routes below require auth
  const user = await authenticate(request, DB);
  if (!user) return err('请先登录', 401);

  // ── PATIENTS ──────────────────────────────────────────────────
  if (path === '/api/patients' && method === 'GET') {
    const rows = await DB.prepare(
      `SELECT p.* FROM patients p
       JOIN user_patient_access a ON a.patient_id = p.id
       WHERE a.user_id = ? ORDER BY p.name`
    ).bind(user.id).all();
    return json(rows.results);
  }

  if (path === '/api/patients' && method === 'POST') {
    if (user.role !== 'admin') return err('权限不足', 403);
    const { name, notes } = await request.json();
    const r = await DB.prepare(
      'INSERT INTO patients (name, notes, created_by) VALUES (?,?,?)'
    ).bind(name, notes || '', user.id).run();
    const patient = await DB.prepare('SELECT * FROM patients WHERE id = ?')
      .bind(r.meta.last_row_id).first();
    await DB.prepare(
      'INSERT INTO user_patient_access (user_id, patient_id, access_level) VALUES (?,?,?)'
    ).bind(user.id, patient.id, 'full').run();
    return json(patient, 201);
  }

  // ── SCHEDULE ──────────────────────────────────────────────────
  const schedM = path.match(/^\/api\/patients\/(\d+)\/schedule$/);
  if (schedM && method === 'GET') {
    const pid = parseInt(schedM[1]);
    if (!(await hasAccess(DB, user.id, pid))) return err('无访问权限', 403);
    const blocks = await DB.prepare(
      'SELECT * FROM time_blocks WHERE patient_id = ? ORDER BY sort_order'
    ).bind(pid).all();
    const meds = await DB.prepare(
      `SELECT m.* FROM medications m
       JOIN time_blocks b ON b.id = m.block_id
       WHERE b.patient_id = ? AND m.active = 1 ORDER BY m.sort_order`
    ).bind(pid).all();
    const byBlock = {};
    for (const m of meds.results) {
      if (!byBlock[m.block_id]) byBlock[m.block_id] = [];
      byBlock[m.block_id].push(m);
    }
    return json(blocks.results.map(b => ({ ...b, meds: byBlock[b.id] || [] })));
  }

  // ── TIME BLOCKS ───────────────────────────────────────────────
  if (path === '/api/blocks' && method === 'POST') {
    const { patient_id, label, time_hhmm, context } = await request.json();
    if (!(await hasAccess(DB, user.id, patient_id, true))) return err('无访问权限', 403);
    const ex = await DB.prepare(
      'SELECT MAX(sort_order) as mx FROM time_blocks WHERE patient_id=?'
    ).bind(patient_id).first();
    const r = await DB.prepare(
      'INSERT INTO time_blocks (patient_id,label,time_hhmm,context,sort_order) VALUES (?,?,?,?,?)'
    ).bind(patient_id, label, time_hhmm, context || '', (ex?.mx || 0) + 1).run();
    return json({ id: r.meta.last_row_id }, 201);
  }

  const blockM = path.match(/^\/api\/blocks\/(\d+)$/);
  if (blockM) {
    const blockId = parseInt(blockM[1]);
    const block = await DB.prepare('SELECT * FROM time_blocks WHERE id = ?').bind(blockId).first();
    if (!block) return err('未找到', 404);
    if (!(await hasAccess(DB, user.id, block.patient_id, true))) return err('无访问权限', 403);
    if (method === 'PUT') {
      const { label, time_hhmm, context } = await request.json();
      await DB.prepare('UPDATE time_blocks SET label=?,time_hhmm=?,context=? WHERE id=?')
        .bind(label, time_hhmm, context, blockId).run();
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      await DB.prepare('UPDATE medications SET active=0 WHERE block_id=?').bind(blockId).run();
      await DB.prepare('DELETE FROM time_blocks WHERE id=?').bind(blockId).run();
      return json({ ok: true });
    }
  }

  // ── MEDICATIONS ───────────────────────────────────────────────
  if (path === '/api/medications' && method === 'POST') {
    const { block_id, name, dose, note } = await request.json();
    const block = await DB.prepare('SELECT * FROM time_blocks WHERE id=?').bind(block_id).first();
    if (!block) return err('时间段不存在', 404);
    if (!(await hasAccess(DB, user.id, block.patient_id, true))) return err('无访问权限', 403);
    const ex = await DB.prepare('SELECT MAX(sort_order) as mx FROM medications WHERE block_id=?')
      .bind(block_id).first();
    const r = await DB.prepare(
      'INSERT INTO medications (block_id,name,dose,note,sort_order,active) VALUES (?,?,?,?,?,1)'
    ).bind(block_id, name, dose, note || '', (ex?.mx || 0) + 1).run();
    return json({ id: r.meta.last_row_id }, 201);
  }

  const medM = path.match(/^\/api\/medications\/(\d+)$/);
  if (medM) {
    const medId = parseInt(medM[1]);
    const med = await DB.prepare(
      'SELECT m.*, b.patient_id FROM medications m JOIN time_blocks b ON b.id=m.block_id WHERE m.id=?'
    ).bind(medId).first();
    if (!med) return err('未找到', 404);
    if (!(await hasAccess(DB, user.id, med.patient_id, true))) return err('无访问权限', 403);
    if (method === 'PUT') {
      const { name, dose, note } = await request.json();
      await DB.prepare('UPDATE medications SET name=?,dose=?,note=? WHERE id=?')
        .bind(name, dose, note, medId).run();
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      await DB.prepare('UPDATE medications SET active=0 WHERE id=?').bind(medId).run();
      return json({ ok: true });
    }
  }

  // ── DOSE LOGS ─────────────────────────────────────────────────
  const logsM = path.match(/^\/api\/patients\/(\d+)\/logs$/);
  if (logsM) {
    const pid = parseInt(logsM[1]);
    if (!(await hasAccess(DB, user.id, pid))) return err('无访问权限', 403);

    if (method === 'GET') {
      const date  = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
      const from  = url.searchParams.get('from');
      const to    = url.searchParams.get('to');
      const base  = `SELECT l.*, m.name as med_name, m.dose,
                     b.label as block_label, b.time_hhmm, b.sort_order as b_sort,
                     m.sort_order as m_sort, u.display_name as taken_by_name
                     FROM dose_logs l
                     JOIN medications m ON m.id = l.medication_id
                     JOIN time_blocks b ON b.id = m.block_id
                     LEFT JOIN users u ON u.id = l.taken_by
                     WHERE l.patient_id = ?`;
      let rows;
      if (from && to) {
        rows = await DB.prepare(base + ' AND l.scheduled_date >= ? AND l.scheduled_date <= ? ORDER BY l.scheduled_date DESC, b.sort_order, m.sort_order')
          .bind(pid, from, to).all();
      } else {
        rows = await DB.prepare(base + ' AND l.scheduled_date = ? ORDER BY b.sort_order, m.sort_order')
          .bind(pid, date).all();
      }
      return json(rows.results);
    }

    if (method === 'POST') {
      const { medication_id, scheduled_date, taken, note } = await request.json();
      const taken_at = taken ? new Date().toISOString() : null;
      const existing = await DB.prepare(
        'SELECT id FROM dose_logs WHERE medication_id=? AND patient_id=? AND scheduled_date=?'
      ).bind(medication_id, pid, scheduled_date).first();
      if (existing) {
        await DB.prepare(
          'UPDATE dose_logs SET taken=?,taken_at=?,taken_by=?,note=? WHERE id=?'
        ).bind(taken ? 1 : 0, taken_at, user.id, note || '', existing.id).run();
      } else {
        await DB.prepare(
          'INSERT INTO dose_logs (medication_id,patient_id,scheduled_date,taken,taken_at,taken_by,note) VALUES (?,?,?,?,?,?,?)'
        ).bind(medication_id, pid, scheduled_date, taken ? 1 : 0, taken_at, user.id, note || '').run();
      }
      return json({ ok: true });
    }
  }

  // ── USERS ─────────────────────────────────────────────────────
  if (path === '/api/users' && method === 'GET') {
    if (user.role !== 'admin') return err('权限不足', 403);
    const rows = await DB.prepare(
      'SELECT id,username,role,display_name,created_at FROM users ORDER BY id'
    ).all();
    const access = await DB.prepare(
      'SELECT ua.*,p.name as pname FROM user_patient_access ua JOIN patients p ON p.id=ua.patient_id'
    ).all();
    const byUser = {};
    for (const a of access.results) {
      if (!byUser[a.user_id]) byUser[a.user_id] = [];
      byUser[a.user_id].push(a);
    }
    return json(rows.results.map(u => ({ ...u, access: byUser[u.id] || [] })));
  }

  if (path === '/api/users' && method === 'POST') {
    if (user.role !== 'admin') return err('权限不足', 403);
    const { username, pin, role, display_name, patient_id, access_level } = await request.json();
    const r = await DB.prepare(
      'INSERT INTO users (username,pin_hash,role,display_name) VALUES (?,?,?,?)'
    ).bind(username, pin, role, display_name).run();
    const newId = r.meta.last_row_id;
    if (patient_id) {
      await DB.prepare(
        'INSERT INTO user_patient_access (user_id,patient_id,access_level) VALUES (?,?,?)'
      ).bind(newId, patient_id, access_level || 'view').run();
    }
    return json({ id: newId }, 201);
  }

  const userDelM = path.match(/^\/api\/users\/(\d+)$/);
  if (userDelM && method === 'DELETE') {
    if (user.role !== 'admin') return err('权限不足', 403);
    const uid = parseInt(userDelM[1]);
    await DB.prepare('DELETE FROM user_patient_access WHERE user_id=?').bind(uid).run();
    await DB.prepare('DELETE FROM users WHERE id=?').bind(uid).run();
    return json({ ok: true });
  }

  // ── CHANGE PASSWORD ───────────────────────────────────────────
  const pwdM = path.match(/^\/api\/users\/(\d+)\/password$/);
  if (pwdM && method === 'PUT') {
    const uid = parseInt(pwdM[1]);
    // Users can change their own password; admins can change anyone's
    if (user.id !== uid && user.role !== 'admin') return err('权限不足', 403);
    const { current_pin, new_pin } = await request.json();
    if (!new_pin || new_pin.length < 4) return err('新密码至少需要4位', 400);
    // Non-admins must verify their current password first
    if (user.role !== 'admin') {
      const check = await DB.prepare('SELECT id FROM users WHERE id=? AND pin_hash=?')
        .bind(uid, current_pin).first();
      if (!check) return err('当前密码错误', 401);
    }
    await DB.prepare('UPDATE users SET pin_hash=? WHERE id=?').bind(new_pin, uid).run();
    return json({ ok: true });
  }

  return err('接口不存在', 404);
}
