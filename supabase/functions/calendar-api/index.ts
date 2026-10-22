// src/transfer-utils.mjs
var uuid = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
var plain = (v) => v && typeof v === "object" && !Array.isArray(v);
function stable(v) {
  return JSON.stringify(v, function(k, x) {
    return plain(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x;
  });
}
async function digest(v) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stable(v))))].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// src/backup-integrity.mjs
async function sealBackup(copy) {
  const { integrity, ...content } = copy;
  return { ...content, integrity: { algorithm: "SHA-256", value: await digest(content) } };
}
async function verifyBackup(copy) {
  if (copy.integrity === void 0) return false;
  const { integrity, ...content } = copy;
  if (!integrity || integrity.algorithm !== "SHA-256" || !/^[a-f0-9]{64}$/.test(integrity.value) || await digest(content) !== integrity.value) throw Error("\u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u0430\u044F \u0441\u0443\u043C\u043C\u0430 \u043A\u043E\u043F\u0438\u0438 \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u0435\u0442. \u0424\u0430\u0439\u043B \u043F\u043E\u0432\u0440\u0435\u0436\u0434\u0451\u043D \u0438\u043B\u0438 \u0438\u0437\u043C\u0435\u043D\u0451\u043D; \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E.");
  return true;
}

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
function recurrence(groups, year, month, existing) {
  const dayMs = 864e5;
  const utcDate = (iso) => Date.parse(`${iso}T00:00:00Z`);
  const out = [];
  for (let day = 1; day <= new Date(year, month + 1, 0).getDate(); day++) {
    const d = new Date(year, month, day), date = dateKey(d);
    for (const g of groups.filter((g2) => !g2.archived)) for (const s of g.schedule || []) if (s.active !== false && s.day === d.getDay() && (!s.effectiveFrom || date >= s.effectiveFrom) && (!s.effectiveTo || date <= s.effectiveTo) && (s.repeat !== "once" || date === s.effectiveFrom) && (s.repeat !== "biweekly" || s.effectiveFrom && (() => {
      const start = /* @__PURE__ */ new Date(`${s.effectiveFrom}T12:00:00`);
      const first = new Date(start);
      first.setDate(start.getDate() + (s.day - start.getDay() + 7) % 7);
      return (utcDate(date) - utcDate(dateKey(first))) % (14 * dayMs) === 0;
    })()) && !existing.some((l) => l.groupId === g.id && l.date === date && l.start === s.start) && !out.some((l) => l.groupId === g.id && l.date === date && l.start === s.start)) out.push({ id: crypto.randomUUID(), groupId: g.id, date, start: s.start, end: s.end, ...s.teacherId ? { teacherId: s.teacherId } : {}, status: "planned", attendance: {}, report: "", version: 0 });
  }
  return out;
}

// src/journal.mjs
var centreDate = (now = Date.now()) => new Date(now + 6 * 36e5).toISOString().slice(0, 10);
function groupAt(group, date) {
  const h = (group.history || []).find((h2) => (!h2.from || date >= h2.from) && date < h2.until);
  return h ? { ...group, ...h, history: void 0 } : group;
}
var lessonGroup = (group, lesson) => lesson.snapshot || group.frozenLessons?.[lesson.id] ? { ...group, ...lesson.snapshot || group.frozenLessons[lesson.id] } : groupAt(group, lesson.date);
function freezeLessons(group, lessons, today) {
  const result = { ...group.frozenLessons || {} };
  for (const l of lessons) if (l.groupId === group.id && !l.snapshot && !result[l.id] && (l.date <= today || l.status !== "planned" || l.report || Object.keys(l.attendance || {}).length)) {
    const g = lessonGroup(group, l);
    result[l.id] = { name: g.name, subject: g.subject, teacherId: g.teacherId, lessonType: g.lessonType, students: (g.students || []).map((s) => ({ id: s.id, name: s.name, personId: s.personId || s.id })) };
  }
  return result;
}
function groupHistory(previous, next, today) {
  if (!previous) return { ...next, scheduleSince: today, history: [] };
  const keys = ["name", "subject", "teacherId", "students", "schedule", "archived", "deleted", "lessonType"];
  if (keys.every((k) => JSON.stringify(previous[k] ?? null) === JSON.stringify(next[k] ?? null))) return { ...next, history: previous.history || [], scheduleSince: previous.scheduleSince };
  const history = [...previous.history || []];
  if (!previous.scheduleSince || previous.scheduleSince < today) history.push({ from: previous.scheduleSince || null, until: today, ...Object.fromEntries(keys.map((k) => [k, previous[k] ?? null])) });
  return { ...next, history, scheduleSince: today };
}
function calendarMonth(groups, saved, year, month, today = centreDate()) {
  const prefix = dateKey(new Date(year, month, 1)).slice(0, 7), out = [];
  for (const g of groups) {
    const variants = [...(g.history || []).map((h) => ({ ...g, ...h })), { ...g, from: g.scheduleSince || null, until: null }];
    const projected = [];
    for (const variant of variants) {
      if (variant.archived || variant.deleted) continue;
      for (const l of recurrence([variant], year, month, [])) if ((!variant.from || l.date >= variant.from) && (!variant.until || l.date < variant.until) && (!(g.archived || g.deleted) || l.date < today)) projected.push({ ...l, id: `virtual:${g.id}:${l.date}:${l.start}`, virtual: true, groupVersion: g.version, teacherId: l.teacherId ?? variant.teacherId, snapshot: { name: variant.name, subject: variant.subject, teacherId: variant.teacherId, students: variant.students, lessonType: variant.lessonType } });
    }
    for (const l of saved.filter((l2) => l2.groupId === g.id && l2.date.startsWith(prefix))) {
      const protectedRecord = l.status !== "planned" || l.report || Object.keys(l.attendance || {}).length || l.manual || l.date < today;
      const matching = projected.find((p) => p.date === l.date && p.start === l.start);
      const visible = protectedRecord && (!g.archived && !g.deleted || l.date < today || l.status === "done") || !g.archived && !g.deleted && (!g.scheduleSince || l.date < g.scheduleSince || matching);
      if (!l.deleted && visible) out.push(!protectedRecord && matching && g.scheduleSince ? { ...l, end: matching.end, teacherId: matching.teacherId, snapshot: matching.snapshot } : l);
    }
    for (const l of projected) if (!saved.some((s) => s.groupId === g.id && s.date === l.date && s.start === l.start)) out.push(l);
  }
  return out;
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
  return { id: s.id, name: s.name, ...s.personId ? { personId: s.personId } : {}, ...s.code ? { code: s.code } : {} };
}

// src/student-directory.mjs
var profileKeys = ["name", "phone", "guardianName", "guardianPhone", "age", "gender"];
var personId = (s) => s.personId || s.id;
function profileOf(s) {
  return Object.fromEntries(profileKeys.filter((k) => s[k] !== void 0 && s[k] !== "").map((k) => [k, s[k]]));
}
function directory(groups) {
  const entries = /* @__PURE__ */ new Map();
  for (const g of groups) for (const s of g.students) {
    const id = personId(s);
    let p = entries.get(id);
    if (!p) {
      p = { id, profile: profileOf(s), memberships: [] };
      entries.set(id, p);
    }
    if (Object.keys(profileOf(s)).length > Object.keys(p.profile).length) p.profile = profileOf(s);
    p.memberships.push({ groupId: g.id, groupName: g.name, archived: g.archived, memberId: s.id, code: s.code || "" });
  }
  return [...entries.values()].sort((a, b) => a.profile.name.localeCompare(b.profile.name, "ru"));
}
function sameProfile(a, b) {
  return stable(profileOf(a)) === stable(profileOf(b));
}
function assertSharedProfiles(groups) {
  const profiles = /* @__PURE__ */ new Map();
  for (const g of groups) for (const s of g.students) {
    if (s.personId && !uuid(s.personId)) throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0441\u0432\u044F\u0437\u044C \u0435\u0434\u0438\u043D\u043E\u0439 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0438");
    const id = personId(s);
    if (profiles.has(id) && !sameProfile(profiles.get(id), s)) throw Error("\u0421\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0435 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0438 \u043E\u0442\u043B\u0438\u0447\u0430\u044E\u0442\u0441\u044F. \u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u0435 \u0435\u0434\u0438\u043D\u0443\u044E \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443 \u0432 \u0440\u0430\u0437\u0434\u0435\u043B\u0435 \xAB\u0423\u0447\u0435\u043D\u0438\u043A\u0438\xBB.");
    profiles.set(id, s);
  }
}
async function studentPlan({ groups, lessons, input }) {
  if (!input || !["update", "link"].includes(input.action) || !uuid(input.personId)) throw Error("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0435\u0434\u0438\u043D\u0443\u044E \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443");
  const people = directory(groups), target = people.find((p) => p.id === input.personId);
  if (!target) throw Error("\u0423\u0447\u0435\u043D\u0438\u043A \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
  let profile = profileOf(studentRecord({ id: target.id, ...input.action === "link" ? target.profile : input.profile }));
  const ids = input.action === "link" ? input.sourceIds : [target.id];
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 50 || ids.some((id) => !uuid(id) || !people.some((p) => p.id === id)) || input.action === "link" && (!ids.includes(target.id) || new Set(ids).size < 2)) throw Error("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043E\u0442 2 \u0434\u043E 50 \u043A\u0430\u0440\u0442\u043E\u0447\u0435\u043A \u0434\u043B\u044F \u043E\u0431\u044A\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u044F");
  const chosen = new Set(ids);
  for (const g of groups) if (g.students.filter((s) => chosen.has(personId(s))).length > 1) throw Error(`\u0412 \u0433\u0440\u0443\u043F\u043F\u0435 \xAB${g.name}\xBB \u0432\u044B\u0431\u0440\u0430\u043D\u044B \u0434\u0432\u0435 \u0440\u0430\u0437\u043D\u044B\u0435 \u0437\u0430\u043F\u0438\u0441\u0438 \u0443\u0447\u0435\u043D\u0438\u043A\u0430. \u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0441\u043E\u0441\u0442\u0430\u0432: \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0435 \u0437\u0430\u043F\u0438\u0441\u0438 \u043F\u043E\u0442\u0435\u0440\u044F\u0435\u0442 \u0441\u0432\u044F\u0437\u044C \u0441 \u043F\u043E\u0441\u0435\u0449\u0430\u0435\u043C\u043E\u0441\u0442\u044C\u044E.`);
  const changes = { groups: [], lessons: [] }, details = [];
  for (const g of groups) {
    if (!g.students.some((s) => chosen.has(personId(s)))) continue;
    const students = g.students.map((s) => {
      if (!chosen.has(personId(s))) return s;
      const copy = { ...s, personId: target.id };
      for (const k of profileKeys) delete copy[k];
      return { ...copy, ...profile };
    });
    const payload = { ...g, students };
    if (stable(payload) === stable(g)) continue;
    changes.groups.push({ expectedVersion: g.version, payload });
    details.push({ label: g.name, students: students.filter((s) => s.personId === target.id).map((s) => s.id) });
  }
  const checks = { groups: groups.map((g) => ({ id: g.id, version: g.version })), lessons: lessons.map((l) => ({ id: l.id, version: l.version })) };
  const summary = { newGroups: 0, updatedGroups: changes.groups.length, newStudents: 0, newLessons: 0, updatedLessons: 0, skipped: 0 };
  const warnings = input.action === "link" ? ["\u0411\u0443\u0434\u0443\u0442 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u044B \u0424\u0418\u041E \u0438 \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u044B \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0439 \u043E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0438. \u041A\u043E\u0434\u044B \u0432 \u0433\u0440\u0443\u043F\u043F\u0430\u0445, ID \u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u0438 \u0432\u0441\u0435 \u043E\u0442\u043C\u0435\u0442\u043A\u0438 \u043F\u043E\u0441\u0435\u0449\u0430\u0435\u043C\u043E\u0441\u0442\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F. \u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0435 \u0441\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0442\u0441\u044F \u0432 \u0440\u0435\u0437\u0435\u0440\u0432\u043D\u043E\u0439 \u043A\u043E\u043F\u0438\u0438 \u043F\u0435\u0440\u0435\u0434 \u043E\u0431\u044A\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435\u043C."] : [];
  return { changes, checks, summary, details, warnings, profile, digest: await digest({ input, changes, checks }) };
}

// src/payment-backup.mjs
var uuid2 = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function timestamp(value) {
  const match = typeof value === "string" && value.match(/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.(\d{1,6}))?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/);
  if (!match || !Number.isFinite(Date.parse(value)) || (/* @__PURE__ */ new Date(`${match[1]}T12:00:00Z`)).toISOString().slice(0, 10) !== match[1]) throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0434\u0430\u0442\u0430 \u043E\u043F\u043B\u0430\u0442\u044B \u0432 \u0440\u0435\u0437\u0435\u0440\u0432\u043D\u043E\u0439 \u043A\u043E\u043F\u0438\u0438");
  return new Date(value).toISOString().slice(0, 19) + "." + (match[3] || "").padEnd(6, "0") + "Z";
}
function paymentRecord(p) {
  if (!p || typeof p !== "object" || !uuid2(p.id) || !uuid2(p.actor) || !uuid2(p.teacher_id) || typeof p.month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(p.month) || typeof p.subject !== "string" || !p.subject.trim() || p.subject.length > 80 || /[\x00-\x1f\x7f]/.test(p.subject) || !["group", "individual"].includes(p.lesson_type) || !Number.isInteger(p.minutes) || !p.minutes || Math.abs(p.minutes) > 6e4 || typeof p.note !== "string" || p.note.length > 500 || typeof p.at !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(p.at) || !Number.isFinite(Date.parse(p.at))) throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0437\u0430\u043F\u0438\u0441\u044C \u043E\u043F\u043B\u0430\u0442\u044B \u0432 \u0440\u0435\u0437\u0435\u0440\u0432\u043D\u043E\u0439 \u043A\u043E\u043F\u0438\u0438");
  return { id: p.id, at: timestamp(p.at), actor: p.actor, teacher_id: p.teacher_id, month: p.month, subject: p.subject, lesson_type: p.lesson_type, minutes: p.minutes, note: p.note };
}
function restorePayments(incoming, existing, mapUser) {
  if (!Array.isArray(incoming) || incoming.length > 1e4) throw Error("\u0412 \u043A\u043E\u043F\u0438\u0438 \u043E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F \u0441\u043F\u0438\u0441\u043E\u043A \u043E\u043F\u043B\u0430\u0442 (\u0434\u043E 10 000 \u0437\u0430\u043F\u0438\u0441\u0435\u0439)");
  const current = new Map(existing.map((p) => [p.id, paymentRecord(p)])), seen = /* @__PURE__ */ new Set(), added = [];
  let skipped = 0;
  for (const raw of incoming) {
    const row = paymentRecord(raw);
    if (seen.has(row.id)) throw Error("\u041F\u043E\u0432\u0442\u043E\u0440 ID \u043E\u043F\u043B\u0430\u0442\u044B \u0432 \u0440\u0435\u0437\u0435\u0440\u0432\u043D\u043E\u0439 \u043A\u043E\u043F\u0438\u0438");
    seen.add(row.id);
    row.actor = mapUser(row.actor);
    row.teacher_id = mapUser(row.teacher_id);
    const old = current.get(row.id);
    if (old) {
      if (JSON.stringify(old) !== JSON.stringify(row)) throw Error(`\u041E\u043F\u043B\u0430\u0442\u0430 ${row.id} \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442 \u0438 \u043E\u0442\u043B\u0438\u0447\u0430\u0435\u0442\u0441\u044F. \u0417\u0430\u043F\u0438\u0441\u0438 \u043E\u043F\u043B\u0430\u0442 \u043D\u0435 \u0437\u0430\u043C\u0435\u043D\u044F\u044E\u0442\u0441\u044F; \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043A\u043E\u043D\u0444\u043B\u0438\u043A\u0442.`);
      skipped++;
    } else added.push(row);
  }
  return { added, skipped, checks: [...current.values()].sort((a, b) => a.id.localeCompare(b.id)) };
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
var uuid3 = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
var plain2 = (v) => v && typeof v === "object" && !Array.isArray(v);
var norm = (v) => v.trim().toLocaleLowerCase("ru-RU");
function stable2(v) {
  return JSON.stringify(v, function(k, x) {
    return plain2(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x;
  });
}
async function digest2(v) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stable2(v))))].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function idFor(seed) {
  const x = await digest2(seed);
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-4${x.slice(13, 16)}-a${x.slice(17, 20)}-${x.slice(20, 32)}`;
}
function equivalent(a, b) {
  const clean = (x) => {
    const { version, ...rest } = x;
    return rest;
  };
  return stable2(clean(a)) === stable2(clean(b));
}
function validDate(d) {
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && dateKey(/* @__PURE__ */ new Date(`${d}T12:00:00`)) === d;
}
function validateSnapshot(s) {
  if (!plain2(s) || typeof s.name !== "string" || !s.name.trim() || s.name.length > 120 || typeof s.subject !== "string" || !s.subject.trim() || s.subject.length > 80 || s.teacherId != null && !uuid3(s.teacherId) || s.lessonType != null && !["group", "individual"].includes(s.lessonType) || !Array.isArray(s.students) || s.students.length > 100) throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u0437\u0430\u043D\u044F\u0442\u0438\u044F \u0432 \u043A\u043E\u043F\u0438\u0438");
  const ids = /* @__PURE__ */ new Set();
  for (const pupil of s.students) {
    studentRecord(pupil);
    if (!uuid3(pupil.id) || ids.has(pupil.id) || pupil.personId != null && !uuid3(pupil.personId)) throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0441\u043E\u0441\u0442\u0430\u0432 \u0438\u0441\u0442\u043E\u0440\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u0437\u0430\u043D\u044F\u0442\u0438\u044F");
    ids.add(pupil.id);
  }
}
function mapSnapshot(s, mapUser) {
  return { ...s, teacherId: mapUser(s.teacherId) };
}
function validateGroup(g, allowHistorical = false) {
  if (!plain2(g) || !uuid3(g.id) || typeof g.name !== "string" || !g.name.trim() || g.name.length > 120 || typeof g.subject !== "string" || !g.subject.trim() || g.subject.length > 80 || /[\x00-\x1f\x7f]/.test(g.subject) || g.teacherId != null && !uuid3(g.teacherId)) throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0433\u0440\u0443\u043F\u043F\u0430");
  if (!Array.isArray(g.students) || g.students.length > 100 || !Array.isArray(g.schedule) || g.schedule.length > 20) throw Error("\u041D\u0435 \u0431\u043E\u043B\u044C\u0448\u0435 100 \u0443\u0447\u0435\u043D\u0438\u043A\u043E\u0432 \u0438 20 \u0432\u0440\u0435\u043C\u0451\u043D \u0432 \u0433\u0440\u0443\u043F\u043F\u0435");
  if (g.lessonType != null && !["group", "individual"].includes(g.lessonType) || g.scheduleSince != null && !validDate(g.scheduleSince) || g.archived != null && typeof g.archived !== "boolean" || g.deleted != null && typeof g.deleted !== "boolean") throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0433\u0440\u0443\u043F\u043F\u044B");
  if (g.history !== void 0) {
    if (!Array.isArray(g.history) || g.history.length > 1e3) throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u0433\u0440\u0443\u043F\u043F\u044B");
    for (const h of g.history) {
      if (!plain2(h) || !validDate(h.until) || h.from != null && (!validDate(h.from) || h.from > h.until)) throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0435 \u0434\u0430\u0442\u044B \u0438\u0441\u0442\u043E\u0440\u0438\u0438 \u0433\u0440\u0443\u043F\u043F\u044B");
      validateGroup({ ...g, ...h, history: void 0, frozenLessons: void 0 }, true);
    }
  }
  if (g.frozenLessons !== void 0) {
    if (!plain2(g.frozenLessons) || Object.keys(g.frozenLessons).length > 5e3) throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0435 \u0441\u043D\u0438\u043C\u043A\u0438 \u0437\u0430\u043D\u044F\u0442\u0438\u0439");
    for (const [id, snapshot] of Object.entries(g.frozenLessons)) {
      if (!uuid3(id)) throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 ID \u0438\u0441\u0442\u043E\u0440\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u0437\u0430\u043D\u044F\u0442\u0438\u044F");
      validateSnapshot(snapshot);
    }
  }
  const ids = /* @__PURE__ */ new Set(), codes = /* @__PURE__ */ new Set();
  for (const s of g.students) {
    studentRecord(s);
    if (!uuid3(s.id) || ids.has(s.id)) throw Error("\u041F\u043E\u0432\u0442\u043E\u0440 \u0438\u043B\u0438 \u043D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 ID \u0443\u0447\u0435\u043D\u0438\u043A\u0430");
    ids.add(s.id);
    if (s.code) {
      if (codes.has(s.code)) throw Error("\u041F\u043E\u0432\u0442\u043E\u0440 \u043A\u043E\u0434\u0430 \u0443\u0447\u0435\u043D\u0438\u043A\u0430 \u0432 \u0433\u0440\u0443\u043F\u043F\u0435");
      codes.add(s.code);
    }
  }
  const slots = /* @__PURE__ */ new Set();
  for (const s of g.schedule) {
    if (!plain2(s) || !Number.isInteger(s.day) || s.day < 0 || s.day > 6 || ![s.start, s.end].every((t) => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || duration(s.start, s.end) <= 0 || s.teacherId != null && !uuid3(s.teacherId)) throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435");
    for (const d of [s.effectiveFrom, s.effectiveTo]) if (d && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || dateKey(/* @__PURE__ */ new Date(`${d}T12:00:00`)) !== d)) throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0434\u0430\u0442\u0430 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F");
    if (!allowHistorical && s.effectiveFrom && s.effectiveTo && s.effectiveFrom > s.effectiveTo || s.repeat && !["weekly", "biweekly", "once"].includes(s.repeat) || ["biweekly", "once"].includes(s.repeat) && !s.effectiveFrom || s.repeat === "once" && (/* @__PURE__ */ new Date(`${s.effectiveFrom}T12:00:00`)).getDay() !== s.day) throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u043F\u043E\u0432\u0442\u043E\u0440\u0435\u043D\u0438\u0435 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F");
    const key = [s.day, s.start, s.effectiveFrom || "", s.effectiveTo || ""].join("|");
    if (slots.has(key)) throw Error("\u041F\u043E\u0432\u0442\u043E\u0440 \u0432\u0440\u0435\u043C\u0435\u043D\u0438 \u0432 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0438");
    slots.add(key);
  }
}
function checkLesson(l, groups) {
  if (!plain2(l) || !uuid3(l.id) || !uuid3(l.groupId) || l.teacherId != null && !uuid3(l.teacherId) || l.deleted !== void 0 && typeof l.deleted !== "boolean") throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u0437\u0430\u043D\u044F\u0442\u0438\u0435");
  validateLesson(l);
  const g = groups.find((g2) => g2.id === l.groupId);
  if (!g) throw Error("\u0417\u0430\u043D\u044F\u0442\u0438\u0435 \u0441\u0441\u044B\u043B\u0430\u0435\u0442\u0441\u044F \u043D\u0430 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0443\u044E \u0433\u0440\u0443\u043F\u043F\u0443");
  if (!plain2(l.attendance) || Object.entries(l.attendance).some(([id, mark]) => !uuid3(id) || !["present", "absent", "excused"].includes(mark))) throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u043F\u043E\u0441\u0435\u0449\u0430\u0435\u043C\u043E\u0441\u0442\u044C");
  if (l.snapshot !== void 0) validateSnapshot(l.snapshot);
}
async function buildTransfer({ kind, source, existing, users, overwrite = false }) {
  if (!["csv", "restore"].includes(kind) || typeof source !== "string" || source.length > 5e6) throw Error("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0444\u043E\u0440\u043C\u0430\u0442 \u0438 \u0440\u0430\u0437\u043C\u0435\u0440 \u0444\u0430\u0439\u043B\u0430 (\u0434\u043E 5 \u041C\u0411)");
  const groups = structuredClone(existing.groups), lessons = structuredClone(existing.lessons), changes = { groups: [], lessons: [], payments: [] }, details = [], warnings = [];
  const summary = { newGroups: 0, updatedGroups: 0, newStudents: 0, newLessons: 0, updatedLessons: 0, newPayments: 0, skipped: 0 };
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
      if (group.students.length > Math.max(10, old?.students.length || 0)) throw Error("CSV: \u043D\u0435 \u0431\u043E\u043B\u044C\u0448\u0435 10 \u0443\u0447\u0435\u043D\u0438\u043A\u043E\u0432 \u0432 \u043D\u043E\u0432\u043E\u0439 \u0433\u0440\u0443\u043F\u043F\u0435");
      validateGroup(group);
      const historical = groupHistory(old, { ...group, frozenLessons: old ? freezeLessons(old, existing.lessons, centreDate()) : {} }, centreDate());
      put("groups", historical);
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
    if (!await verifyBackup(copy)) warnings.push("\u0421\u0442\u0430\u0440\u0430\u044F \u043A\u043E\u043F\u0438\u044F \u0431\u0435\u0437 \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u043E\u0439 \u0441\u0443\u043C\u043C\u044B: \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0430 \u0438 \u0441\u0441\u044B\u043B\u043A\u0438 \u0431\u0443\u0434\u0443\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u044B, \u0446\u0435\u043B\u043E\u0441\u0442\u043D\u043E\u0441\u0442\u044C \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0433\u043E \u0444\u0430\u0439\u043B\u0430 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u043D\u0435\u043B\u044C\u0437\u044F.");
    const groupIDs = /* @__PURE__ */ new Set(), lessonIDs = /* @__PURE__ */ new Set(), userIDs = /* @__PURE__ */ new Set();
    for (const u of copy.users) {
      if (!plain2(u) || !uuid3(u.id) || userIDs.has(u.id) || typeof u.login !== "string") throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0435 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0438 \u0432 \u043A\u043E\u043F\u0438\u0438");
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
    if (copy.payments !== void 0) {
      const payments = restorePayments(copy.payments, existing.payments || [], mapTeacher);
      changes.payments = payments.added;
      summary.newPayments = payments.added.length;
      summary.skipped += payments.skipped;
      details.push(...payments.added.map((p) => ({ type: "payments", action: "create", label: `\u041E\u043F\u043B\u0430\u0442\u0430 \xB7 ${users.find((u) => u.id === p.teacher_id)?.name || p.teacher_id} \xB7 ${p.month} \xB7 ${p.subject} \xB7 ${p.minutes / 60} \u0447` })));
    } else warnings.push("\u0412 \u0441\u0442\u0430\u0440\u043E\u0439 \u043A\u043E\u043F\u0438\u0438 \u043D\u0435\u0442 \u0436\u0443\u0440\u043D\u0430\u043B\u0430 \u043E\u043F\u043B\u0430\u0442. \u0421\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0435 \u043E\u043F\u043B\u0430\u0442\u044B \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0442\u0441\u044F \u0431\u0435\u0437 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439.");
    for (const raw of copy.groups) {
      validateGroup(raw, true);
      if (groupIDs.has(raw.id)) throw Error("\u041F\u043E\u0432\u0442\u043E\u0440 ID \u0433\u0440\u0443\u043F\u043F\u044B \u0432 \u043A\u043E\u043F\u0438\u0438");
      groupIDs.add(raw.id);
      const old = groups.find((g) => g.id === raw.id);
      let value = { ...old || {}, ...structuredClone(raw), teacherId: mapTeacher(raw.teacherId), createdBy: raw.createdBy ? mapTeacher(raw.createdBy) : null, schedule: raw.schedule.map((s) => ({ ...s, ...s.teacherId ? { teacherId: mapTeacher(s.teacherId) } : {} })) };
      if (raw.history) value.history = raw.history.map((h) => {
        const schedule = (h.schedule || []).map((slot) => ({ ...slot, ...slot.teacherId ? { teacherId: mapTeacher(slot.teacherId) } : {} }));
        return { ...h, teacherId: mapTeacher(h.teacherId), schedule };
      });
      if (raw.frozenLessons) value.frozenLessons = Object.fromEntries(Object.entries(raw.frozenLessons).map(([id, snapshot]) => [id, mapSnapshot(snapshot, mapTeacher)]));
      if (old) {
        if (overwrite) {
          value.students = [...old.students.filter((s) => !raw.students.some((x) => x.id === s.id)), ...raw.students.map((s) => {
            const prior = { ...old.students.find((x) => x.id === s.id) };
            for (const k of [...profileKeys, "personId"]) delete prior[k];
            return { ...prior, ...s, personId: s.personId || null };
          })];
        } else {
          value = { ...old, students: [...old.students, ...raw.students.filter((s) => !old.students.some((x) => x.id === s.id))] };
        }
        summary.newStudents += value.students.length - old.students.length;
      } else summary.newStudents += value.students.length;
      validateGroup(value, true);
      put("groups", value);
    }
    for (const raw of copy.lessons) {
      if (!plain2(raw) || lessonIDs.has(raw.id)) throw Error("\u041F\u043E\u0432\u0442\u043E\u0440 ID \u0437\u0430\u043D\u044F\u0442\u0438\u044F \u0432 \u043A\u043E\u043F\u0438\u0438");
      lessonIDs.add(raw.id);
      const old = lessons.find((l) => l.id === raw.id);
      const value = { ...old || {}, ...structuredClone(raw), teacherId: mapTeacher(raw.teacherId), ...raw.snapshot ? { snapshot: mapSnapshot(raw.snapshot, mapTeacher) } : {} };
      checkLesson(value, groups);
      const slot = lessons.find((l) => l.id !== raw.id && l.groupId === raw.groupId && l.date === raw.date && l.start === raw.start);
      if (slot) throw Error(`\u0412\u0440\u0435\u043C\u044F ${raw.date} ${raw.start} \u0443\u0436\u0435 \u0437\u0430\u043D\u044F\u0442\u043E \u0434\u0440\u0443\u0433\u0438\u043C ID. \u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u043E\u0431\u044A\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E.`);
      if (old && !overwrite) {
        summary.skipped++;
        continue;
      }
      put("lessons", value);
    }
    warnings.push("\u0423\u0447\u0451\u0442\u043D\u044B\u0435 \u0437\u0430\u043F\u0438\u0441\u0438 \u0438 \u043F\u0430\u0440\u043E\u043B\u0438 \u043D\u0435 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u044E\u0442\u0441\u044F. \u0417\u0430\u043F\u0438\u0441\u0438, \u043A\u043E\u0442\u043E\u0440\u044B\u0445 \u043D\u0435\u0442 \u0432 \u0444\u0430\u0439\u043B\u0435, \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F. \u041E\u043F\u043B\u0430\u0442\u044B \u0434\u043E\u0431\u0430\u0432\u043B\u044F\u044E\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u043C ID, \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u044E\u0449\u0438\u0435 \u0437\u0430\u043F\u0438\u0441\u0438 \u043D\u0435 \u0437\u0430\u043C\u0435\u043D\u044F\u044E\u0442\u0441\u044F \u0434\u0430\u0436\u0435 \u0432 \u0440\u0435\u0436\u0438\u043C\u0435 \u0437\u0430\u043C\u0435\u043D\u044B \u0433\u0440\u0443\u043F\u043F \u0438 \u0437\u0430\u043D\u044F\u0442\u0438\u0439.");
  }
  assertSharedProfiles(groups);
  if (changes.groups.length > 1e3 || changes.lessons.length > 5e3) throw Error("\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u043D\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u0437\u0430 \u043E\u0434\u043D\u0443 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u044E");
  const checks = { groups: existing.groups.map((g) => ({ id: g.id, version: g.version })), lessons: existing.lessons.map((l) => ({ id: l.id, version: l.version })) };
  if (kind === "restore") checks.payments = restorePayments([], existing.payments || [], (id) => id).checks;
  return { changes, checks, summary, details, warnings, digest: await digest2({ kind, source, overwrite, changes, checks }) };
}

// src/scheduling.mjs
function generatePeriod(groups, period, existing) {
  if (!period || !["weeks", "months"].includes(period.unit) || !Number.isInteger(period.count) || period.count < 1 || period.count > (period.unit === "weeks" ? 4 : 6) || !/^\d{4}-\d{2}-\d{2}$/.test(period.start) || dateKey(/* @__PURE__ */ new Date(`${period.start}T12:00:00`)) !== period.start) throw Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043D\u0430\u0447\u0430\u043B\u043E \u0438 \u043F\u0435\u0440\u0438\u043E\u0434: 1\u20134 \u043D\u0435\u0434\u0435\u043B\u0438 \u0438\u043B\u0438 1\u20136 \u043C\u0435\u0441\u044F\u0446\u0435\u0432");
  const start = /* @__PURE__ */ new Date(`${period.start}T12:00:00`), end = new Date(start);
  if (period.unit === "weeks") end.setDate(end.getDate() + 7 * period.count);
  else {
    end.setDate(1);
    end.setMonth(end.getMonth() + period.count);
  }
  const until = dateKey(end), out = [];
  for (let m = new Date(start.getFullYear(), start.getMonth(), 1); m < end; m.setMonth(m.getMonth() + 1)) {
    out.push(...recurrence(groups, m.getFullYear(), m.getMonth(), [...existing, ...out]).filter((l) => l.date >= period.start && l.date < until));
  }
  return out;
}
function lessonConflicts(candidate, existing, groups) {
  if (candidate.deleted || candidate.status === "cancelled") return [];
  const byId = new Map(groups.map((g2) => [g2.id, g2]));
  const g = byId.get(candidate.groupId);
  if (!g) return [];
  const teacher = candidate.teacherId ?? g.teacherId, students = new Set(g.students.map(personId));
  const out = [];
  for (const l of existing) {
    if (l.id === candidate.id || l.deleted || l.status === "cancelled" || l.date !== candidate.date || candidate.start >= l.end || candidate.end <= l.start) continue;
    const other = byId.get(l.groupId);
    if (!other) continue;
    const reasons = [];
    if (g.id === other.id) reasons.push("\u0442\u0430 \u0436\u0435 \u0433\u0440\u0443\u043F\u043F\u0430");
    if (teacher && teacher === (l.teacherId ?? other.teacherId)) reasons.push("\u0442\u043E\u0442 \u0436\u0435 \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044C");
    const overlap = other.students.filter((s) => students.has(personId(s)));
    if (overlap.length) reasons.push(`\u043E\u0431\u0449\u0438\u0435 \u0443\u0447\u0435\u043D\u0438\u043A\u0438: ${overlap.length}`);
    if (reasons.length) out.push({ id: l.id, groupId: l.groupId, groupName: other.name, date: l.date, start: l.start, end: l.end, reasons });
    if (out.length >= 200) break;
  }
  return out;
}
function batchConflicts(lessons, existing, groups) {
  const out = [], seen = /* @__PURE__ */ new Set();
  for (const l of lessons) for (const c of lessonConflicts(l, [...existing, ...lessons], groups)) {
    const key = [l.id, c.id].sort().join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...c, candidateId: l.id, candidateGroup: groups.find((g) => g.id === l.groupId)?.name });
    if (out.length >= 200) return out;
  }
  return out;
}

// supabase/handler.mjs
var uuid4 = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
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
    if (!uuid4(payload.id) || !Number.isInteger(payload.version) || payload.version < 0) fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 ID \u0438\u043B\u0438 \u0432\u0435\u0440\u0441\u0438\u044F");
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
        if (new TextEncoder().encode(raw).length > (route.startsWith("transfer/") ? 12e6 : route === "trash/purge" ? 8e6 : 15e4)) fail("\u0417\u0430\u043F\u0440\u043E\u0441 \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u0439", 413);
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
      if (route === "payments" && request.method === "GET") {
        const rows = await all("payments", "at,id");
        return json({ payments: isManager(p.role) ? rows : rows.filter((r) => r.teacher_id === p.id) });
      }
      if (route === "payments" && request.method === "POST") {
        isAdmin();
        if (!uuid4(b.id) || !uuid4(b.teacherId) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(b.month) || typeof b.subject !== "string" || !b.subject.trim() || b.subject.length > 80 || /[\x00-\x1f\x7f]/.test(b.subject) || !["group", "individual"].includes(b.lessonType) || !Number.isInteger(b.minutes) || !b.minutes || Math.abs(b.minutes) > 6e4 || typeof b.note !== "string" || b.note.length > 500) fail("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043E\u043F\u043B\u0430\u0442\u0443: \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044C, \u043C\u0435\u0441\u044F\u0446, \u043F\u0440\u0435\u0434\u043C\u0435\u0442 \u0438 \u0447\u0430\u0441\u044B");
        const result = await backend("/rest/v1/rpc/orbita_record_payment", { method: "POST", body: { p_actor: p.id, p_iat: claims.iat, p_id: b.id, p_teacher: b.teacherId, p_month: b.month, p_subject: b.subject.trim(), p_type: b.lessonType, p_minutes: b.minutes, p_note: b.note.trim() } });
        return json({ ok: true, payment: result });
      }
      if (route === "trash/purge" && request.method === "POST") {
        if (p.role !== "owner") fail("\u041E\u043A\u043E\u043D\u0447\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0435 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0433\u043B\u0430\u0432\u043D\u043E\u043C\u0443 admin", 403);
        if (!uuid4(b.requestId) || !Array.isArray(b.items) || !b.items.length || b.items.length > 5e3) fail("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u043F\u0438\u0441\u0438");
        for (const i of b.items) {
          if (!["groups", "lessons"].includes(i.table) || !uuid4(i.id) || !Number.isInteger(i.version) || i.version < 1) fail("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u043F\u0438\u0441\u0438");
          if (i.table === "groups" && (!Array.isArray(i.children) || i.children.some((c) => !uuid4(c.id) || !Number.isInteger(c.version)))) fail("\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u0435 \u043A\u043E\u0440\u0437\u0438\u043D\u0443 \u043F\u0435\u0440\u0435\u0434 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0435\u043C \u0433\u0440\u0443\u043F\u043F\u044B");
        }
        const result = await backend("/rest/v1/rpc/orbita_purge_trash", { method: "POST", body: { p_actor: p.id, p_iat: claims.iat, p_request: b.requestId, p_items: b.items } });
        return json({ ok: true, ...result });
      }
      const operation = route.match(/^operations\/(students|calendar)\/(preview|commit)$/);
      if (operation && request.method === "POST") {
        const [, kind, step] = operation;
        if (kind === "students") isAdmin();
        if (step === "commit") {
          if (!uuid4(b.requestId) || typeof b.digest !== "string" || !/^[a-f0-9]{64}$/.test(b.digest)) fail("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F");
          const saved = await one("imports", b.requestId);
          if (saved) {
            if (saved.summary?.actor !== p.id || saved.summary?.digest !== b.digest) fail("ID \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0438 \u0443\u0436\u0435 \u0437\u0430\u043D\u044F\u0442", 409);
            return json({ ok: true, summary: saved.summary });
          }
        }
        const [gs, ls, profiles] = await Promise.all([all("groups", "id"), all("lessons", "id"), all("profiles", "id")]);
        const groups = gs.map((r) => ({ ...r.payload, version: r.version })), lessons = ls.map((r) => ({ ...r.payload, version: r.version }));
        let plan;
        try {
          if (kind === "students") {
            if (!isManager(p.role) && !groups.some((g) => !g.archived && canTeachGroup(p, g) && g.students.some((s) => personId(s) === b.input?.personId))) fail("\u0418\u0437\u043C\u0435\u043D\u044F\u0442\u044C \u043C\u043E\u0436\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0438 \u0441\u0432\u043E\u0438\u0445 \u0443\u0447\u0435\u043D\u0438\u043A\u043E\u0432", 403);
            plan = await studentPlan({ groups, lessons, input: b.input });
          } else {
            if (!Array.isArray(b.input?.groupIds) || !b.input.groupIds.length || b.input.groupIds.length > 1e3 || new Set(b.input.groupIds).size !== b.input.groupIds.length) fail("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0433\u0440\u0443\u043F\u043F\u044B");
            const chosen = b.input.groupIds.map((id) => groups.find((g) => g.id === id));
            if (chosen.some((g) => !g || g.archived || !canTeachGroup(p, g))) fail("\u041D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430\u044F \u0433\u0440\u0443\u043F\u043F\u0430", 403);
            const eligible = chosen.map((g) => ({ ...g, schedule: isManager(p.role) ? g.schedule : g.schedule.filter((s) => !s.teacherId || s.teacherId === p.id) }));
            const added = generatePeriod(eligible, b.input.period, lessons);
            if (added.length > 5e3) fail("\u041D\u0435 \u0431\u043E\u043B\u044C\u0448\u0435 5000 \u0437\u0430\u043D\u044F\u0442\u0438\u0439 \u0437\u0430 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u044E");
            for (const l of added) {
              validateLesson(l);
              l.id = await idFor(["calendar", l.groupId, l.date, l.start]);
              const g = groups.find((g2) => g2.id === l.groupId), tid = l.teacherId ?? g.teacherId;
              if (tid) {
                const t = profiles.find((t2) => t2.id === tid);
                if (!t || t.disabled || !canTeachGroup(t, { ...g, teacherId: tid })) fail("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044F \u0438 \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u044B\u0435 \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u044B");
              }
            }
            const changes = { groups: [], lessons: added.map((payload) => ({ expectedVersion: 0, payload })) }, checks = { groups: groups.map((g) => ({ id: g.id, version: g.version })), lessons: lessons.map((l) => ({ id: l.id, version: l.version })) };
            plan = { changes, checks, summary: { newGroups: 0, updatedGroups: 0, newStudents: 0, newLessons: added.length, updatedLessons: 0, skipped: 0 }, details: added.map((l) => ({ label: `${groups.find((g) => g.id === l.groupId).name} \xB7 ${l.date} ${l.start}\u2013${l.end}` })), warnings: [], conflicts: batchConflicts(added, lessons, groups), digest: await digest2({ input: b.input, changes, checks }) };
          }
        } catch (e) {
          fail(e.message, e.status || 400);
        }
        if (step === "preview") return json({ digest: plan.digest, summary: plan.summary, details: plan.details, warnings: plan.warnings, profile: plan.profile, conflicts: plan.conflicts || [] });
        if (b.digest !== plan.digest) fail("\u0414\u0430\u043D\u043D\u044B\u0435 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0438\u0441\u044C. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u0440\u0435\u0434\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440.", 409);
        if (plan.conflicts?.length && b.confirmConflicts !== true) fail("\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u0435 \u0437\u0430\u043D\u044F\u0442\u0438\u0439 \u0441 \u043F\u0435\u0440\u0435\u0441\u0435\u0447\u0435\u043D\u0438\u044F\u043C\u0438", 409);
        if (!plan.changes.groups.length && !plan.changes.lessons.length && !plan.changes.payments?.length) return json({ ok: true, summary: plan.summary });
        const summary = await backend("/rest/v1/rpc/orbita_apply_transfer", { method: "POST", body: { p_actor: p.id, p_iat: claims.iat, p_kind: kind, p_request: b.requestId, p_digest: plan.digest, p_changes: plan.changes, p_checks: plan.checks, p_summary: plan.summary } });
        return json({ ok: true, summary });
      }
      if (route === "transfer/history" && request.method === "GET") {
        if (p.role !== "owner") fail("\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u043A\u043E\u043F\u0438\u0439 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0433\u043B\u0430\u0432\u043D\u043E\u043C\u0443 admin", 403);
        const rows = await backend(query("imports", "source=in.(orbita-csv,orbita-restore,orbita-students,orbita-calendar,orbita-purge)&order=at.desc&limit=20&select=id,at,source,summary"));
        return json({ entries: rows.map((r) => ({ id: r.id, at: r.at, source: r.source, summary: r.summary })) });
      }
      const savedCopy = route.match(/^transfer\/backups\/([0-9a-f-]+)$/i);
      if (savedCopy && request.method === "GET") {
        if (p.role !== "owner") fail("\u0414\u043E\u0441\u0442\u0443\u043F \u0442\u043E\u043B\u044C\u043A\u043E \u0433\u043B\u0430\u0432\u043D\u043E\u043C\u0443 admin", 403);
        if (!uuid4(savedCopy[1])) fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 ID");
        const saved = await one("imports", savedCopy[1]);
        if (!saved || !["orbita-csv", "orbita-restore", "orbita-students", "orbita-calendar", "orbita-purge"].includes(saved.source)) fail("\u041A\u043E\u043F\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430", 404);
        await audit(p, "backup:journal", saved.id);
        return json(await sealBackup(saved.snapshot));
      }
      const transfer = route.match(/^transfer\/(csv|restore)\/(preview|commit)$/);
      if (transfer && request.method === "POST") {
        isAdmin();
        const [, kind, step] = transfer;
        if (kind === "restore" && p.role !== "owner") fail("\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0433\u043B\u0430\u0432\u043D\u043E\u043C\u0443 admin", 403);
        if (b.overwrite !== void 0 && typeof b.overwrite !== "boolean") fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0440\u0435\u0436\u0438\u043C \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F");
        if (step === "commit" && (!uuid4(b.requestId) || typeof b.digest !== "string" || !/^[a-f0-9]{64}$/.test(b.digest))) fail("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0444\u0430\u0439\u043B");
        if (step === "commit") {
          const applied = await one("imports", b.requestId);
          if (applied) {
            if (applied.summary?.actor !== p.id || applied.summary?.digest !== b.digest) fail("ID \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0438 \u0443\u0436\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D", 409);
            return json({ ok: true, summary: applied.summary });
          }
        }
        const [gs, ls, profiles, payments] = await Promise.all([all("groups", "id"), all("lessons", "id"), all("profiles", "id"), kind === "restore" ? all("payments", "id") : Promise.resolve([])]);
        const existing = { groups: gs.map((r) => ({ ...r.payload, version: r.version })), lessons: ls.map((r) => ({ ...r.payload, version: r.version })), payments };
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
        if (!plan.changes.groups.length && !plan.changes.lessons.length && !plan.changes.payments?.length) return json({ ok: true, summary: plan.summary });
        const summary = await backend("/rest/v1/rpc/orbita_apply_transfer", { method: "POST", body: { p_actor: p.id, p_iat: claims.iat, p_kind: kind, p_request: b.requestId, p_digest: plan.digest, p_changes: plan.changes, p_checks: plan.checks, p_summary: plan.summary } });
        return json({ ok: true, summary });
      }
      if (route === "backup" && request.method === "GET") {
        if (p.role !== "owner") fail("\u0420\u0435\u0437\u0435\u0440\u0432\u043D\u0430\u044F \u043A\u043E\u043F\u0438\u044F \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0433\u043B\u0430\u0432\u043D\u043E\u043C\u0443 admin", 403);
        const snapshot = await backend("/rest/v1/rpc/orbita_journal_backup", { method: "POST", body: {} });
        await audit(p, "backup:journal", "journal");
        return json(await sealBackup(snapshot));
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
        return json({ groups: groups.map((r) => ({ ...r.payload, ...r.payload.frozenLessons ? { frozenLessons: Object.fromEntries(Object.entries(r.payload.frozenLessons).map(([id, snapshot]) => [id, { ...snapshot, students: (snapshot.students || []).map((student) => visibleStudent(student, isManager(p.role))) }])) } : {}, history: (r.payload.history || []).map((h) => ({ ...h, students: (h.students || []).map((s) => visibleStudent(s, isManager(p.role))) })), students: r.payload.students.map((s) => visibleStudent({ ...s, personId: personId(s) }, isManager(p.role) || canTeachGroup(p, { teacherId: r.teacher_id, subject: r.payload.subject, createdBy: r.payload.createdBy }) || canTeachGroup(p, { teacherId: p.id, subject: r.payload.subject, createdBy: r.payload.createdBy }) && (r.payload.schedule?.some((t) => t.teacherId === p.id && t.active !== false) || lessons.some((l) => !l.payload.deleted && l.group_id === r.id && l.payload.teacherId === p.id)))), version: r.version })), lessons: lessons.filter((r) => {
          if (isManager(p.role) || !r.payload.deleted) return true;
          const g = groupLookup.get(r.group_id);
          return !!g && canTeachGroup(p, { teacherId: r.payload.teacherId ?? g.teacher_id, subject: g.payload.subject, createdBy: g.payload.createdBy });
        }).map((r) => ({ ...r.payload, ...r.payload.snapshot ? { snapshot: { ...r.payload.snapshot, students: (r.payload.snapshot.students || []).map((s) => visibleStudent(s, false)) } } : {}, version: r.version })), users: profiles.map((profile) => ({ ...publicProfile(profile), ...isManager(p.role) || profile.id === p.id ? passwordStatus(profile) : {}, ...isManager(p.role) ? { lastSeenAt: profile.last_seen_at || null, online: !profile.disabled && Date.parse(profile.last_seen_at) <= now() && Date.parse(profile.last_seen_at) > now() - 9e4 } : {} })) });
      }
      const match = route.match(/^(groups|lessons)\/([0-9a-f-]+)$/i);
      if (match && request.method === "PUT") {
        const [_, table, id] = match;
        if (!uuid4(id) || b.id !== id) fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 ID");
        let event = `save:${table}`;
        if (table === "groups") {
          const previous = await one("groups", id);
          if (b.deleted !== void 0 && typeof b.deleted !== "boolean") fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0435 \u0433\u0440\u0443\u043F\u043F\u044B");
          if (!isManager(p.role) && Boolean(b.deleted) !== Boolean(previous?.payload.deleted)) fail("\u0423\u0434\u0430\u043B\u044F\u0442\u044C \u0433\u0440\u0443\u043F\u043F\u044B \u043C\u043E\u0436\u0435\u0442 \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440", 403);
          if (b.lessonType !== void 0 && !["group", "individual"].includes(b.lessonType)) fail("\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u0444\u043E\u0440\u043C\u0430\u0442 \u0437\u0430\u043D\u044F\u0442\u0438\u0439");
          if (typeof b.name !== "string" || !b.name.trim() || b.name.length > 120 || typeof b.subject !== "string" || !b.subject.trim() || b.subject.trim().length > 80 || /[\x00-\x1f\x7f]/.test(b.subject) || b.teacherId != null && !uuid4(b.teacherId)) fail("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435, \u043F\u0440\u0435\u0434\u043C\u0435\u0442 \u0438 \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044F");
          const normalizedSubject = b.subject.trim();
          if (Array.isArray(b.students) && b.students.length > Math.max(10, previous?.payload.students?.length || 0)) fail("\u041D\u0435 \u0431\u043E\u043B\u044C\u0448\u0435 10 \u0443\u0447\u0435\u043D\u0438\u043A\u043E\u0432 \u0432 \u043D\u043E\u0432\u043E\u0439 \u0433\u0440\u0443\u043F\u043F\u0435");
          if (!Array.isArray(b.students) || b.students.length > 100 || !Array.isArray(b.schedule) || b.schedule.length > 20) fail("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0443\u0447\u0435\u043D\u0438\u043A\u043E\u0432 \u0438 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435");
          if (b.students.some((s) => !s || typeof s !== "object") || b.schedule.some((s) => !s || typeof s !== "object")) fail("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0443\u0447\u0435\u043D\u0438\u043A\u043E\u0432 \u0438 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435");
          for (const slot of b.schedule) if (slot.teacherId) {
            if (!uuid4(slot.teacherId)) fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044C \u0432 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0438");
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
          const people = /* @__PURE__ */ new Set();
          for (const s of b.students) {
            const pid = s.personId || previous?.payload.students?.find((x) => x.id === s.id)?.personId || s.id;
            if (people.has(pid)) fail("\u0423\u0447\u0435\u043D\u0438\u043A \u0443\u0436\u0435 \u0435\u0441\u0442\u044C \u0432 \u044D\u0442\u043E\u0439 \u0433\u0440\u0443\u043F\u043F\u0435");
            people.add(pid);
          }
          const t = b.teacherId ? await one("profiles", b.teacherId) : null;
          if (b.teacherId && (!t || t.disabled)) fail("\u041F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
          if (isManager(p.role) && t && !isManager(t.role) && subjects.includes(normalizedSubject) && !t.subjects?.includes(normalizedSubject)) fail("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0440\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u0435 \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044E \u044D\u0442\u043E\u0442 \u043F\u0440\u0435\u0434\u043C\u0435\u0442 \u0432 \u0435\u0433\u043E \u043F\u0440\u043E\u0444\u0438\u043B\u0435");
          if (!Array.isArray(b.students) || b.students.length > 100 || !Array.isArray(b.schedule) || b.schedule.length > 20) fail("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0443\u0447\u0435\u043D\u0438\u043A\u043E\u0432 \u0438 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435");
          const ids = /* @__PURE__ */ new Set();
          for (const s of b.students) {
            if (!uuid4(s.id) || ids.has(s.id) || typeof s.name !== "string" || !s.name.trim() || s.name.length > 240) fail("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0443\u0447\u0435\u043D\u0438\u043A\u043E\u0432");
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
          let common = [];
          if (b.students.some((s) => s.personId || previous?.payload.students?.some((x) => x.id === s.id))) {
            common = await all("groups", "id");
            for (const s of b.students) {
              const old = previous?.payload.students?.find((x) => x.id === s.id);
              const pid = s.personId || old?.personId || old?.id;
              if (!pid) continue;
              if (!uuid4(pid) || old && personId(old) !== pid) fail("\u0421\u0432\u044F\u0437\u0438 \u0443\u0447\u0435\u043D\u0438\u043A\u043E\u0432 \u043C\u0435\u043D\u044F\u044E\u0442\u0441\u044F \u0432 \u0440\u0430\u0437\u0434\u0435\u043B\u0435 \xAB\u0423\u0447\u0435\u043D\u0438\u043A\u0438\xBB");
              if (!old && !isManager(p.role)) fail("\u0421\u0432\u044F\u0437\u044B\u0432\u0430\u0442\u044C \u0443\u0447\u0435\u043D\u0438\u043A\u043E\u0432 \u043C\u043E\u0436\u0435\u0442 \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440", 403);
              const canonical = common.flatMap((g) => g.payload.students).find((x) => personId(x) === pid);
              if (!canonical || !sameProfile(canonical, s)) fail("\u041E\u0431\u0449\u0438\u0435 \u0424\u0418\u041E \u0438 \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u044B \u043C\u0435\u043D\u044F\u044E\u0442\u0441\u044F \u0432 \u0440\u0430\u0437\u0434\u0435\u043B\u0435 \xAB\u0423\u0447\u0435\u043D\u0438\u043A\u0438\xBB");
              s.personId = pid;
            }
          }
          if (Boolean(previous?.payload.archived) !== Boolean(b.archived)) event = b.archived ? "archive:groups" : "restore:groups";
          let groupPayload = { ...previous?.payload || {}, id, name: b.name.trim(), subject: normalizedSubject, teacherId: b.teacherId || null, createdBy: previous?.payload.createdBy || (!isManager(p.role) ? p.id : null), students: b.students.map((s) => {
            const old = previous?.payload.students?.find((x) => x.id === s.id) || {};
            const merged = { ...old, ...s };
            let normalized;
            try {
              normalized = studentRecord(merged);
            } catch (e) {
              fail(e.message);
            }
            const result = { ...old, ...normalized, personId: s.personId || old.personId || s.id };
            for (const key of contactKeys) if (!(key in normalized)) delete result[key];
            return result;
          }), schedule: b.schedule.map((s) => ({ day: s.day, start: s.start, end: s.end, ...s.id ? { id: s.id } : {}, effectiveFrom: s.effectiveFrom || null, effectiveTo: s.effectiveTo || null, ...s.repeat ? { repeat: s.repeat } : {}, active: s.active !== false, ...s.teacherId ? { teacherId: s.teacherId } : {} })), archived: Boolean(b.archived) || Boolean(b.deleted), deleted: Boolean(b.deleted), lessonType: b.lessonType || previous?.payload.lessonType || (/индивидуал/i.test(b.name) ? "individual" : "group"), version: b.version };
          if (previous) {
            const records = await all("lessons", "id");
            groupPayload.frozenLessons = freezeLessons(previous.payload, records.map((r) => r.payload), centreDate(now()));
          }
          groupPayload = groupHistory(previous?.payload, groupPayload, centreDate(now()));
          const linking = b.students.some((s) => s.personId && !previous?.payload.students?.some((old) => old.id === s.id));
          if (linking) {
            const ls = await all("lessons", "id");
            const checks = { groups: common.map((r) => ({ id: r.id, version: r.version })), lessons: ls.map((r) => ({ id: r.id, version: r.version })) };
            const changes = { groups: [{ expectedVersion: b.version, payload: groupPayload }], lessons: [] };
            await backend("/rest/v1/rpc/orbita_apply_transfer", { method: "POST", body: { p_actor: p.id, p_iat: claims.iat, p_kind: "students", p_request: crypto.randomUUID(), p_digest: await digest2({ changes, checks }), p_changes: changes, p_checks: checks, p_summary: { newGroups: previous ? 0 : 1, updatedGroups: previous ? 1 : 0, newStudents: b.students.filter((s) => !previous?.payload.students?.some((x) => x.id === s.id)).length, newLessons: 0, updatedLessons: 0 } } });
          } else await save(table, groupPayload, { teacher_id: b.teacherId || null });
        } else {
          try {
            validateLesson(b);
          } catch (e) {
            fail(e.message);
          }
          if (!uuid4(b.groupId)) fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0433\u0440\u0443\u043F\u043F\u0430");
          const g = await one("groups", b.groupId);
          if (!g) fail("\u0413\u0440\u0443\u043F\u043F\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430");
          const old = await one("lessons", id);
          if (b.virtual && (!Number.isInteger(b.groupVersion) || b.groupVersion !== g.version)) fail("\u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u043E\u0441\u044C. \u0417\u0430\u043A\u0440\u043E\u0439\u0442\u0435 \u0437\u0430\u043D\u044F\u0442\u0438\u0435 \u0438 \u043E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0435\u0433\u043E \u0437\u0430\u043D\u043E\u0432\u043E.", 409);
          const shifted = !old || ["groupId", "date", "start", "end", "teacherId"].some((k) => (old.payload[k] ?? null) !== (b[k] ?? null)) || old.payload.status === "cancelled" && b.status !== "cancelled";
          if (shifted && b.confirmConflicts !== true) {
            const [allGroups, allLessons] = await Promise.all([all("groups", "id"), all("lessons", "id")]);
            if (lessonConflicts(b, calendarMonth(allGroups.map((r) => r.payload), allLessons.map((r) => r.payload), Number(b.date.slice(0, 4)), Number(b.date.slice(5, 7)) - 1, centreDate(now())).filter((l) => !(l.virtual && l.groupId === b.groupId && l.date === b.date && l.start === b.start)), allGroups.map((r) => r.payload)).length) fail("\u0415\u0441\u0442\u044C \u043F\u0435\u0440\u0435\u0441\u0435\u0447\u0435\u043D\u0438\u044F \u0437\u0430\u043D\u044F\u0442\u0438\u0439. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043F\u0440\u0435\u0434\u0443\u043F\u0440\u0435\u0436\u0434\u0435\u043D\u0438\u0435 \u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435.", 409);
          }
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
            if (!uuid4(b.teacherId)) fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044C");
            const t = await one("profiles", b.teacherId);
            if (!t || t.disabled) fail("\u041F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044C \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
            if (!isManager(t.role) && subjects.includes(g.payload.subject) && !t.subjects?.includes(g.payload.subject) && g.payload.createdBy !== t.id) fail("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0440\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u0435 \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044E \u044D\u0442\u043E\u0442 \u043F\u0440\u0435\u0434\u043C\u0435\u0442 \u0432 \u0435\u0433\u043E \u043F\u0440\u043E\u0444\u0438\u043B\u0435");
          }
          if (g.payload.archived && (!old || old.group_id !== g.id)) fail("\u0413\u0440\u0443\u043F\u043F\u0430 \u0432 \u0430\u0440\u0445\u0438\u0432\u0435");
          if (!b.attendance || typeof b.attendance !== "object" || Array.isArray(b.attendance)) fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u043F\u043E\u0441\u0435\u0449\u0430\u0435\u043C\u043E\u0441\u0442\u044C");
          const historical = old?.payload.snapshot || lessonGroup(g.payload, old?.payload || b);
          for (const [sid, mark] of Object.entries(b.attendance)) if (!["present", "absent", "excused"].includes(mark) || !(historical.students || []).some((s) => s.id === sid) && old?.payload.attendance?.[sid] !== mark) fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u043E\u0442\u043C\u0435\u0442\u043A\u0430");
          await save(table, { ...old?.payload || {}, id, snapshot: old?.group_id === b.groupId && old.payload.snapshot ? old.payload.snapshot : { name: historical.name, subject: historical.subject, teacherId: historical.teacherId, lessonType: historical.lessonType, students: (historical.students || []).map((s) => ({ id: s.id, name: s.name, personId: s.personId || s.id })) }, manual: old?.payload.manual ?? !b.virtual, deleted: Boolean(b.deleted), teacherId: b.teacherId || null, groupId: b.groupId, date: b.date, start: b.start, end: b.end, status: b.status, report: b.report, attendance: b.attendance, version: b.version }, { group_id: b.groupId, date: b.date, start: b.start });
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
        if (!uuid4(id)) fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 ID");
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
