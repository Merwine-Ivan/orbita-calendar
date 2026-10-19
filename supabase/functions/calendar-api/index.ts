// src/model.mjs
var subjects = ["\u0410\u043D\u0433\u043B\u0438\u0439\u0441\u043A\u0438\u0439", "\u041A\u0438\u0442\u0430\u0439\u0441\u043A\u0438\u0439", "\u041F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435"];
var dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function duration(start, end) {
  return (Number(end.slice(0, 2)) * 60 + Number(end.slice(3)) - Number(start.slice(0, 2)) * 60 - Number(start.slice(3))) / 60;
}
function validateLesson(l) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(l.date) || dateKey(/* @__PURE__ */ new Date(`${l.date}T12:00:00`)) !== l.date) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0443\u044E \u0434\u0430\u0442\u0443");
  if (![l.start, l.end].every((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || duration(l.start, l.end) <= 0) throw Error("\u041E\u043A\u043E\u043D\u0447\u0430\u043D\u0438\u0435 \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u043F\u043E\u0437\u0436\u0435 \u043D\u0430\u0447\u0430\u043B\u0430");
  if (!["planned", "done", "cancelled"].includes(l.status)) throw Error("\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u0441\u0442\u0430\u0442\u0443\u0441");
  if (typeof l.report !== "string" || l.report.length > 1e4) throw Error("\u041E\u0442\u0447\u0451\u0442 \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u043A\u043E\u0440\u043E\u0447\u0435 10 000 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432");
}

// src/roles.mjs
var isManager = (role) => role === "owner" || role === "admin";
var canCreateAccount = (actor, role) => actor === "owner" && ["admin", "teacher"].includes(role) || actor === "admin" && role === "teacher";
var canManageAccount = (actor, target) => actor === "owner" && ["admin", "teacher"].includes(target) || actor === "admin" && target === "teacher";
var canTeachGroup = (user, group) => Boolean(user && group && (isManager(user.role) || user.role === "teacher" && group.teacherId === user.id && (group.createdBy === user.id || user.subjects?.includes(group.subject) || !subjects.includes(group.subject))));

// src/student.mjs
var contactKeys = ["code", "phone", "guardianName", "guardianPhone", "age", "gender"];
function studentRecord(s) {
  if (!s || typeof s !== "object" || Array.isArray(s)) throw Error("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443 \u0443\u0447\u0435\u043D\u0438\u043A\u0430");
  if (typeof s.name !== "string" || !s.name.trim() || s.name.trim().length > 240) throw Error("\u0424\u0418\u041E \u0443\u0447\u0435\u043D\u0438\u043A\u0430: \u043E\u0442 1 \u0434\u043E 240 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432");
  const out = { id: s.id, name: s.name.trim() };
  for (const [key, max] of [["code", 80], ["phone", 30], ["guardianPhone", 30], ["guardianName", 120]]) if (s[key] != null && s[key] !== "") {
    if (typeof s[key] !== "string" || s[key].length > max || /[\x00-\x1f\x7f]/.test(s[key])) throw Error("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0443\u0447\u0435\u043D\u0438\u043A\u0430");
    const v = s[key].trim();
    if (key.toLowerCase().includes("phone") && !/^\+?[\d ()-]{5,30}$/.test(v)) throw Error("\u0422\u0435\u043B\u0435\u0444\u043E\u043D: \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u0446\u0438\u0444\u0440\u044B, +, \u0441\u043A\u043E\u0431\u043A\u0438 \u0438 \u0434\u0435\u0444\u0438\u0441");
    if (v) out[key] = v;
  }
  if (s.age !== void 0 && s.age !== null && s.age !== "") {
    const age = Number(s.age);
    if (!Number.isInteger(age) || age < 0 || age > 120) throw Error("\u0412\u043E\u0437\u0440\u0430\u0441\u0442: \u0446\u0435\u043B\u043E\u0435 \u0447\u0438\u0441\u043B\u043E \u043E\u0442 0 \u0434\u043E 120");
    out.age = age;
  }
  if (s.gender) {
    if (!["female", "male", "unspecified"].includes(s.gender)) throw Error("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043F\u043E\u043B \u0443\u0447\u0435\u043D\u0438\u043A\u0430");
    out.gender = s.gender;
  }
  return out;
}
function visibleStudent(s, privateAccess) {
  if (privateAccess) return s;
  return { id: s.id, name: s.name, ...s.code ? { code: s.code } : {} };
}

// src/group-import.mjs
function parseGroupImport(input) {
  if (typeof input !== "string" || input.length > 1e6) throw Error("\u0424\u0430\u0439\u043B \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u0442\u0435\u043A\u0441\u0442\u043E\u0432\u044B\u043C CSV \u0440\u0430\u0437\u043C\u0435\u0440\u043E\u043C \u0434\u043E 1 \u041C\u0411");
  const text = input.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/, 1)[0];
  const separator = first.includes(";") ? ";" : first.includes("	") ? "	" : ",";
  const rows = [];
  let row = [], cell = "", quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else cell += c;
      continue;
    }
    if (c === '"') {
      if (cell || closed) throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0435 \u043A\u0430\u0432\u044B\u0447\u043A\u0438 \u0432 CSV");
      quoted = true;
    } else if (c === separator) {
      row.push(cell);
      cell = "";
      closed = false;
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
      closed = false;
    } else {
      if (closed && !/\s/.test(c)) throw Error("\u0422\u0435\u043A\u0441\u0442 \u043F\u043E\u0441\u043B\u0435 \u0437\u0430\u043A\u0440\u044B\u0432\u0430\u044E\u0449\u0435\u0439 \u043A\u0430\u0432\u044B\u0447\u043A\u0438");
      if (!closed) cell += c;
    }
  }
  if (quoted) throw Error("\u041D\u0435 \u0437\u0430\u043A\u0440\u044B\u0442\u0430 \u043A\u0430\u0432\u044B\u0447\u043A\u0430 \u0432 CSV");
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  if (rows.length < 2) throw Error("\u041D\u0443\u0436\u043D\u044B \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A \u0438 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u043D\u0430 \u0441\u0442\u0440\u043E\u043A\u0430 \u0434\u0430\u043D\u043D\u044B\u0445");
  const header = rows.shift().map((x) => x.trim().toLowerCase());
  const required = ["group", "subject", "teacher_login", "student_code", "student_name"];
  if (new Set(header).size !== header.length || required.some((k) => !header.includes(k))) throw Error("\u041D\u0443\u0436\u043D\u044B \u0443\u043D\u0438\u043A\u0430\u043B\u044C\u043D\u044B\u0435 \u043A\u043E\u043B\u043E\u043D\u043A\u0438 group, subject, teacher_login, student_code, student_name");
  const grouped = /* @__PURE__ */ new Map();
  let studentCount = 0, duplicateRows = 0;
  const short = (s, max) => typeof s === "string" && s.trim().length > 0 && s.trim().length <= max && !/[\u0000-\u001f\u007f]/.test(s);
  rows.forEach((values, index) => {
    const fail2 = (message) => {
      throw Error(`\u0421\u0442\u0440\u043E\u043A\u0430 ${index + 2}: ${message}`);
    };
    if (values.length !== header.length) fail2("\u0447\u0438\u0441\u043B\u043E \u043F\u043E\u043B\u0435\u0439 \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u0435\u0442 \u0441 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u043E\u043C");
    const r = Object.fromEntries(header.map((k, i) => [k, values[i].trim()]));
    if (!short(r.group, 120) || !short(r.subject, 80)) fail2("\u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0433\u0440\u0443\u043F\u043F\u0443 \u0438 \u043F\u0440\u0435\u0434\u043C\u0435\u0442");
    if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(r.teacher_login)) fail2("\u043D\u0443\u0436\u0435\u043D \u043B\u043E\u0433\u0438\u043D \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0435\u0433\u043E \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044F");
    if (!short(r.student_code, 80) || !short(r.student_name, 240)) fail2("\u043D\u0443\u0436\u043D\u044B \u0432\u043D\u0443\u0442\u0440\u0435\u043D\u043D\u0438\u0439 \u043A\u043E\u0434 \u0438 \u0438\u043C\u044F \u0443\u0447\u0435\u043D\u0438\u043A\u0430");
    const key = r.group.toLocaleLowerCase("ru-RU");
    let g = grouped.get(key);
    if (!g) {
      g = { name: r.group, subject: r.subject, teacherLogin: r.teacher_login.toLowerCase(), students: [], schedule: [], lessons: [] };
      grouped.set(key, g);
    }
    if (g.subject !== r.subject || g.teacherLogin !== r.teacher_login.toLowerCase()) fail2("\u0434\u043B\u044F \u043E\u0434\u043D\u043E\u0439 \u0433\u0440\u0443\u043F\u043F\u044B \u0443\u043A\u0430\u0437\u0430\u043D\u044B \u0440\u0430\u0437\u043D\u044B\u0435 \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u044B \u0438\u043B\u0438 \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u0438");
    const student = g.students.find((s) => s.code === r.student_code);
    if (student && student.name !== r.student_name) fail2("\u0443 \u043E\u0434\u043D\u043E\u0433\u043E \u043A\u043E\u0434\u0430 \u0443\u0447\u0435\u043D\u0438\u043A\u0430 \u0440\u0430\u0437\u043D\u044B\u0435 \u0438\u043C\u0435\u043D\u0430");
    let incoming;
    try {
      incoming = studentRecord({ name: r.student_name, code: r.student_code, phone: r.phone, guardianName: r.guardian_name, guardianPhone: r.guardian_phone, age: r.age, gender: { \u043C: "male", \u0436: "female", male: "male", female: "female", "\u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D": "unspecified" }[(r.gender || "").toLowerCase()] || r.gender });
      delete incoming.id;
    } catch (e) {
      fail2(e.message);
    }
    if (!student) {
      g.students.push(incoming);
      studentCount++;
    } else {
      for (const [k, v] of Object.entries(incoming)) {
        if (student[k] != null && student[k] !== v) fail2("\u043F\u0440\u043E\u0442\u0438\u0432\u043E\u0440\u0435\u0447\u0438\u0432\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0443\u0447\u0435\u043D\u0438\u043A\u0430");
        student[k] = v;
      }
      duplicateRows++;
    }
    if (g.students.length > 100) fail2("\u0432 \u0433\u0440\u0443\u043F\u043F\u0435 \u0431\u043E\u043B\u044C\u0448\u0435 100 \u0443\u0447\u0435\u043D\u0438\u043A\u043E\u0432");
    const slot = [r.day, r.start, r.end].map((x) => x || "");
    if (r.date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || (/* @__PURE__ */ new Date(`${r.date}T12:00:00Z`)).toISOString().slice(0, 10) !== r.date || !slot.slice(1).every((x) => /^([01]\d|2[0-3]):[0-5]\d$/.test(x)) || duration(slot[1], slot[2]) <= 0) fail2("\u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0434\u0430\u0442\u0443 \u0438 \u0432\u0440\u0435\u043C\u044F \u0437\u0430\u043D\u044F\u0442\u0438\u044F");
      const status = r.status || "planned";
      if (!["planned", "done", "cancelled"].includes(status)) fail2("status: planned, done \u0438\u043B\u0438 cancelled");
      if (r.attendance && !["present", "absent", "excused"].includes(r.attendance)) fail2("attendance: present, absent \u0438\u043B\u0438 excused");
      if ((r.report || "").length > 1e4) fail2("\u043E\u0442\u0447\u0451\u0442 \u0434\u043B\u0438\u043D\u043D\u0435\u0435 10000 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432");
      let lesson = g.lessons.find((l) => l.date === r.date && l.start === r.start);
      if (lesson && (lesson.end !== r.end || lesson.status !== status || lesson.report !== (r.report || ""))) fail2("\u0443 \u043E\u0434\u043D\u043E\u0433\u043E \u0437\u0430\u043D\u044F\u0442\u0438\u044F \u0440\u0430\u0437\u043D\u044B\u0435 \u0432\u0440\u0435\u043C\u044F, \u0441\u0442\u0430\u0442\u0443\u0441 \u0438\u043B\u0438 \u043E\u0442\u0447\u0451\u0442");
      if (!lesson) {
        lesson = { date: r.date, start: r.start, end: r.end, status, report: r.report || "", attendance: {} };
        g.lessons.push(lesson);
      }
      if (r.attendance) {
        if (lesson.attendance[r.student_code] && lesson.attendance[r.student_code] !== r.attendance) fail2("\u043F\u0440\u043E\u0442\u0438\u0432\u043E\u0440\u0435\u0447\u0438\u0432\u044B\u0435 \u043E\u0442\u043C\u0435\u0442\u043A\u0438 \u043F\u043E\u0441\u0435\u0449\u0430\u0435\u043C\u043E\u0441\u0442\u0438");
        lesson.attendance[r.student_code] = r.attendance;
      }
    } else if (slot.some(Boolean)) {
      if (!/^[0-6]$/.test(slot[0]) || !slot.slice(1).every((x) => /^([01]\d|2[0-3]):[0-5]\d$/.test(x)) || duration(slot[1], slot[2]) <= 0) fail2("\u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435: day \u043E\u0442 0 (\u0432\u0441) \u0434\u043E 6 (\u0441\u0431), start/end \u0432 \u0444\u043E\u0440\u043C\u0430\u0442\u0435 \u0427\u0427:\u041C\u041C");
      const old = g.schedule.find((s) => s.day === Number(slot[0]) && s.start === slot[1]);
      if (old && old.end !== slot[2]) fail2("\u0440\u0430\u0437\u043D\u043E\u0435 \u043E\u043A\u043E\u043D\u0447\u0430\u043D\u0438\u0435 \u0443 \u043E\u0434\u043D\u043E\u0433\u043E \u0432\u0440\u0435\u043C\u0435\u043D\u0438 \u0433\u0440\u0443\u043F\u043F\u044B");
      if (!old) g.schedule.push({ day: Number(slot[0]), start: slot[1], end: slot[2] });
    }
  });
  return { groups: [...grouped.values()], studentCount, sourceRows: rows.length, duplicateRows };
}

// src/data-transfer.mjs
var uuid = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
var plain = (v) => v && typeof v === "object" && !Array.isArray(v);
var norm = (v) => v.trim().toLocaleLowerCase("ru-RU");
function stable(v) {
  return JSON.stringify(v, function(k, x) {
    return plain(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x;
  });
}
async function digest(v) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stable(v))))].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function idFor(seed) {
  const x = await digest(seed);
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-4${x.slice(13, 16)}-a${x.slice(17, 20)}-${x.slice(20, 32)}`;
}
function equivalent(a, b) {
  const clean = (x) => {
    const { version, ...rest } = x;
    return rest;
  };
  return stable(clean(a)) === stable(clean(b));
}
function validateGroup(g, allowHistorical = false) {
  if (!plain(g) || !uuid(g.id) || typeof g.name !== "string" || !g.name.trim() || g.name.length > 120 || typeof g.subject !== "string" || !g.subject.trim() || g.subject.length > 80 || /[\x00-\x1f\x7f]/.test(g.subject) || g.teacherId != null && !uuid(g.teacherId)) throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0433\u0440\u0443\u043F\u043F\u0430");
  if (!Array.isArray(g.students) || g.students.length > 100 || !Array.isArray(g.schedule) || g.schedule.length > 20) throw Error("\u041D\u0435 \u0431\u043E\u043B\u044C\u0448\u0435 100 \u0443\u0447\u0435\u043D\u0438\u043A\u043E\u0432 \u0438 20 \u0432\u0440\u0435\u043C\u0451\u043D \u0432 \u0433\u0440\u0443\u043F\u043F\u0435");
  const ids = /* @__PURE__ */ new Set(), codes = /* @__PURE__ */ new Set();
  for (const s of g.students) {
    studentRecord(s);
    if (!uuid(s.id) || ids.has(s.id)) throw Error("\u041F\u043E\u0432\u0442\u043E\u0440 \u0438\u043B\u0438 \u043D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 ID \u0443\u0447\u0435\u043D\u0438\u043A\u0430");
    ids.add(s.id);
    if (s.code) {
      if (codes.has(s.code)) throw Error("\u041F\u043E\u0432\u0442\u043E\u0440 \u043A\u043E\u0434\u0430 \u0443\u0447\u0435\u043D\u0438\u043A\u0430 \u0432 \u0433\u0440\u0443\u043F\u043F\u0435");
      codes.add(s.code);
    }
  }
  const slots = /* @__PURE__ */ new Set();
  for (const s of g.schedule) {
    if (!plain(s) || !Number.isInteger(s.day) || s.day < 0 || s.day > 6 || ![s.start, s.end].every((t) => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || duration(s.start, s.end) <= 0 || s.teacherId != null && !uuid(s.teacherId)) throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435");
    for (const d of [s.effectiveFrom, s.effectiveTo]) if (d && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || dateKey(/* @__PURE__ */ new Date(`${d}T12:00:00`)) !== d)) throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0434\u0430\u0442\u0430 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F");
    if (!allowHistorical && s.effectiveFrom && s.effectiveTo && s.effectiveFrom > s.effectiveTo || s.repeat && !["weekly", "biweekly", "once"].includes(s.repeat) || ["biweekly", "once"].includes(s.repeat) && !s.effectiveFrom || s.repeat === "once" && (/* @__PURE__ */ new Date(`${s.effectiveFrom}T12:00:00`)).getDay() !== s.day) throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u043F\u043E\u0432\u0442\u043E\u0440\u0435\u043D\u0438\u0435 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F");
    const key = [s.day, s.start, s.effectiveFrom || "", s.effectiveTo || ""].join("|");
    if (slots.has(key)) throw Error("\u041F\u043E\u0432\u0442\u043E\u0440 \u0432\u0440\u0435\u043C\u0435\u043D\u0438 \u0432 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0438");
    slots.add(key);
  }
}
function checkLesson(l, groups) {
  if (!plain(l) || !uuid(l.id) || !uuid(l.groupId) || l.teacherId != null && !uuid(l.teacherId) || l.deleted !== void 0 && typeof l.deleted !== "boolean") throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u0437\u0430\u043D\u044F\u0442\u0438\u0435");
  validateLesson(l);
  const g = groups.find((g2) => g2.id === l.groupId);
  if (!g) throw Error("\u0417\u0430\u043D\u044F\u0442\u0438\u0435 \u0441\u0441\u044B\u043B\u0430\u0435\u0442\u0441\u044F \u043D\u0430 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0443\u044E \u0433\u0440\u0443\u043F\u043F\u0443");
  if (!plain(l.attendance) || Object.entries(l.attendance).some(([id, mark]) => !uuid(id) || !["present", "absent", "excused"].includes(mark))) throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u043F\u043E\u0441\u0435\u0449\u0430\u0435\u043C\u043E\u0441\u0442\u044C");
}
async function buildTransfer({ kind, source, existing, users, overwrite = false }) {
  if (!["csv", "restore"].includes(kind) || typeof source !== "string" || source.length > 5e6) throw Error("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0444\u043E\u0440\u043C\u0430\u0442 \u0438 \u0440\u0430\u0437\u043C\u0435\u0440 \u0444\u0430\u0439\u043B\u0430 (\u0434\u043E 5 \u041C\u0411)");
  const groups = structuredClone(existing.groups), lessons = structuredClone(existing.lessons), changes = { groups: [], lessons: [] }, details = [], warnings = [];
  const summary = { newGroups: 0, updatedGroups: 0, newStudents: 0, newLessons: 0, updatedLessons: 0, skipped: 0 };
  function put(table, v) {
    const list = table === "groups" ? groups : lessons, old = list.find((x) => x.id === v.id);
    if (old && equivalent(old, v)) {
      summary.skipped++;
      return;
    }
    changes[table].push({ expectedVersion: old?.version ?? 0, payload: { ...v, version: old?.version ?? 0 } });
    if (old) list.splice(list.indexOf(old), 1, v);
    else list.push(v);
    summary[table === "groups" ? old ? "updatedGroups" : "newGroups" : old ? "updatedLessons" : "newLessons"]++;
    details.push({ type: table, action: old ? "update" : "create", label: table === "groups" ? v.name : `${groups.find((g) => g.id === v.groupId)?.name || "\u0417\u0430\u043D\u044F\u0442\u0438\u0435"} \xB7 ${v.date} ${v.start}` });
  }
  if (kind === "csv") {
    const parsed = parseGroupImport(source);
    for (const incoming of parsed.groups) {
      const teacher = users.find((u) => !u.disabled && norm(u.login) === incoming.teacherLogin);
      if (!teacher) throw Error(`\u0412\u044B\u0434\u0430\u0439\u0442\u0435 \u0434\u043E\u0441\u0442\u0443\u043F \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044E ${incoming.teacherLogin}`);
      const matches = groups.filter((g) => norm(g.name) === norm(incoming.name));
      if (matches.length > 1) throw Error(`\u041D\u0435\u043E\u0434\u043D\u043E\u0437\u043D\u0430\u0447\u043D\u0430\u044F \u0433\u0440\u0443\u043F\u043F\u0430 \xAB${incoming.name}\xBB: \u043F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u0443\u0439\u0442\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u044F`);
      const old = matches[0];
      if (old && (old.subject !== incoming.subject || old.teacherId !== teacher.id || old.archived)) throw Error(`\u0413\u0440\u0443\u043F\u043F\u0430 \xAB${incoming.name}\xBB \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442 \u0441 \u0434\u0440\u0443\u0433\u0438\u043C \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u043E\u043C, \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u0435\u043C \u0438\u043B\u0438 \u0432 \u0430\u0440\u0445\u0438\u0432\u0435. \u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0435\u0451 \u0432 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0435.`);
      const group = old ? structuredClone(old) : { id: await idFor(["csv-group", norm(incoming.name)]), name: incoming.name, subject: incoming.subject, teacherId: teacher.id, students: [], schedule: [], archived: false, version: 0 };
      const codeIds = /* @__PURE__ */ new Map();
      for (const s of incoming.students) {
        let match = group.students.filter((x) => x.code === s.code);
        if (!match.length) match = group.students.filter((x) => !x.code && norm(x.name) === norm(s.name));
        if (match.length > 1) throw Error(`\u041D\u0435\u043E\u0434\u043D\u043E\u0437\u043D\u0430\u0447\u043D\u044B\u0439 \u0443\u0447\u0435\u043D\u0438\u043A \xAB${s.name}\xBB: \u0437\u0430\u0434\u0430\u0439\u0442\u0435 \u043A\u043E\u0434\u044B \u0432 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0435 \u0433\u0440\u0443\u043F\u043F\u044B`);
        let target = match[0];
        if (target) {
          if (norm(target.name) !== norm(s.name)) throw Error(`\u041A\u043E\u0434 ${s.code} \u0443\u0436\u0435 \u043F\u0440\u0438\u043D\u0430\u0434\u043B\u0435\u0436\u0438\u0442 \u0434\u0440\u0443\u0433\u043E\u043C\u0443 \u0438\u043C\u0435\u043D\u0438`);
          for (const [k, v] of Object.entries(s)) {
            if (target[k] != null && target[k] !== "" && target[k] !== v) throw Error(`\u0414\u0430\u043D\u043D\u044B\u0435 ${s.code} \u043E\u0442\u043B\u0438\u0447\u0430\u044E\u0442\u0441\u044F: \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u0435 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443 \u0443\u0447\u0435\u043D\u0438\u043A\u0430 \u043F\u0435\u0440\u0435\u0434 \u0438\u043C\u043F\u043E\u0440\u0442\u043E\u043C`);
            target[k] = v;
          }
        } else {
          target = { ...s, id: await idFor(["csv-student", group.id, s.code]) };
          group.students.push(target);
          summary.newStudents++;
        }
        codeIds.set(s.code, target.id);
      }
      for (const slot of incoming.schedule) {
        const oldSlot = group.schedule.find((s) => s.day === slot.day && s.start === slot.start);
        if (oldSlot && oldSlot.end !== slot.end) throw Error(`\u0420\u0430\u0437\u043D\u043E\u0435 \u0432\u0440\u0435\u043C\u044F \u043E\u043A\u043E\u043D\u0447\u0430\u043D\u0438\u044F \u0432 \u0433\u0440\u0443\u043F\u043F\u0435 \xAB${group.name}\xBB`);
        if (oldSlot && (oldSlot.repeat && oldSlot.repeat !== "weekly" || oldSlot.effectiveFrom || oldSlot.effectiveTo || oldSlot.active === false)) throw Error(`\u0412\u0440\u0435\u043C\u044F ${slot.start} \u0432 \u0433\u0440\u0443\u043F\u043F\u0435 \xAB${group.name}\xBB \u0438\u043C\u0435\u0435\u0442 \u043E\u0441\u043E\u0431\u044B\u0435 \u043F\u0440\u0430\u0432\u0438\u043B\u0430 \u043F\u043E\u0432\u0442\u043E\u0440\u0435\u043D\u0438\u044F. \u0418\u0437\u043C\u0435\u043D\u0438\u0442\u0435 \u0435\u0433\u043E \u0432 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0435.`);
        if (!oldSlot) group.schedule.push(slot);
      }
      validateGroup(group);
      put("groups", group);
      for (const l of incoming.lessons) {
        const attendance = Object.fromEntries(Object.entries(l.attendance).map(([code, mark]) => [codeIds.get(code), mark]));
        const same = lessons.find((x) => x.groupId === group.id && x.date === l.date && x.start === l.start);
        const value = { ...l, attendance, id: same?.id || await idFor(["csv-lesson", group.id, l.date, l.start]), groupId: group.id, teacherId: same?.teacherId ?? null, deleted: false };
        if (same) {
          if (same.deleted || same.end !== l.end || same.status !== l.status || same.report !== l.report || Object.entries(attendance).some(([id, m]) => same.attendance?.[id] !== m)) throw Error(`\u0417\u0430\u043D\u044F\u0442\u0438\u0435 ${group.name} ${l.date} ${l.start} \u0443\u0436\u0435 \u0435\u0441\u0442\u044C \u0438 \u043E\u0442\u043B\u0438\u0447\u0430\u0435\u0442\u0441\u044F. \u0418\u0437\u043C\u0435\u043D\u0438\u0442\u0435 \u0435\u0433\u043E \u0432 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u0435.`);
          summary.skipped++;
          continue;
        }
        checkLesson(value, groups);
        put("lessons", value);
      }
    }
  } else {
    let copy;
    try {
      copy = JSON.parse(source);
    } catch {
      throw Error("\u0424\u0430\u0439\u043B \u043D\u0435 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 JSON");
    }
    if (copy?.format !== "orbita-journal" || copy.formatVersion !== 1 || !Array.isArray(copy.groups) || !Array.isArray(copy.lessons) || !Array.isArray(copy.users) || copy.groups.length > 1e3 || copy.lessons.length > 5e3 || copy.users.length > 500) throw Error("\u041D\u0443\u0436\u043D\u0430 \u0440\u0435\u0437\u0435\u0440\u0432\u043D\u0430\u044F \u043A\u043E\u043F\u0438\u044F \u041E\u0440\u0431\u0438\u0442\u044B v1 (\u0434\u043E 1000 \u0433\u0440\u0443\u043F\u043F \u0438 5000 \u0437\u0430\u043D\u044F\u0442\u0438\u0439)");
    const groupIDs = /* @__PURE__ */ new Set(), lessonIDs = /* @__PURE__ */ new Set(), userIDs = /* @__PURE__ */ new Set();
    for (const u of copy.users) {
      if (!plain(u) || !uuid(u.id) || userIDs.has(u.id) || typeof u.login !== "string") throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0435 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0438 \u0432 \u043A\u043E\u043F\u0438\u0438");
      userIDs.add(u.id);
    }
    const mapTeacher = (id) => {
      if (id == null) return null;
      const direct = users.find((u) => u.id === id);
      if (direct) return direct.id;
      const original = copy.users.find((u) => u.id === id);
      const mapped = original && users.filter((u) => norm(u.login) === norm(original.login));
      if (mapped?.length === 1) return mapped[0].id;
      throw Error("\u0412 \u043A\u043E\u043F\u0438\u0438 \u0435\u0441\u0442\u044C \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044C \u0431\u0435\u0437 \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0430 \u0432 \u044D\u0442\u043E\u043C \u0436\u0443\u0440\u043D\u0430\u043B\u0435. \u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0432\u044B\u0434\u0430\u0439\u0442\u0435 \u0435\u043C\u0443 \u0434\u043E\u0441\u0442\u0443\u043F \u0441 \u043F\u0440\u0435\u0436\u043D\u0438\u043C \u043B\u043E\u0433\u0438\u043D\u043E\u043C.");
    };
    for (const raw of copy.groups) {
      validateGroup(raw, true);
      if (groupIDs.has(raw.id)) throw Error("\u041F\u043E\u0432\u0442\u043E\u0440 ID \u0433\u0440\u0443\u043F\u043F\u044B \u0432 \u043A\u043E\u043F\u0438\u0438");
      groupIDs.add(raw.id);
      const old = groups.find((g) => g.id === raw.id);
      let value = { ...old || {}, ...structuredClone(raw), teacherId: mapTeacher(raw.teacherId), createdBy: raw.createdBy ? mapTeacher(raw.createdBy) : null, schedule: raw.schedule.map((s) => ({ ...s, ...s.teacherId ? { teacherId: mapTeacher(s.teacherId) } : {} })) };
      if (old) {
        if (overwrite) {
          value.students = [...old.students.filter((s) => !raw.students.some((x) => x.id === s.id)), ...raw.students.map((s) => ({ ...old.students.find((x) => x.id === s.id), ...s }))];
        } else {
          value = { ...old, students: [...old.students, ...raw.students.filter((s) => !old.students.some((x) => x.id === s.id))] };
        }
        summary.newStudents += value.students.length - old.students.length;
      } else summary.newStudents += value.students.length;
      validateGroup(value, true);
      put("groups", value);
    }
    for (const raw of copy.lessons) {
      if (!plain(raw) || lessonIDs.has(raw.id)) throw Error("\u041F\u043E\u0432\u0442\u043E\u0440 ID \u0437\u0430\u043D\u044F\u0442\u0438\u044F \u0432 \u043A\u043E\u043F\u0438\u0438");
      lessonIDs.add(raw.id);
      const old = lessons.find((l) => l.id === raw.id);
      const value = { ...old || {}, ...structuredClone(raw), teacherId: mapTeacher(raw.teacherId) };
      checkLesson(value, groups);
      const slot = lessons.find((l) => l.id !== raw.id && l.groupId === raw.groupId && l.date === raw.date && l.start === raw.start);
      if (slot) throw Error(`\u0412\u0440\u0435\u043C\u044F ${raw.date} ${raw.start} \u0443\u0436\u0435 \u0437\u0430\u043D\u044F\u0442\u043E \u0434\u0440\u0443\u0433\u0438\u043C ID. \u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u043E\u0431\u044A\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E.`);
      if (old && !overwrite) {
        summary.skipped++;
        continue;
      }
      put("lessons", value);
    }
    warnings.push("\u0423\u0447\u0451\u0442\u043D\u044B\u0435 \u0437\u0430\u043F\u0438\u0441\u0438 \u0438 \u043F\u0430\u0440\u043E\u043B\u0438 \u043D\u0435 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u044E\u0442\u0441\u044F. \u0417\u0430\u043F\u0438\u0441\u0438, \u043A\u043E\u0442\u043E\u0440\u044B\u0445 \u043D\u0435\u0442 \u0432 \u0444\u0430\u0439\u043B\u0435, \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F. \u041B\u0438\u0448\u043D\u0438\u0435 \u0443\u0447\u0435\u043D\u0438\u043A\u0438 \u0432 \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0445 \u0433\u0440\u0443\u043F\u043F\u0430\u0445 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F.");
  }
  if (changes.groups.length > 1e3 || changes.lessons.length > 5e3) throw Error("\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u043D\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u0437\u0430 \u043E\u0434\u043D\u0443 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u044E");
  const checks = { groups: existing.groups.map((g) => ({ id: g.id, version: g.version })), lessons: existing.lessons.map((l) => ({ id: l.id, version: l.version })) };
  return { changes, checks, summary, details, warnings, digest: await digest({ kind, source, overwrite, changes, checks }) };
}

// supabase/handler.mjs
var uuid2 = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
var publicProfile = (p) => ({ id: p.id, login: p.login, name: p.name, role: p.role, disabled: p.disabled, mustChange: p.must_change, subjects: p.subjects || [] });
var passwordStatus = (p) => ({ passwordChangedAt: p.password_changed_at || null, temporaryPasswordAt: p.temporary_password_at || null });
function fail(message, status = 400) {
  throw Object.assign(Error(message), { status });
}
function passwordCheck(p) {
  if (typeof p !== "string" || p.length < 12 || p.length > 128) fail("\u041F\u0430\u0440\u043E\u043B\u044C: \u043E\u0442 12 \u0434\u043E 128 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432");
}
function loginCheck(v) {
  if (typeof v !== "string" || !/^[a-zA-Z0-9_.-]{3,40}$/.test(v)) fail("\u041B\u043E\u0433\u0438\u043D: 3\u201340 \u043B\u0430\u0442\u0438\u043D\u0441\u043A\u0438\u0445 \u0431\u0443\u043A\u0432, \u0446\u0438\u0444\u0440, \u0442\u043E\u0447\u0435\u043A, \u0434\u0435\u0444\u0438\u0441\u043E\u0432 \u0438\u043B\u0438 \u043F\u043E\u0434\u0447\u0451\u0440\u043A\u0438\u0432\u0430\u043D\u0438\u0439");
  return v.toLowerCase();
}
function allowedSubjects(value) {
  if (!Array.isArray(value) || value.length > subjects.length || new Set(value).size !== value.length || value.some((s) => !subjects.includes(s))) fail("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u044B\u0435 \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u044B \u0438\u0437 \u0441\u043F\u0438\u0441\u043A\u0430");
  return value;
}
function createHandler({ url, serviceKey, allowedOrigins, defaultTemporaryPassword, fetchImpl = fetch, now = Date.now }) {
  async function backend(path, { method = "GET", body, token = serviceKey, prefer } = {}) {
    const r = await fetchImpl(`${url}${path}`, { method, headers: { apikey: serviceKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...prefer ? { Prefer: prefer } : {} }, body: body === void 0 ? void 0 : JSON.stringify(body) });
    const text = await r.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      fail("\u0421\u0435\u0440\u0432\u0438\u0441 \u0432\u0435\u0440\u043D\u0443\u043B \u043D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u043E\u0442\u0432\u0435\u0442", 502);
    }
    if (!r.ok) {
      const code = data?.error_code || data?.code;
      if (code === "same_password") fail("\u041D\u043E\u0432\u044B\u0439 \u043F\u0430\u0440\u043E\u043B\u044C \u0434\u043E\u043B\u0436\u0435\u043D \u043E\u0442\u043B\u0438\u0447\u0430\u0442\u044C\u0441\u044F \u043E\u0442 \u043F\u0440\u0435\u0436\u043D\u0435\u0433\u043E. \u041F\u0440\u0438\u0434\u0443\u043C\u0430\u0439\u0442\u0435 \u0434\u0440\u0443\u0433\u043E\u0439 \u043F\u0430\u0440\u043E\u043B\u044C.", 422);
      if (code === "weak_password") fail("\u042D\u0442\u043E\u0442 \u043F\u0430\u0440\u043E\u043B\u044C \u043D\u0435 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F\u043C \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u043E\u0441\u0442\u0438. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0431\u043E\u043B\u0435\u0435 \u0441\u043B\u043E\u0436\u043D\u044B\u0439 \u043F\u0430\u0440\u043E\u043B\u044C \u043E\u0442 12 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432.", 422);
      if (code === "reauthentication_needed" || code === "reauthentication_not_valid") fail("\u0414\u043B\u044F \u0441\u043C\u0435\u043D\u044B \u043F\u0430\u0440\u043E\u043B\u044F \u043D\u0443\u0436\u043D\u043E \u0437\u0430\u043D\u043E\u0432\u043E \u0432\u043E\u0439\u0442\u0438 \u0432 \u0436\u0443\u0440\u043D\u0430\u043B.", 401);
      if (code === "40001") fail("\u0414\u0430\u043D\u043D\u044B\u0435 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0438\u0441\u044C \u043F\u043E\u0441\u043B\u0435 \u043F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443 \u0444\u0430\u0439\u043B\u0430.", 409);
      if (code === "email_exists" || code === "user_already_exists" || r.status === 409 || code === "23505") fail("\u0422\u0430\u043A\u0430\u044F \u0437\u0430\u043F\u0438\u0441\u044C \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442", 409);
      if (r.status === 429) fail("\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u043D\u043E\u0433\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u043E\u0432. \u041F\u043E\u0434\u043E\u0436\u0434\u0438\u0442\u0435 \u043D\u0435\u043C\u043D\u043E\u0433\u043E \u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435.", 429);
      if (r.status === 401 || r.status === 403) fail("\u0421\u0435\u0441\u0441\u0438\u044F \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430. \u0412\u043E\u0439\u0434\u0438\u0442\u0435 \u0437\u0430\u043D\u043E\u0432\u043E.", 401);
      fail("\u0421\u0435\u0440\u0432\u0438\u0441 \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u0437\u0430\u043F\u0440\u043E\u0441.", 502);
    }
    return data;
  }
  const query = (table, q = "") => `/rest/v1/orbita_${table}?${q}`;
  async function one(table, id) {
    return (await backend(query(table, `id=eq.${id}&limit=1`)))[0];
  }
  async function all(table, order) {
    const result = [];
    for (let offset = 0; ; offset += 1e3) {
      const rows = await backend(query(table, `order=${order}&limit=1000&offset=${offset}`));
      result.push(...rows);
      if (rows.length < 1e3) return result;
    }
  }
  async function audit(p, action, target) {
    await backend(query("audit"), { method: "POST", body: { actor: p.id, action, target } });
  }
  async function save(table, payload, metadata) {
    if (!uuid2(payload.id) || !Number.isInteger(payload.version) || payload.version < 0) fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 ID \u0438\u043B\u0438 \u0432\u0435\u0440\u0441\u0438\u044F");
    const record = { ...metadata, payload, version: payload.version + 1 };
    if (payload.version === 0) {
      await backend(query(table), { method: "POST", body: { id: payload.id, ...record } });
    } else {
      const rows = await backend(query(table, `id=eq.${payload.id}&version=eq.${payload.version}`), { method: "PATCH", body: record, prefer: "return=representation" });
      if (!rows.length) fail("\u0417\u0430\u043F\u0438\u0441\u044C \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0430 \u0434\u0440\u0443\u0433\u0438\u043C \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u043E\u043C. \u0417\u0430\u043A\u0440\u043E\u0439\u0442\u0435 \u043E\u043A\u043D\u043E \u0438 \u043E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0437\u0430\u043D\u044F\u0442\u0438\u0435 \u0437\u0430\u043D\u043E\u0432\u043E.", 409);
    }
  }
  return async (request) => {
    const origin = request.headers.get("Origin") || "";
    const cors = { "Access-Control-Allow-Origin": allowedOrigins.includes(origin) ? origin : allowedOrigins[0], "Vary": "Origin", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
    if (origin && !allowedOrigins.includes(origin)) return json({ error: "\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0439 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u0437\u0430\u043F\u0440\u043E\u0441\u0430" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      const token = request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
      if (!token) fail("\u0412\u043E\u0439\u0434\u0438\u0442\u0435 \u0432 \u0436\u0443\u0440\u043D\u0430\u043B", 401);
      const authUser = await backend("/auth/v1/user", { token });
      const p = await one("profiles", authUser.id);
      if (!p || p.disabled) fail("\u0414\u043E\u0441\u0442\u0443\u043F \u043D\u0435 \u0432\u044B\u0434\u0430\u043D \u0438\u043B\u0438 \u043E\u0442\u043A\u043B\u044E\u0447\u0451\u043D. \u041E\u0431\u0440\u0430\u0442\u0438\u0442\u0435\u0441\u044C \u043A \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0443.", 403);
      let claims;
      try {
        claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      } catch {
        fail("\u0421\u0435\u0441\u0441\u0438\u044F \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430. \u0412\u043E\u0439\u0434\u0438\u0442\u0435 \u0437\u0430\u043D\u043E\u0432\u043E.", 401);
      }
      if (!Number.isFinite(claims.iat) || claims.iat <= p.invalid_before) fail("\u0414\u043E\u0441\u0442\u0443\u043F \u043E\u0431\u043D\u043E\u0432\u043B\u0451\u043D \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u043E\u043C. \u0412\u043E\u0439\u0434\u0438\u0442\u0435 \u0437\u0430\u043D\u043E\u0432\u043E.", 401);
      const route = new URL(request.url).pathname.split("/calendar-api/")[1] || "";
      const isAdmin = () => {
        if (!isManager(p.role)) fail("\u0414\u043E\u0441\u0442\u0443\u043F \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430", 403);
      };
      let b = {};
      if (!["GET", "HEAD"].includes(request.method)) {
        const raw = await request.text();
        if (new TextEncoder().encode(raw).length > (route.startsWith("transfer/") ? 8e6 : 15e4)) fail("\u0417\u0430\u043F\u0440\u043E\u0441 \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u0439", 413);
        try {
          b = JSON.parse(raw || "{}");
        } catch {
          fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 JSON");
        }
        if (!b || typeof b !== "object" || Array.isArray(b)) fail("\u041E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F \u043E\u0431\u044A\u0435\u043A\u0442 JSON");
      }
      if (route === "session" && request.method === "GET") return json({ demo: false, vkOnly: false, user: { ...publicProfile(p), ...passwordStatus(p) } });
      if (route === "password" && request.method === "POST") {
        passwordCheck(b.password);
        await backend("/auth/v1/user", { method: "PUT", token, body: { password: b.password } });
        await backend(query("profiles", `id=eq.${p.id}`), { method: "PATCH", body: { must_change: false, password_changed_at: new Date(now()).toISOString(), temporary_password_at: null } });
        await audit(p, "password", p.id);
        return json({ ok: true });
      }
      if (route === "activity" && request.method === "POST") {
        if (!["login", "logout"].includes(b.event)) fail("\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E\u0435 \u0441\u043E\u0431\u044B\u0442\u0438\u0435");
        if (b.event === "login") await backend(query("profiles", `id=eq.${p.id}`), { method: "PATCH", body: { last_seen_at: new Date(now()).toISOString() } });
        if (b.event === "logout") await backend(query("profiles", `id=eq.${p.id}`), { method: "PATCH", body: { last_seen_at: null, invalid_before: Math.floor(now() / 1e3) } });
        await audit(p, b.event, p.id);
        return json({ ok: true });
      }
      if (p.must_change) fail("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u043C\u0435\u043D\u0438\u0442\u0435 \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u044B\u0439 \u043F\u0430\u0440\u043E\u043B\u044C", 403);
      if (route === "transfer/history" && request.method === "GET") {
        if (p.role !== "owner") fail("\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u043A\u043E\u043F\u0438\u0439 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0433\u043B\u0430\u0432\u043D\u043E\u043C\u0443 admin", 403);
        const rows = await backend(query("imports", "source=in.(orbita-csv,orbita-restore)&order=at.desc&limit=20&select=id,at,source,summary"));
        return json({ entries: rows.map((r) => ({ id: r.id, at: r.at, source: r.source, summary: r.summary })) });
      }
      const savedCopy = route.match(/^transfer\/backups\/([0-9a-f-]+)$/i);
      if (savedCopy && request.method === "GET") {
        if (p.role !== "owner") fail("\u0414\u043E\u0441\u0442\u0443\u043F \u0442\u043E\u043B\u044C\u043A\u043E \u0433\u043B\u0430\u0432\u043D\u043E\u043C\u0443 admin", 403);
        if (!uuid2(savedCopy[1])) fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 ID");
        const saved = await one("imports", savedCopy[1]);
        if (!saved || !["orbita-csv", "orbita-restore"].includes(saved.source)) fail("\u041A\u043E\u043F\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430", 404);
        await audit(p, "backup:journal", saved.id);
        return json(saved.snapshot);
      }
      const transfer = route.match(/^transfer\/(csv|restore)\/(preview|commit)$/);
      if (transfer && request.method === "POST") {
        isAdmin();
        const [, kind, step] = transfer;
        if (kind === "restore" && p.role !== "owner") fail("\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0433\u043B\u0430\u0432\u043D\u043E\u043C\u0443 admin", 403);
        if (b.overwrite !== void 0 && typeof b.overwrite !== "boolean") fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0440\u0435\u0436\u0438\u043C \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F");
        if (step === "commit" && (!uuid2(b.requestId) || typeof b.digest !== "string" || !/^[a-f0-9]{64}$/.test(b.digest))) fail("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0444\u0430\u0439\u043B");
        if (step === "commit") {
          const applied = await one("imports", b.requestId);
          if (applied) {
            if (applied.summary?.actor !== p.id || applied.summary?.digest !== b.digest) fail("ID \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0438 \u0443\u0436\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D", 409);
            return json({ ok: true, summary: applied.summary });
          }
        }
        const [gs, ls, profiles] = await Promise.all([all("groups", "id"), all("lessons", "id"), all("profiles", "id")]);
        const existing = { groups: gs.map((r) => ({ ...r.payload, version: r.version })), lessons: ls.map((r) => ({ ...r.payload, version: r.version })) };
        let plan;
        try {
          plan = await buildTransfer({ kind, source: b.source, overwrite: b.overwrite === true, existing, users: profiles });
        } catch (e) {
          fail(e.message);
        }
        if (kind === "csv") for (const { payload: g } of plan.changes.groups) {
          const teacher = profiles.find((u) => u.id === g.teacherId);
          if (!teacher || teacher.disabled || !isManager(teacher.role) && subjects.includes(g.subject) && !teacher.subjects?.includes(g.subject) && g.createdBy !== teacher.id) fail("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0440\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u0435 \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044E \u043F\u0440\u0435\u0434\u043C\u0435\u0442 \u0433\u0440\u0443\u043F\u043F\u044B \u0432 \u0435\u0433\u043E \u043F\u0440\u043E\u0444\u0438\u043B\u0435");
        }
        if (step === "preview") return json({ digest: plan.digest, summary: plan.summary, details: plan.details, warnings: plan.warnings });
        if (plan.digest !== b.digest) fail("\u0414\u0430\u043D\u043D\u044B\u0435 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0438\u0441\u044C \u043F\u043E\u0441\u043B\u0435 \u043F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0444\u0430\u0439\u043B \u0437\u0430\u043D\u043E\u0432\u043E.", 409);
        if (!plan.changes.groups.length && !plan.changes.lessons.length) return json({ ok: true, summary: plan.summary });
        const summary = await backend("/rest/v1/rpc/orbita_apply_transfer", { method: "POST", body: { p_actor: p.id, p_iat: claims.iat, p_kind: kind, p_request: b.requestId, p_digest: plan.digest, p_changes: plan.changes, p_checks: plan.checks, p_summary: plan.summary } });
        return json({ ok: true, summary });
      }
      if (route === "backup" && request.method === "GET") {
        if (p.role !== "owner") fail("\u0420\u0435\u0437\u0435\u0440\u0432\u043D\u0430\u044F \u043A\u043E\u043F\u0438\u044F \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0433\u043B\u0430\u0432\u043D\u043E\u043C\u0443 admin", 403);
        const snapshot = await backend("/rest/v1/rpc/orbita_journal_backup", { method: "POST", body: {} });
        await audit(p, "backup:journal", "journal");
        return json(snapshot);
      }
      if (route === "presence" && request.method === "POST") {
        await backend(query("profiles", `id=eq.${p.id}`), { method: "PATCH", body: { last_seen_at: new Date(now()).toISOString() } });
        return json({ ok: true });
      }
      if (route === "audit" && request.method === "GET") {
        if (p.role !== "owner") fail("\u0416\u0443\u0440\u043D\u0430\u043B \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439 \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u0433\u043B\u0430\u0432\u043D\u043E\u043C\u0443 admin", 403);
        const before = new URL(request.url).searchParams.get("before");
        if (before && !/^\d{1,20}$/.test(before)) fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0430 \u0436\u0443\u0440\u043D\u0430\u043B\u0430");
        const rows = await backend(query("audit", `order=id.desc&limit=101${before ? `&id=lt.${before}` : ""}`));
        const profiles = await all("profiles", "id");
        const byId = new Map(profiles.map((profile) => [profile.id, profile]));
        return json({ entries: rows.slice(0, 100).map((r) => ({ id: String(r.id), at: r.at, action: r.action, target: r.target, actor: r.actor, actorName: byId.get(r.actor)?.name || "\u0421\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A", actorLogin: byId.get(r.actor)?.login || "" })), nextCursor: rows.length > 100 ? String(rows[99].id) : null });
      }
      if (route === "bootstrap" && request.method === "GET") {
        const [groups, lessons, profiles] = await Promise.all([all("groups", "id"), all("lessons", "date,start,id"), all("profiles", "name,id")]);
        const groupLookup = new Map(groups.map((g) => [g.id, g]));
        return json({ groups: groups.map((r) => ({ ...r.payload, students: r.payload.students.map((s) => visibleStudent(s, isManager(p.role) || canTeachGroup(p, { teacherId: r.teacher_id, subject: r.payload.subject, createdBy: r.payload.createdBy }) || canTeachGroup(p, { teacherId: p.id, subject: r.payload.subject, createdBy: r.payload.createdBy }) && (r.payload.schedule?.some((t) => t.teacherId === p.id && t.active !== false) || lessons.some((l) => !l.payload.deleted && l.group_id === r.id && l.payload.teacherId === p.id)))), version: r.version })), lessons: lessons.filter((r) => {
          if (isManager(p.role) || !r.payload.deleted) return true;
          const g = groupLookup.get(r.group_id);
          return !!g && canTeachGroup(p, { teacherId: r.payload.teacherId ?? g.teacher_id, subject: g.payload.subject, createdBy: g.payload.createdBy });
        }).map((r) => ({ ...r.payload, version: r.version })), users: profiles.map((profile) => ({ ...publicProfile(profile), ...isManager(p.role) || profile.id === p.id ? passwordStatus(profile) : {}, ...isManager(p.role) ? { lastSeenAt: profile.last_seen_at || null, online: !profile.disabled && Date.parse(profile.last_seen_at) <= now() && Date.parse(profile.last_seen_at) > now() - 9e4 } : {} })) });
      }
      const match = route.match(/^(groups|lessons)\/([0-9a-f-]+)$/i);
      if (match && request.method === "PUT") {
        const [_, table, id] = match;
        if (!uuid2(id) || b.id !== id) fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 ID");
        let event = `save:${table}`;
        if (table === "groups") {
          const previous = await one("groups", id);
          if (typeof b.name !== "string" || !b.name.trim() || b.name.length > 120 || typeof b.subject !== "string" || !b.subject.trim() || b.subject.trim().length > 80 || /[\x00-\x1f\x7f]/.test(b.subject) || b.teacherId != null && !uuid2(b.teacherId)) fail("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435, \u043F\u0440\u0435\u0434\u043C\u0435\u0442 \u0438 \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044F");
          const normalizedSubject = b.subject.trim();
          if (!Array.isArray(b.students) || b.students.length > 100 || !Array.isArray(b.schedule) || b.schedule.length > 20) fail("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0443\u0447\u0435\u043D\u0438\u043A\u043E\u0432 \u0438 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435");
          if (b.students.some((s) => !s || typeof s !== "object") || b.schedule.some((s) => !s || typeof s !== "object")) fail("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0443\u0447\u0435\u043D\u0438\u043A\u043E\u0432 \u0438 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435");
          for (const slot of b.schedule) if (slot.teacherId) {
            if (!uuid2(slot.teacherId)) fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044C \u0432 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0438");
            if (isManager(p.role)) {
              const t2 = await one("profiles", slot.teacherId);
              if (!t2 || t2.disabled) fail("\u041F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044C \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
            }
          }
          if (!isManager(p.role)) {
            if (p.role !== "teacher" || b.teacherId !== p.id) fail("\u041F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044C \u043C\u043E\u0436\u0435\u0442 \u0443\u043F\u0440\u0430\u0432\u043B\u044F\u0442\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u0441\u0432\u043E\u0438\u043C\u0438 \u0433\u0440\u0443\u043F\u043F\u0430\u043C\u0438", 403);
            if (previous) {
              if (previous.teacher_id !== p.id || previous.payload.archived || !canTeachGroup(p, { teacherId: previous.teacher_id, subject: previous.payload.subject, createdBy: previous.payload.createdBy })) fail("\u0412\u044B \u043C\u043E\u0436\u0435\u0442\u0435 \u043C\u0435\u043D\u044F\u0442\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u0441\u0432\u043E\u0438 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0435 \u0433\u0440\u0443\u043F\u043F\u044B", 403);
              if (previous.payload.createdBy !== p.id && normalizedSubject !== previous.payload.subject) fail("\u041F\u0440\u0435\u0434\u043C\u0435\u0442 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u043D\u043E\u0439 \u0433\u0440\u0443\u043F\u043F\u044B \u043C\u0435\u043D\u044F\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440", 403);
              if (Boolean(b.archived) !== Boolean(previous.payload.archived)) fail("\u0410\u0440\u0445\u0438\u0432\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0433\u0440\u0443\u043F\u043F\u044B \u043C\u043E\u0436\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440", 403);
            } else if (b.archived) fail("\u041D\u0435\u043B\u044C\u0437\u044F \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u0433\u0440\u0443\u043F\u043F\u0443 \u0441\u0440\u0430\u0437\u0443 \u0432 \u0430\u0440\u0445\u0438\u0432\u0435", 403);
            if (b.schedule?.some((slot) => slot.teacherId && slot.teacherId !== p.id)) fail("\u041D\u0435\u043B\u044C\u0437\u044F \u043D\u0430\u0437\u043D\u0430\u0447\u0430\u0442\u044C \u0432 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0438 \u0434\u0440\u0443\u0433\u043E\u0433\u043E \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044F", 403);
          }
          const t = b.teacherId ? await one("profiles", b.teacherId) : null;
          if (b.teacherId && (!t || t.disabled)) fail("\u041F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
          if (isManager(p.role) && t && !isManager(t.role) && subjects.includes(normalizedSubject) && !t.subjects?.includes(normalizedSubject)) fail("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0440\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u0435 \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044E \u044D\u0442\u043E\u0442 \u043F\u0440\u0435\u0434\u043C\u0435\u0442 \u0432 \u0435\u0433\u043E \u043F\u0440\u043E\u0444\u0438\u043B\u0435");
          if (!Array.isArray(b.students) || b.students.length > 100 || !Array.isArray(b.schedule) || b.schedule.length > 20) fail("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0443\u0447\u0435\u043D\u0438\u043A\u043E\u0432 \u0438 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435");
          const ids = /* @__PURE__ */ new Set();
          for (const s of b.students) {
            if (!uuid2(s.id) || ids.has(s.id) || typeof s.name !== "string" || !s.name.trim() || s.name.length > 240) fail("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0443\u0447\u0435\u043D\u0438\u043A\u043E\u0432");
            ids.add(s.id);
          }
          const slots = /* @__PURE__ */ new Set();
          for (const s of b.schedule) {
            if (!Number.isInteger(s.day) || s.day < 0 || s.day > 6 || ![s.start, s.end].every((t2) => typeof t2 === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t2)) || duration(s.start, s.end) <= 0) fail("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435");
            if ([s.effectiveFrom, s.effectiveTo].some((d) => d && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || dateKey(/* @__PURE__ */ new Date(`${d}T12:00:00`)) !== d)) || s.effectiveFrom && s.effectiveTo && s.effectiveFrom > s.effectiveTo && !previous?.payload.schedule?.some((old) => JSON.stringify(old) === JSON.stringify(s))) fail("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0434\u0430\u0442\u044B \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F");
            if (s.repeat !== void 0 && !["weekly", "biweekly", "once"].includes(s.repeat)) fail("\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043F\u0435\u0440\u0438\u043E\u0434\u0438\u0447\u043D\u043E\u0441\u0442\u044C");
            if (["biweekly", "once"].includes(s.repeat) && !s.effectiveFrom) fail("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0434\u0430\u0442\u0443 \u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u043E\u0432\u0442\u043E\u0440\u0435\u043D\u0438\u044F");
            if (s.repeat === "once" && (/* @__PURE__ */ new Date(`${s.effectiveFrom}T12:00:00`)).getDay() !== s.day) fail("\u0420\u0430\u0437\u043E\u0432\u044B\u0439 \u0443\u0440\u043E\u043A \u0434\u043E\u043B\u0436\u0435\u043D \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u0442\u044C \u0441 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0439 \u0434\u0430\u0442\u043E\u0439");
            const k = `${s.day}-${s.start}-${s.effectiveFrom || ""}-${s.effectiveTo || ""}`;
            if (slots.has(k)) fail("\u041F\u043E\u0432\u0442\u043E\u0440 \u0432\u0440\u0435\u043C\u0435\u043D\u0438 \u0432 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0438");
            slots.add(k);
          }
          if (Boolean(previous?.payload.archived) !== Boolean(b.archived)) event = b.archived ? "archive:groups" : "restore:groups";
          await save(table, { ...previous?.payload || {}, id, name: b.name.trim(), subject: normalizedSubject, teacherId: b.teacherId || null, createdBy: previous?.payload.createdBy || (!isManager(p.role) ? p.id : null), students: b.students.map((s) => {
            const old = previous?.payload.students?.find((x) => x.id === s.id) || {};
            const merged = { ...old, ...s };
            let normalized;
            try {
              normalized = studentRecord(merged);
            } catch (e) {
              fail(e.message);
            }
            const result = { ...old, ...normalized };
            for (const key of contactKeys) if (!(key in normalized)) delete result[key];
            return result;
          }), schedule: b.schedule.map((s) => ({ day: s.day, start: s.start, end: s.end, ...s.id ? { id: s.id } : {}, effectiveFrom: s.effectiveFrom || null, effectiveTo: s.effectiveTo || null, ...s.repeat ? { repeat: s.repeat } : {}, active: s.active !== false, ...s.teacherId ? { teacherId: s.teacherId } : {} })), archived: Boolean(b.archived), version: b.version }, { teacher_id: b.teacherId || null });
        } else {
          try {
            validateLesson(b);
          } catch (e) {
            fail(e.message);
          }
          if (!uuid2(b.groupId)) fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0433\u0440\u0443\u043F\u043F\u0430");
          const g = await one("groups", b.groupId);
          if (!g) fail("\u0413\u0440\u0443\u043F\u043F\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430");
          const old = await one("lessons", id);
          if (b.deleted !== void 0 && typeof b.deleted !== "boolean") fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u044F");
          const changingDeletion = Boolean(b.deleted) !== Boolean(old?.payload.deleted);
          if (!isManager(p.role) && old?.payload.deleted && !changingDeletion) fail("\u0423\u0434\u0430\u043B\u0451\u043D\u043D\u043E\u0435 \u0437\u0430\u043D\u044F\u0442\u0438\u0435 \u043C\u043E\u0436\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C", 403);
          if (!isManager(p.role) && changingDeletion) {
            if (!old) fail("\u0423\u0434\u0430\u043B\u044F\u0442\u044C \u043C\u043E\u0436\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u0437\u0430\u043D\u044F\u0442\u0438\u044F", 403);
            const existing = old.payload;
            if (b.groupId !== existing.groupId || b.date !== existing.date || b.start !== existing.start || b.end !== existing.end || b.status !== existing.status || b.report !== existing.report || JSON.stringify(b.attendance) !== JSON.stringify(existing.attendance) || (b.teacherId ?? null) !== (existing.teacherId ?? null)) fail("\u041F\u0440\u0438 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0438 \u0438 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0438 \u043D\u0435\u043B\u044C\u0437\u044F \u043C\u0435\u043D\u044F\u0442\u044C \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u043D\u0438\u0435 \u0443\u0440\u043E\u043A\u0430", 403);
          }
          if (Boolean(b.deleted) !== Boolean(old?.payload.deleted)) event = b.deleted ? "delete:lessons" : "restore:lessons";
          const permitted = (group, lesson) => canTeachGroup(p, group && { teacherId: lesson?.teacherId ?? group.teacher_id, subject: group.payload.subject, createdBy: group.payload.createdBy });
          if (!permitted(g, b) || old && !permitted(await one("groups", old.group_id), old.payload)) fail("\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043C\u043E\u0436\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0441\u0432\u043E\u0438 \u0433\u0440\u0443\u043F\u043F\u044B \u043F\u043E \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u044B\u043C \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u0430\u043C", 403);
          if (!isManager(p.role) && (b.teacherId ?? null) !== (old?.payload.teacherId ?? null) && !(!old && b.teacherId === p.id && g.teacher_id === p.id)) fail("\u041D\u0430\u0437\u043D\u0430\u0447\u0430\u0442\u044C \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044F \u043C\u043E\u0436\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440", 403);
          if (b.teacherId && (!old || b.teacherId !== old.payload.teacherId || b.groupId !== old.group_id)) {
            if (!uuid2(b.teacherId)) fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044C");
            const t = await one("profiles", b.teacherId);
            if (!t || t.disabled) fail("\u041F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
            if (!isManager(t.role) && subjects.includes(g.payload.subject) && !t.subjects?.includes(g.payload.subject) && g.payload.createdBy !== t.id) fail("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0440\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u0435 \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044E \u044D\u0442\u043E\u0442 \u043F\u0440\u0435\u0434\u043C\u0435\u0442 \u0432 \u0435\u0433\u043E \u043F\u0440\u043E\u0444\u0438\u043B\u0435");
          }
          if (g.payload.archived && (!old || old.group_id !== g.id)) fail("\u0413\u0440\u0443\u043F\u043F\u0430 \u0432 \u0430\u0440\u0445\u0438\u0432\u0435");
          if (!b.attendance || typeof b.attendance !== "object" || Array.isArray(b.attendance)) fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u043F\u043E\u0441\u0435\u0449\u0430\u0435\u043C\u043E\u0441\u0442\u044C");
          for (const [sid, mark] of Object.entries(b.attendance)) if (!["present", "absent", "excused"].includes(mark) || !g.payload.students.some((s) => s.id === sid) && old?.payload.attendance?.[sid] !== mark) fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u043E\u0442\u043C\u0435\u0442\u043A\u0430");
          await save(table, { ...old?.payload || {}, id, deleted: Boolean(b.deleted), teacherId: b.teacherId || null, groupId: b.groupId, date: b.date, start: b.start, end: b.end, status: b.status, report: b.report, attendance: b.attendance, version: b.version }, { group_id: b.groupId, date: b.date, start: b.start });
        }
        await audit(p, event, id);
        return json({ ok: true });
      }
      if (route === "users" && request.method === "POST") {
        isAdmin();
        if (!canCreateAccount(p.role, b.role)) fail("\u0412\u044B\u0434\u0430\u0432\u0430\u0442\u044C \u0434\u043E\u0441\u0442\u0443\u043F \u0441\u0443\u0431\u0430\u0434\u043C\u0438\u043D\u0430 \u043C\u043E\u0436\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0433\u043B\u0430\u0432\u043D\u044B\u0439 admin", 403);
        const login = loginCheck(b.login);
        const temporary = b.useDefault === true ? defaultTemporaryPassword : b.password;
        if (b.useDefault === true && !temporary) fail("\u041E\u0431\u0449\u0438\u0439 \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u044B\u0439 \u043F\u0430\u0440\u043E\u043B\u044C \u0435\u0449\u0451 \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435", 503);
        passwordCheck(temporary);
        if (typeof b.name !== "string" || !b.name.trim() || b.name.length > 80) fail("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0438\u043C\u044F \u0438 \u0440\u043E\u043B\u044C");
        const assigned = b.role === "teacher" ? allowedSubjects(b.subjects || []) : [];
        const created = await backend("/auth/v1/admin/users", { method: "POST", body: { email: `${login}@users.orbita.invalid`, password: temporary, email_confirm: true } });
        try {
          await backend(query("profiles"), { method: "POST", body: { id: created.id, login, name: b.name.trim(), role: b.role, subjects: assigned, must_change: true, temporary_password_at: new Date(now()).toISOString() } });
        } catch (e) {
          await backend(`/auth/v1/admin/users/${created.id}`, { method: "DELETE" });
          throw e;
        }
        await audit(p, "create:user", created.id);
        return json({ ok: true });
      }
      const account = route.match(/^users\/([0-9a-f-]+)(\/(?:password|profile))?$/i);
      if (account) {
        const id = account[1];
        if (!uuid2(id)) fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 ID");
        const target = await one("profiles", id);
        if (!target) fail("\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D", 404);
        if (account[2] === "/profile" && request.method === "PATCH") {
          if (Object.keys(b).some((key) => !["subjects", "name", "login"].includes(key))) fail("\u0418\u0437\u043C\u0435\u043D\u044F\u0442\u044C \u0440\u043E\u043B\u044C \u0447\u0435\u0440\u0435\u0437 \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u043D\u0435\u043B\u044C\u0437\u044F", 403);
          if ("subjects" in b) {
            if (!canManageAccount(p.role, target.role) || target.role !== "teacher" || id === p.id) fail("\u041D\u0435\u0442 \u043F\u0440\u0430\u0432\u0430 \u043D\u0430\u0437\u043D\u0430\u0447\u0430\u0442\u044C \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u044B \u044D\u0442\u043E\u043C\u0443 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0443", 403);
            if ("name" in b || "login" in b) fail("\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0435 \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u044B \u0438 \u0438\u043C\u044F \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E");
            const assigned = allowedSubjects(b.subjects);
            await backend(query("profiles", `id=eq.${id}`), { method: "PATCH", body: { subjects: assigned } });
            await audit(p, "subjects:user", id);
            return json({ ok: true });
          }
          if (p.role !== "owner" && id !== p.id) fail("\u0418\u0437\u043C\u0435\u043D\u044F\u0442\u044C \u0447\u0443\u0436\u043E\u0435 \u0438\u043C\u044F \u0438 \u043B\u043E\u0433\u0438\u043D \u043C\u043E\u0436\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0433\u043B\u0430\u0432\u043D\u044B\u0439 admin", 403);
          if (typeof b.name !== "string" || !b.name.trim() || b.name.trim().length > 80) fail("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0438\u043C\u044F \u043E\u0442 1 \u0434\u043E 80 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432");
          const login = loginCheck(b.login);
          const duplicate = (await backend(query("profiles", `login=eq.${login}&limit=1`)))[0];
          if (duplicate && duplicate.id !== id) fail("\u042D\u0442\u043E\u0442 \u043B\u043E\u0433\u0438\u043D \u0443\u0436\u0435 \u0437\u0430\u043D\u044F\u0442", 409);
          const changed = login !== target.login;
          if (changed) await backend(`/auth/v1/admin/users/${id}`, { method: "PUT", body: { email: `${login}@users.orbita.invalid`, email_confirm: true } });
          try {
            await backend(query("profiles", `id=eq.${id}`), { method: "PATCH", body: { name: b.name.trim(), login } });
          } catch (e) {
            if (changed) await backend(`/auth/v1/admin/users/${id}`, { method: "PUT", body: { email: `${target.login}@users.orbita.invalid`, email_confirm: true } });
            throw e;
          }
          await audit(p, "identity:user", id);
          return json({ ok: true });
        }
        isAdmin();
        if (id === p.id) fail("\u0421\u0432\u043E\u0439 \u0434\u043E\u0441\u0442\u0443\u043F \u0438\u0437\u043C\u0435\u043D\u044F\u0439\u0442\u0435 \u0447\u0435\u0440\u0435\u0437 \u0441\u043C\u0435\u043D\u0443 \u043F\u0430\u0440\u043E\u043B\u044F");
        if (!canManageAccount(p.role, target.role)) fail("\u041D\u0435\u0442 \u043F\u0440\u0430\u0432\u0430 \u0438\u0437\u043C\u0435\u043D\u044F\u0442\u044C \u0434\u043E\u0441\u0442\u0443\u043F \u044D\u0442\u043E\u0433\u043E \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0430", 403);
        if (account[2] === "/password" && request.method === "POST") {
          const temporary = b.useDefault === true ? defaultTemporaryPassword : b.password;
          if (b.useDefault === true && !temporary) fail("\u041E\u0431\u0449\u0438\u0439 \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u044B\u0439 \u043F\u0430\u0440\u043E\u043B\u044C \u0435\u0449\u0451 \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435", 503);
          passwordCheck(temporary);
          await backend(query("profiles", `id=eq.${id}`), { method: "PATCH", body: { must_change: true, invalid_before: Math.floor(now() / 1e3), temporary_password_at: new Date(now()).toISOString() } });
          await backend(`/auth/v1/admin/users/${id}`, { method: "PUT", body: { password: temporary } });
          await audit(p, "reset:user", id);
          return json({ ok: true });
        }
        if (!account[2] && request.method === "PATCH") {
          if (typeof b.disabled !== "boolean") fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435");
          await backend(query("profiles", `id=eq.${id}`), { method: "PATCH", body: { disabled: b.disabled, invalid_before: Math.floor(now() / 1e3) } });
          await audit(p, "toggle:user", id);
          return json({ ok: true });
        }
      }
      fail("\u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E", 404);
    } catch (e) {
      return json({ error: e.status ? e.message : "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0432\u044B\u043F\u043E\u043B\u043D\u0438\u0442\u044C \u0437\u0430\u043F\u0440\u043E\u0441" }, e.status || 500);
    }
  };
}

// <stdin>
Deno.serve(createHandler({ url: Deno.env.get("SUPABASE_URL"), serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), defaultTemporaryPassword: Deno.env.get("ORBITA_TEMP_PASSWORD"), allowedOrigins: ["http://localhost:4174", "http://127.0.0.1:4174", "https://merwine-ivan.github.io"] }));
