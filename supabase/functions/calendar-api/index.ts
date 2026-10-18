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

// supabase/handler.mjs
var uuid = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
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
    if (!uuid(payload.id) || !Number.isInteger(payload.version) || payload.version < 0) fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 ID \u0438\u043B\u0438 \u0432\u0435\u0440\u0441\u0438\u044F");
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
        if (new TextEncoder().encode(raw).length > 15e4) fail("\u0417\u0430\u043F\u0440\u043E\u0441 \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u0439", 413);
        try {
          b = JSON.parse(raw || "{}");
        } catch {
          fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 JSON");
        }
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
        await audit(p, b.event, p.id);
        return json({ ok: true });
      }
      if (p.must_change) fail("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u043C\u0435\u043D\u0438\u0442\u0435 \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u044B\u0439 \u043F\u0430\u0440\u043E\u043B\u044C", 403);
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
        return json({ groups: groups.map((r) => ({ ...r.payload, version: r.version })), lessons: lessons.filter((r) => isManager(p.role) || !r.payload.deleted).map((r) => ({ ...r.payload, version: r.version })), users: profiles.map((profile) => ({ ...publicProfile(profile), ...isManager(p.role) || profile.id === p.id ? passwordStatus(profile) : {}, ...isManager(p.role) ? { lastSeenAt: profile.last_seen_at || null, online: !profile.disabled && Date.parse(profile.last_seen_at) <= now() && Date.parse(profile.last_seen_at) > now() - 9e4 } : {} })) });
      }
      const match = route.match(/^(groups|lessons)\/([0-9a-f-]+)$/i);
      if (match && request.method === "PUT") {
        const [_, table, id] = match;
        if (!uuid(id) || b.id !== id) fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 ID");
        let event = `save:${table}`;
        if (table === "groups") {
          const previous = await one("groups", id);
          if (typeof b.name !== "string" || !b.name.trim() || b.name.length > 120 || typeof b.subject !== "string" || !b.subject.trim() || b.subject.trim().length > 80 || /[\x00-\x1f\x7f]/.test(b.subject) || b.teacherId != null && !uuid(b.teacherId)) fail("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435, \u043F\u0440\u0435\u0434\u043C\u0435\u0442 \u0438 \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044F");
          const normalizedSubject = b.subject.trim();
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
            if (!uuid(s.id) || ids.has(s.id) || typeof s.name !== "string" || !s.name.trim() || s.name.length > 120) fail("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0443\u0447\u0435\u043D\u0438\u043A\u043E\u0432");
            ids.add(s.id);
          }
          const slots = /* @__PURE__ */ new Set();
          for (const s of b.schedule) {
            if (!Number.isInteger(s.day) || s.day < 0 || s.day > 6 || ![s.start, s.end].every((t2) => typeof t2 === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t2)) || duration(s.start, s.end) <= 0) fail("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435");
            if ([s.effectiveFrom, s.effectiveTo].some((d) => d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) || s.effectiveFrom && s.effectiveTo && s.effectiveFrom > s.effectiveTo) fail("\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0434\u0430\u0442\u044B \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F");
            const k = `${s.day}-${s.start}-${s.effectiveFrom || ""}-${s.effectiveTo || ""}`;
            if (slots.has(k)) fail("\u041F\u043E\u0432\u0442\u043E\u0440 \u0432\u0440\u0435\u043C\u0435\u043D\u0438 \u0432 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0438");
            slots.add(k);
          }
          if (Boolean(previous?.payload.archived) !== Boolean(b.archived)) event = b.archived ? "archive:groups" : "restore:groups";
          await save(table, { ...previous?.payload || {}, id, name: b.name.trim(), subject: normalizedSubject, teacherId: b.teacherId || null, createdBy: previous?.payload.createdBy || (!isManager(p.role) ? p.id : null), students: b.students.map((s) => ({ id: s.id, name: s.name.trim() })), schedule: b.schedule.map((s) => ({ day: s.day, start: s.start, end: s.end, ...s.id ? { id: s.id } : {}, effectiveFrom: s.effectiveFrom || null, effectiveTo: s.effectiveTo || null, active: s.active !== false, ...s.teacherId ? { teacherId: s.teacherId } : {} })), archived: Boolean(b.archived), version: b.version }, { teacher_id: b.teacherId });
        } else {
          validateLesson(b);
          if (!uuid(b.groupId)) fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0433\u0440\u0443\u043F\u043F\u0430");
          const g = await one("groups", b.groupId);
          if (!g) fail("\u0413\u0440\u0443\u043F\u043F\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430");
          const old = await one("lessons", id);
          if (b.deleted !== void 0 && typeof b.deleted !== "boolean") fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u044F");
          if (!isManager(p.role) && (old?.payload.deleted || Boolean(b.deleted) !== Boolean(old?.payload.deleted))) fail("\u0423\u0434\u0430\u043B\u044F\u0442\u044C \u0438 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u0442\u044C \u0437\u0430\u043D\u044F\u0442\u0438\u044F \u043C\u043E\u0436\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440", 403);
          if (Boolean(b.deleted) !== Boolean(old?.payload.deleted)) event = b.deleted ? "delete:lessons" : "restore:lessons";
          const permitted = (group, lesson) => canTeachGroup(p, group && { teacherId: lesson?.teacherId ?? group.teacher_id, subject: group.payload.subject, createdBy: group.payload.createdBy });
          if (!permitted(g, b) || old && !permitted(await one("groups", old.group_id), old.payload)) fail("\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043C\u043E\u0436\u043D\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0441\u0432\u043E\u0438 \u0433\u0440\u0443\u043F\u043F\u044B \u043F\u043E \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u044B\u043C \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u0430\u043C", 403);
          if (!isManager(p.role) && (b.teacherId ?? null) !== (old?.payload.teacherId ?? null)) fail("\u041D\u0430\u0437\u043D\u0430\u0447\u0430\u0442\u044C \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044F \u043C\u043E\u0436\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440", 403);
          if (b.teacherId && !uuid(b.teacherId)) fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044C");
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
        if (!uuid(id)) fail("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 ID");
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
