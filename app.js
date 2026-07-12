const STORAGE_KEY = "wedding-pm-state-v2";
const USER_STORAGE_KEY = "wedding-pm-user-v1";
const ACTIVE_WORKSPACE_KEY = "wedding-pm-active-workspace-v1";
const VENDOR_DB_NAME = "wedding-pm-vendor-files";
const VENDOR_STORE = "caseImages";
const IDEA_STORE = "ideaImages";
const COVER_STORE = "coverImages";
const MAX_VENDOR_FILE_SIZE = 100 * 1024 * 1024;
const MEDIA_BUCKET = "wedding-media";
const SUPABASE_URL = "https://pcxxtgewmverwqmrijlo.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_JIW4FwbiDd1OwUh0ZoAYGQ_2v_-Wjq6";
const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const initialState = {
  weddingDate: "2026-10-18",
  cover: "",
  coverY: 50,
  guestTags: ["男方亲戚", "女方亲戚", "男方同学", "女方同学"],
  vendorTags: ["摄影", "摄像", "婚庆", "酒店", "司仪", "化妆", "花艺", "甜品", "礼服"],
  ideaTags: ["婚礼布置", "婚纱照", "婚纱"],
  tasks: [],
  budget: [],
  vendors: [],
  guests: [],
  ideas: [],
  seating: {
    tables: [
      { id: 1, name: "1桌", guestIds: [] }
    ]
  },
  timeline: []
};

let state = loadState();
let currentUser = loadUser();
let currentSession = null;
let currentWorkspace = null;
let workspaceMembers = [];
let pendingInvites = [];
let appReady = false;
let remoteSaveTimer = 0;
let vendorDbPromise;
let vendorImageUrls = new Map();
let ideaImageUrls = new Map();
let coverImageUrls = new Map();
let pendingCover = "";
let pendingCoverUrl = "";
let guestFilter = "all";
let vendorFilter = "all";
let ideaFilter = "all";
let calendarMonth = new Date();
let calendarMonthInitialized = false;
const taskCategories = ["统筹", "场地", "供应商", "宾客", "预算", "设计", "采购", "当天流程"];

const views = {
  overview: document.querySelector("#overviewView"),
  tasks: document.querySelector("#tasksView"),
  budget: document.querySelector("#budgetView"),
  vendors: document.querySelector("#vendorsView"),
  ideas: document.querySelector("#ideasView"),
  guests: document.querySelector("#guestsView"),
  timeline: document.querySelector("#timelineView")
};

const titles = {
  overview: "总览仪表盘",
  tasks: "任务管理",
  budget: "预算管理",
  vendors: "供应商管理",
  ideas: "创意中心",
  guests: "宾客管理",
  timeline: "婚礼当天流程"
};

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return normalizeState(structuredClone(initialState));
  try {
    return normalizeState({ ...structuredClone(initialState), ...JSON.parse(saved) });
  } catch {
    return normalizeState(structuredClone(initialState));
  }
}

function normalizeState(value) {
  if (!("cover" in value)) value.cover = "";
  if (!("coverY" in value)) value.coverY = 50;
  if (!Array.isArray(value.guestTags) || !value.guestTags.length) {
    value.guestTags = structuredClone(initialState.guestTags);
  }
  value.guestTags = [...new Set([...initialState.guestTags, ...value.guestTags].filter(Boolean))];
  if (!Array.isArray(value.vendorTags) || !value.vendorTags.length) {
    value.vendorTags = structuredClone(initialState.vendorTags);
  }
  value.vendorTags = [...new Set([...initialState.vendorTags, ...value.vendorTags].filter(Boolean))];
  if (!Array.isArray(value.vendors)) value.vendors = [];
  value.vendors.forEach((vendor) => {
    if (!vendor.type) vendor.type = "摄影";
    if (!Array.isArray(vendor.images)) vendor.images = vendor.imageName ? [vendor.id] : [];
    if (!vendor.description) vendor.description = "";
    if (!vendor.sourceUrl) vendor.sourceUrl = "";
    if (!value.vendorTags.includes(vendor.type)) value.vendorTags.push(vendor.type);
  });
  if (!Array.isArray(value.ideaTags) || !value.ideaTags.length) {
    value.ideaTags = structuredClone(initialState.ideaTags);
  }
  value.ideaTags = [...new Set([...initialState.ideaTags, ...value.ideaTags].filter(Boolean))];
  if (!Array.isArray(value.ideas)) value.ideas = [];
  value.ideas.forEach((idea) => {
    if (!idea.category) idea.category = "婚礼布置";
    if (!Array.isArray(idea.images)) idea.images = idea.imageData ? [idea.imageData] : [];
    if (!idea.summary) idea.summary = idea.title || idea.category || "未命名创意";
    if (!idea.description) idea.description = "";
    if (!value.ideaTags.includes(idea.category)) value.ideaTags.push(idea.category);
  });
  if (!Array.isArray(value.guests)) value.guests = [];
  value.guests.forEach((guest) => {
    if (!("relatedGuestId" in guest)) guest.relatedGuestId = "";
    if (!guest.group) guest.group = "女方亲戚";
  });
  if (!value.seating) value.seating = structuredClone(initialState.seating);
  if (!Array.isArray(value.seating.tables) || !value.seating.tables.length) {
    value.seating.tables = structuredClone(initialState.seating.tables);
  }
  value.seating.tables.forEach((table, index) => {
    if (!table.id) table.id = Date.now() + index;
    if (!table.name) table.name = `${index + 1}桌`;
    if (!Array.isArray(table.guestIds)) table.guestIds = [];
  });
  return value;
}

function saveState() {
  saveStateCache();
  queueRemoteSave();
}

function saveStateCache() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(compactStateForStorage(state)));
  } catch (error) {
    console.warn("本地缓存空间不足，已跳过本地缓存。协作数据仍会保存到 Supabase。", error.message);
  }
}

function loadUser() {
  const saved = localStorage.getItem(USER_STORAGE_KEY);
  if (!saved) return { name: "", email: "", avatar: "", cover: "", coverY: 50, mediaReady: false };
  try {
    return { name: "", email: "", avatar: "", cover: "", coverY: 50, mediaReady: false, ...JSON.parse(saved) };
  } catch {
    return { name: "", email: "", avatar: "", cover: "", coverY: 50, mediaReady: false };
  }
}

function saveUser() {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(currentUser));
}

function activeWorkspaceStorageKey(user) {
  return `${ACTIVE_WORKSPACE_KEY}:${user.id}`;
}

function rememberActiveWorkspace(user, workspaceId) {
  if (!user?.id || !workspaceId) return;
  localStorage.setItem(activeWorkspaceStorageKey(user), workspaceId);
}

function text(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function extractUrl(value) {
  const match = String(value || "").match(/https?:\/\/[^\s"'<>，。；、）)]+/i);
  if (!match) return "";
  return match[0].replace(/[),.!?]+$/u, "");
}

function setAuthMessage(message, type = "info") {
  const element = document.querySelector("#authMessage");
  element.textContent = message || "";
  element.dataset.type = type;
}

function showAuthGate(message = "") {
  document.querySelector("#authGate").classList.remove("hidden");
  document.querySelector("#appShell").classList.add("is-locked");
  setAuthMessage(message);
}

function hideAuthGate() {
  document.querySelector("#authGate").classList.add("hidden");
  document.querySelector("#appShell").classList.remove("is-locked");
}

function requireSupabase() {
  if (supabaseClient) return true;
  showAuthGate("没有加载到登录服务，请刷新页面再试。", "error");
  return false;
}

function queueRemoteSave() {
  if (!appReady || !supabaseClient || !currentWorkspace?.id) return;
  window.clearTimeout(remoteSaveTimer);
  remoteSaveTimer = window.setTimeout(saveWorkspaceState, 450);
}

async function saveWorkspaceState() {
  if (!currentWorkspace?.id) return;
  const { error } = await supabaseClient
    .from("wedding_workspaces")
    .update({ state: compactStateForStorage(state), updated_at: new Date().toISOString() })
    .eq("id", currentWorkspace.id);
  if (error) console.warn("保存协作数据失败", error.message);
}

function compactStateForStorage(sourceState) {
  const compactState = structuredClone(sourceState);
  if (isInlineMedia(compactState.cover)) compactState.cover = "";
  compactState.ideas = (compactState.ideas || []).map((idea) => ({
    ...idea,
    images: (idea.images || []).filter((image) => !isInlineMedia(image)),
    imageData: ""
  }));
  return compactState;
}

function isInlineMedia(value) {
  return String(value || "").startsWith("data:") || String(value || "").startsWith("blob:");
}

function isRemoteMedia(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function money(value) {
  return `¥${Number(value || 0).toLocaleString("zh-CN")}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function coverOffset(value) {
  return (50 - Number(value || 50)) * 0.7;
}

function openVendorDb() {
  if (vendorDbPromise) return vendorDbPromise;
  vendorDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(VENDOR_DB_NAME, 2);
    request.onupgradeneeded = () => {
      [VENDOR_STORE, IDEA_STORE, COVER_STORE].forEach((store) => {
        if (!request.result.objectStoreNames.contains(store)) {
          request.result.createObjectStore(store);
        }
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return vendorDbPromise;
}

async function saveMediaBlob(store, id, file) {
  const db = await openVendorDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(file, String(id));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteMediaBlob(store, id) {
  const db = await openVendorDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(String(id));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getMediaUrl(store, cache, id) {
  if (!id) return "";
  if (isInlineMedia(id) || isRemoteMedia(id)) return id;
  if (cache.has(id)) return cache.get(id);
  const db = await openVendorDb();
  const blob = await new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const request = tx.objectStore(store).get(String(id));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (!blob) return "";
  const url = URL.createObjectURL(blob);
  cache.set(id, url);
  return url;
}

async function saveVendorImage(id, file) {
  await saveMediaBlob(VENDOR_STORE, id, file);
}

async function saveVendorCaseImage(file) {
  const remoteUrl = await uploadMediaToStorage(file, "vendors");
  if (remoteUrl) return remoteUrl;
  const id = mediaId("vendor");
  await saveVendorImage(id, file);
  return id;
}

async function deleteVendorImage(id) {
  await deleteMediaBlob(VENDOR_STORE, id);
}

async function getVendorImageUrl(id) {
  return getMediaUrl(VENDOR_STORE, vendorImageUrls, id);
}

function mediaId(prefix) {
  const suffix = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

async function saveIdeaImage(file) {
  const remoteUrl = await uploadMediaToStorage(file, "ideas");
  if (remoteUrl) return remoteUrl;
  const id = mediaId("idea");
  await saveMediaBlob(IDEA_STORE, id, file);
  return id;
}

async function getIdeaImageUrl(id) {
  return getMediaUrl(IDEA_STORE, ideaImageUrls, id);
}

async function saveCoverImage(file) {
  const remoteUrl = await uploadMediaToStorage(file, "covers");
  if (remoteUrl) return remoteUrl;
  const id = mediaId("cover");
  await saveMediaBlob(COVER_STORE, id, file);
  return id;
}

async function getCoverImageUrl(id) {
  return getMediaUrl(COVER_STORE, coverImageUrls, id);
}

async function uploadMediaToStorage(file, folder) {
  if (!supabaseClient || !currentSession?.user || !currentWorkspace?.id) return "";
  const extension = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "jpg";
  const path = `${currentWorkspace.id}/${folder}/${mediaId("media")}.${extension}`;
  const { error } = await supabaseClient.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, { cacheControl: "31536000", contentType: file.type, upsert: false });
  if (error) {
    console.warn("上传图片到 Supabase Storage 失败，已使用本地存储兜底。", error.message);
    return "";
  }
  const { data } = supabaseClient.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return data?.publicUrl || "";
}

function profileName(user) {
  return user?.user_metadata?.display_name || user?.email?.split("@")[0] || "协作账号";
}

async function ensureProfile(user, name = "") {
  const { data: existingProfile } = await supabaseClient
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const displayName = name || existingProfile?.display_name || profileName(user);
  const sameAccount = currentUser.email === user.email && currentUser.mediaReady;
  const { error } = await supabaseClient.from("profiles").upsert({
    id: user.id,
    email: user.email,
    display_name: displayName,
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
  currentUser = {
    ...currentUser,
    name: displayName,
    email: user.email,
    avatar: sameAccount ? currentUser.avatar : "",
    cover: sameAccount ? currentUser.cover : "",
    coverY: sameAccount ? currentUser.coverY : 50,
    mediaReady: true
  };
  saveUser();
}

async function createWorkspaceForUser(user) {
  const workspaceName = `${profileName(user)}的婚礼计划`;
  const { data: workspace, error } = await supabaseClient.rpc("create_user_workspace", {
    workspace_name: workspaceName,
    workspace_state: structuredClone(initialState)
  });
  if (error) throw error;
  return workspace;
}

async function loadCurrentWorkspace(user) {
  const { data: memberships, error } = await supabaseClient
    .from("wedding_memberships")
    .select("role, created_at, workspace:wedding_workspaces(id, name, state, updated_at)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const savedWorkspaceId = localStorage.getItem(activeWorkspaceStorageKey(user));
  const savedMembership = memberships?.find((item) => item.workspace?.id === savedWorkspaceId);
  const workspace = savedMembership?.workspace || memberships?.[0]?.workspace || (await createWorkspaceForUser(user));
  rememberActiveWorkspace(user, workspace.id);
  currentWorkspace = workspace;
  state = normalizeState({ ...structuredClone(initialState), ...(workspace.state || {}) });
  if (!state.cover && currentUser.cover) {
    state.cover = currentUser.cover;
    state.coverY = currentUser.coverY || 50;
    workspace.state = state;
    await saveWorkspaceState();
  }
  saveStateCache();
  await loadWorkspaceMembers();
}

async function loadWorkspaceMembers() {
  workspaceMembers = [];
  if (!currentWorkspace?.id) return;
  const { data, error } = await supabaseClient.rpc("get_workspace_members", {
    workspace_id: currentWorkspace.id
  });
  if (error) {
    console.warn("读取协作成员失败", error.message);
    return;
  }
  workspaceMembers = data || [];
}

async function loadInvitations() {
  if (!currentSession?.user?.email) return;
  const { data, error } = await supabaseClient
    .from("wedding_invitations")
    .select("id, status, created_at, workspace:wedding_workspaces(id, name)")
    .eq("invitee_email", currentSession.user.email.toLowerCase())
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) {
    pendingInvites = [];
    console.warn("读取协作邀请失败", error.message);
    return;
  }
  pendingInvites = data || [];
}

async function enterApplication(session) {
  if (!session?.user) {
    appReady = false;
    showAuthGate();
    return;
  }
  currentSession = session;
  appReady = false;
  try {
    await ensureProfile(session.user);
    await loadCurrentWorkspace(session.user);
    await loadInvitations();
    appReady = true;
    hideAuthGate();
    renderAll();
  } catch (error) {
    const message = error.name === "QuotaExceededError" || error.message.includes("exceeded the quota")
      ? "浏览器本地缓存空间不足，图片较多时会出现这个提示。请刷新页面重试，协作数据会优先使用 Supabase 保存。"
      : error.message.includes("statement timeout")
        ? "远程数据加载超时：通常是旧版本把图片写进数据库导致数据过大。请在 Supabase SQL Editor 运行 supabase-clean-large-media.sql 后再刷新。"
      : `数据库还没准备好：${error.message}。请先运行 supabase-schema.sql。`;
    showAuthGate(message, "error");
  }
}

async function sendInvite(email) {
  const inviteeEmail = email.trim().toLowerCase();
  if (!inviteeEmail || !currentWorkspace?.id || !currentSession?.user) return;
  const { error } = await supabaseClient.from("wedding_invitations").insert({
    workspace_id: currentWorkspace.id,
    inviter_id: currentSession.user.id,
    invitee_email: inviteeEmail,
    status: "pending"
  });
  if (error) {
    window.alert(`邀请发送失败：${error.message}`);
    return;
  }
  document.querySelector("#inviteEmailInput").value = "";
  window.alert("邀请已发送。对方注册/登录后会在账号窗口看到邀请。");
}

async function acceptInvite(invitationId) {
  if (!currentSession?.user) return false;
  const { data: workspace, error } = await supabaseClient.rpc("accept_workspace_invitation", {
    invitation_id: invitationId
  });
  if (error) {
    window.alert(`加入协作失败：${error.message}`);
    return false;
  }

  if (workspace?.id) rememberActiveWorkspace(currentSession.user, workspace.id);
  await loadCurrentWorkspace(currentSession.user);
  await loadInvitations();
  renderAll();
  closeModal("accountModal");
  return true;
}

function daysBetween(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateString);
  return Math.ceil((target - today) / 86400000);
}

function parseDate(dateString) {
  if (!dateString) return null;
  const [year, month, day] = String(dateString).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weddingYear() {
  return parseDate(state.weddingDate)?.getFullYear() || new Date().getFullYear();
}

function parseTaskImportDate(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";
  const endValue = rawValue
    .replace(/[－—–]/g, "-")
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean)
    .pop() || rawValue;
  const normalized = endValue
    .replace(/年/g, "/")
    .replace(/月/g, "/")
    .replace(/日/g, "")
    .replace(/\./g, "/");
  const fullDate = normalized.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (fullDate) {
    const [, year, month, day] = fullDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const monthDay = normalized.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (monthDay) {
    const [, month, day] = monthDay;
    return `${weddingYear()}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return "";
}

function defaultTaskOwner() {
  return memberDisplayName(workspaceMembers[0] || { display_name: currentUser.name, email: currentUser.email });
}

function taskImportCell(row, headers, name) {
  const index = headers[name];
  return index === undefined ? "" : String(row[index] || "").trim();
}

function findTaskImportHeaders(rows) {
  const aliases = {
    time: ["时间", "日期", "截止日期"],
    title: ["事项", "任务", "任务名称"],
    details: ["详细任务", "任务内容", "详细内容"],
    owner: ["负责人", "负责"],
    note: ["备注", "说明"]
  };
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex += 1) {
    const row = rows[rowIndex].map((cell) => String(cell || "").trim());
    const headers = {};
    Object.entries(aliases).forEach(([key, labels]) => {
      const index = row.findIndex((cell) => labels.some((label) => cell.includes(label)));
      if (index >= 0) headers[key] = index;
    });
    if (headers.title !== undefined || headers.details !== undefined) return { rowIndex, headers };
  }
  return null;
}

function parseDelimitedRows(textValue) {
  return String(textValue || "")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => line.split(line.includes("\t") ? "\t" : ",").map((cell) => cell.trim()));
}

async function readTaskImportRows(file) {
  if (/\.(csv|tsv)$/i.test(file.name)) {
    return parseDelimitedRows(await file.text());
  }
  if (!window.XLSX) {
    window.alert("Excel 解析工具还没加载完成，请刷新页面后再试一次。");
    return [];
  }
  const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
}

async function importTasksFromFile(file) {
  const rows = await readTaskImportRows(file);
  const headerInfo = findTaskImportHeaders(rows);
  if (!headerInfo) {
    window.alert("没有识别到任务表头。请确认表头包含“时间、事项、详细任务、负责人、备注”等字段。");
    return;
  }
  const importedTasks = rows.slice(headerInfo.rowIndex + 1)
    .map((row, index) => {
      const title = taskImportCell(row, headerInfo.headers, "title");
      const details = taskImportCell(row, headerInfo.headers, "details");
      const owner = taskImportCell(row, headerInfo.headers, "owner");
      const note = taskImportCell(row, headerInfo.headers, "note");
      if (!title && !details) return null;
      const detailLines = [details, note && `备注：${note}`].filter(Boolean);
      return {
        id: Date.now() + index,
        title: title || details.slice(0, 24) || "未命名任务",
        details: detailLines.join("\n") || "暂无任务内容",
        owner: owner || defaultTaskOwner(),
        due: parseTaskImportDate(taskImportCell(row, headerInfo.headers, "time")) || state.weddingDate,
        phase: title || "统筹",
        status: "todo"
      };
    })
    .filter(Boolean);
  if (!importedTasks.length) {
    window.alert("没有找到可导入的任务行。");
    return;
  }
  state.tasks.push(...importedTasks);
  saveState();
  renderAll();
  window.alert(`已导入 ${importedTasks.length} 个任务。`);
}

function monthLabel(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function setView(viewName) {
  Object.entries(views).forEach(([name, element]) => element.classList.toggle("active", name === viewName));
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
  document.querySelector("#pageTitle").textContent = titles[viewName];
  document.querySelector("#heroPanel").classList.toggle("hidden", viewName !== "overview");
}

function setTaskTab(tabName) {
  document.querySelectorAll("[data-task-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.taskTab === tabName);
  });
  document.querySelector("#taskBoardPanel").classList.toggle("active", tabName === "board");
  document.querySelector("#taskCalendarPanel").classList.toggle("active", tabName === "calendar");
}

function setGuestTab(tabName) {
  document.querySelectorAll("[data-guest-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.guestTab === tabName);
  });
  document.querySelector("#guestListPanel").classList.toggle("active", tabName === "list");
  document.querySelector("#guestSeatingPanel").classList.toggle("active", tabName === "seating");
  document.querySelector("#guestListActionButton").classList.toggle("hidden", tabName !== "list");
  document.querySelector("#addTableButton").classList.toggle("hidden", tabName !== "seating");
}

function renderOverview() {
  const completed = state.tasks.filter((task) => task.status === "done").length;
  const progress = state.tasks.length ? Math.round((completed / state.tasks.length) * 100) : 0;
  const planned = state.budget.reduce((sum, item) => sum + Number(item.planned), 0);
  const paid = state.budget.reduce((sum, item) => sum + Number(item.paid), 0);
  const lodging = lodgingStats();
  const confirmed = state.guests
    .filter((guest) => guest.confirmed)
    .reduce((sum, guest) => sum + guestCount(guest), 0);
  const guestTotal = state.guests.reduce((sum, guest) => sum + guestCount(guest), 0);
  const selectedVendors = state.vendors.filter((vendor) => vendor.selected).length;
  const daysLeft = daysBetween(state.weddingDate);

  document.querySelector("#daysLeft").textContent = daysLeft >= 0 ? `${daysLeft} 天` : `已完成 ${Math.abs(daysLeft)} 天`;
  document.querySelector("#taskProgress").textContent = `${progress}%`;
  document.querySelector("#taskProgressBar").style.width = `${progress}%`;
  document.querySelector("#budgetUsed").textContent = money(paid);
  document.querySelector("#budgetTotal").textContent = `总预算 ${money(planned)}`;
  document.querySelector("#guestConfirmed").textContent = `${confirmed} 人`;
  document.querySelector("#guestTotal").textContent = `宾客总数 ${guestTotal} 人`;
  document.querySelector("#lodgingPeople").textContent = `${lodging.people} 人`;
  document.querySelector("#lodgingRooms").textContent = `预计 ${lodging.rooms} 间房`;
  document.querySelector("#selectedVendorCount").textContent = `${selectedVendors} 个`;

  const activeTasks = state.tasks
    .filter((task) => task.status !== "done")
    .sort((a, b) => new Date(a.due) - new Date(b.due))
    .slice(0, 4);
  document.querySelector("#priorityTasks").innerHTML = activeTasks.map(renderMiniTask).join("") || emptyState("暂无待办任务");
  document.querySelector("#sidebarFocus").textContent = activeTasks[0]?.title || "所有事项都已完成";

  const payments = state.budget.filter((item) => Number(item.balance) > 0).slice(0, 4);
  document.querySelector("#upcomingPayments").innerHTML = payments.map(renderPayment).join("") || emptyState("暂无待付尾款");
}

function guestCount(guest) {
  return guest.plusOne ? 2 : 1;
}

function guestLabel(guest) {
  return guest.plusOne ? `${guest.name}2人` : guest.name;
}

function relatedGuest(guest) {
  if (!guest?.relatedGuestId) return null;
  return getGuest(guest.relatedGuestId);
}

function lodgingStats() {
  const lodgingGuests = state.guests.filter((guest) => guest.lodging);
  const people = lodgingGuests.reduce((sum, guest) => sum + guestCount(guest), 0);
  const lodgingIds = new Set(lodgingGuests.map((guest) => guest.id));
  const parent = new Map(lodgingGuests.map((guest) => [guest.id, guest.id]));

  function find(id) {
    const current = parent.get(id);
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  }

  function union(a, b) {
    if (!parent.has(a) || !parent.has(b)) return;
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  }

  lodgingGuests.forEach((guest) => {
    const relatedId = Number(guest.relatedGuestId);
    if (lodgingIds.has(relatedId)) {
      union(guest.id, relatedId);
    }
  });

  const rooms = new Set(lodgingGuests.map((guest) => find(guest.id))).size;
  return { people, rooms };
}

function getGuest(id) {
  return state.guests.find((guest) => guest.id === Number(id));
}

function assignedGuestIds() {
  return new Set(state.seating.tables.flatMap((table) => table.guestIds));
}

function emptyState(label) {
  return `<div class="empty-state">${text(label)}</div>`;
}

function renderMiniTask(task) {
  const days = daysBetween(task.due);
  const dueText = days < 0 ? `已逾期 ${Math.abs(days)} 天` : `${days} 天后截止`;
  return `
    <article class="list-item">
      <div>
        <strong>${text(task.title)}</strong>
        <span>${text(task.owner)} · ${text(task.phase)}</span>
      </div>
      <span class="${days < 0 ? "pill warn" : "pill"}">${dueText}</span>
    </article>
  `;
}

function renderPayment(item) {
  return `
    <article class="list-item">
      <div>
        <strong>${text(item.item)}</strong>
        <span>${text(item.category)}</span>
      </div>
      <span class="amount-pill">${money(item.balance)}</span>
    </article>
  `;
}

function renderTasks() {
  const labels = [
    ["todo", "待开始"],
    ["doing", "进行中"],
    ["review", "待确认"],
    ["done", "已完成"]
  ];

  document.querySelector("#taskBoard").innerHTML = labels
    .map(([status, label]) => {
      const cards = state.tasks.filter((task) => task.status === status).map(renderTaskCard).join("");
      return `<section class="board-column"><h3>${label}</h3>${cards || emptyState("暂无任务")}</section>`;
    })
    .join("");
}

function initialCalendarMonth() {
  const datedTasks = state.tasks
    .map((task) => ({ task, date: parseDate(task.due) }))
    .filter((item) => item.date)
    .sort((a, b) => a.date - b.date);
  const nextOpenTask = datedTasks.find((item) => item.task.status !== "done") || datedTasks[0];
  const date = nextOpenTask?.date || new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function renderCalendar() {
  if (!document.querySelector("#taskCalendar")) return;
  if (!calendarMonthInitialized) {
    calendarMonth = initialCalendarMonth();
    calendarMonthInitialized = true;
  }
  const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const todayKey = formatDateKey(new Date());
  const tasksByDate = state.tasks.reduce((groups, task) => {
    if (!task.due) return groups;
    if (!groups.has(task.due)) groups.set(task.due, []);
    groups.get(task.due).push(task);
    return groups;
  }, new Map());

  const visibleMonths = Array.from({ length: 4 }, (_, index) => new Date(monthStart.getFullYear(), monthStart.getMonth() + index, 1));
  const rangeLabel = `${monthLabel(visibleMonths[0])} - ${monthLabel(visibleMonths[visibleMonths.length - 1])}`;
  document.querySelector("#calendarMonthLabel").textContent = rangeLabel;
  document.querySelector("#calendarSummary").textContent = `${state.tasks.length} 个任务 · ${state.tasks.filter((task) => task.status !== "done").length} 个未完成`;

  const weekdayHeader = ["日", "一", "二", "三", "四", "五", "六"]
    .map((day) => `<div class="calendar-weekday">${day}</div>`)
    .join("");
  document.querySelector("#taskCalendar").innerHTML = visibleMonths.map((currentMonth) => {
    const gridStart = new Date(currentMonth);
    gridStart.setDate(currentMonth.getDate() - currentMonth.getDay());
    const dayCells = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const key = formatDateKey(date);
      const dayTasks = (tasksByDate.get(key) || []).sort((a, b) => taskStatusRank(a.status) - taskStatusRank(b.status));
      const isMuted = date.getMonth() !== currentMonth.getMonth();
      const isToday = key === todayKey;
      return `
        <article class="${["calendar-day", isMuted ? "muted" : "", isToday ? "today" : ""].filter(Boolean).join(" ")}">
          <div class="calendar-day-head">
            <span>${date.getDate()}</span>
            ${dayTasks.length ? `<strong>${dayTasks.length}</strong>` : ""}
          </div>
          <div class="calendar-task-list">
            ${dayTasks.slice(0, 3).map(renderCalendarTask).join("")}
            ${dayTasks.length > 3 ? `<span class="calendar-more">+${dayTasks.length - 3}</span>` : ""}
          </div>
        </article>
      `;
    }).join("");
    return `
      <section class="calendar-month-card">
        <h3>${monthLabel(currentMonth)}</h3>
        <div class="calendar-grid">${weekdayHeader + dayCells}</div>
      </section>
    `;
  }).join("");
  document.querySelector("#calendarEmpty").classList.toggle("hidden", state.tasks.length > 0);
}

function taskStatusRank(status) {
  return { todo: 0, doing: 1, review: 2, done: 3 }[status] ?? 0;
}

function renderCalendarTask(task) {
  const status = ["todo", "doing", "review", "done"].includes(task.status) ? task.status : "todo";
  return `
    <button class="calendar-task ${status}" type="button" data-task-edit="${task.id}" title="${text(task.title)}">
      <span>${text(task.title)}</span>
    </button>
  `;
}

function renderTaskCard(task) {
  const days = daysBetween(task.due);
  return `
    <article class="task-card">
      <div class="task-card-heading">
        <strong>${text(task.title)}</strong>
        <button class="delete-button" type="button" data-task-delete="${task.id}">删除</button>
      </div>
      <p>${text(task.details || "暂无任务内容")}</p>
      <div class="task-meta">
        <span class="pill">${text(task.owner)}</span>
        <span class="pill">${text(task.phase || "新事项")}</span>
        <span class="${days < 0 && task.status !== "done" ? "pill warn" : "pill"}">${text(task.due)}</span>
      </div>
      <div class="task-actions">
        <button class="secondary-button" type="button" data-task-edit="${task.id}">编辑</button>
        <button class="secondary-button" type="button" data-task-move="${task.id}">推进</button>
        <button class="secondary-button" type="button" data-task-done="${task.id}">完成</button>
      </div>
    </article>
  `;
}

function renderBudget() {
  const totalPlanned = state.budget.reduce((sum, item) => sum + Number(item.planned), 0);
  const totalPaid = state.budget.reduce((sum, item) => sum + Number(item.paid), 0);
  const totalBalance = state.budget.reduce((sum, item) => sum + Number(item.balance), 0);
  document.querySelector("#budgetSummary").innerHTML = `
    <article><span>总预算</span><strong>${money(totalPlanned)}</strong></article>
    <article><span>已付</span><strong>${money(totalPaid)}</strong></article>
    <article><span>尾款</span><strong>${money(totalBalance)}</strong></article>
  `;

  document.querySelector("#budgetTable").innerHTML = state.budget
    .map((item) => {
      const over = Number(item.paid) + Number(item.balance) > Number(item.planned);
      return `
        <tr>
          <td>${text(item.item)}</td>
          <td>${text(item.category)}</td>
          <td class="money-cell">${money(item.planned)}</td>
          <td class="money-cell">${money(item.paid)}</td>
          <td class="money-cell">${money(item.balance)}</td>
          <td><span class="${over ? "pill warn" : "pill"}">${over ? "超预算" : Number(item.balance) ? "待付款" : "已结清"}</span></td>
          <td class="table-actions">
            <button class="text-button" type="button" data-budget-pay="${item.id}">记录付款</button>
            <button class="text-button danger" type="button" data-budget-delete="${item.id}">删除</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function renderVendors() {
  const filter = document.querySelector("#vendorFilter");
  if (filter) {
    filter.innerHTML = `<option value="all">全部类别</option>${state.vendorTags.map((tag) => `<option value="${text(tag)}">${text(tag)}</option>`).join("")}`;
    filter.value = state.vendorTags.includes(vendorFilter) ? vendorFilter : "all";
  }

  const visibleVendors = vendorFilter === "all" ? state.vendors : state.vendors.filter((vendor) => vendor.type === vendorFilter);
  const library = visibleVendors.filter((vendor) => !vendor.selected);
  const selected = visibleVendors.filter((vendor) => vendor.selected);
  document.querySelector("#vendorLibraryCount").textContent = library.length;
  document.querySelector("#vendorSelectedCount").textContent = selected.length;
  document.querySelector("#vendorLibrary").innerHTML = (await Promise.all(library.map(renderVendorCard))).join("") || emptyState("暂无供应商");
  document.querySelector("#vendorSelected").innerHTML = (await Promise.all(selected.map(renderVendorCard))).join("") || emptyState("暂无最终选择");
}

async function renderVendorCard(vendor) {
  const images = vendorImages(vendor);
  const imageUrl = await getVendorImageUrl(images[0]);
  const name = vendor.name || "未命名供应商";
  const sourceUrl = extractUrl(vendor.sourceUrl);
  return `
    <article class="vendor-card">
      <button class="vendor-image" type="button" data-vendor-view="${vendor.id}">
        ${imageUrl ? `<img src="${imageUrl}" alt="${text(name)} 案例" />` : `<span>案例图片</span>`}
        ${images.length > 1 ? `<span class="image-count-badge">${images.length} 张</span>` : ""}
      </button>
      <div class="vendor-body">
        <div class="vendor-title">
          <span class="pill">${text(vendor.type || "未分类")}</span>
          <strong>${text(name)}</strong>
        </div>
        <dl>
          <div><dt>排期</dt><dd>${text(vendor.schedule || "待确认")}</dd></div>
          <div><dt>联系人</dt><dd>${text([vendor.contactName, vendor.phone].filter(Boolean).join(" · ") || "待确认")}</dd></div>
          <div><dt>报价</dt><dd>${money(vendor.quote)}</dd></div>
        </dl>
        ${vendor.description ? `<p class="vendor-description">${text(vendor.description)}</p>` : ""}
        <div class="card-actions">
          ${sourceUrl ? `<a class="secondary-button" href="${text(sourceUrl)}" target="_blank" rel="noreferrer">原文</a>` : ""}
          <button class="secondary-button idea-view-button" type="button" data-vendor-view="${vendor.id}">查看</button>
          <button class="secondary-button" type="button" data-vendor-edit="${vendor.id}">编辑</button>
          <button class="secondary-button" type="button" data-vendor-select="${vendor.id}">${vendor.selected ? "移出最终" : "最终选择"}</button>
          <button class="delete-button" type="button" data-vendor-delete="${vendor.id}">删除</button>
        </div>
      </div>
    </article>
  `;
}

function vendorImages(vendor) {
  return Array.isArray(vendor.images) && vendor.images.length ? vendor.images : (vendor.imageName ? [vendor.id] : []);
}

async function renderIdeas() {
  const filter = document.querySelector("#ideaFilter");
  if (filter) {
    filter.innerHTML = `<option value="all">全部类别</option>${state.ideaTags.map((tag) => `<option value="${text(tag)}">${text(tag)}</option>`).join("")}`;
    filter.value = state.ideaTags.includes(ideaFilter) ? ideaFilter : "all";
  }

  const visibleIdeas = ideaFilter === "all" ? state.ideas : state.ideas.filter((idea) => idea.category === ideaFilter);
  document.querySelector("#ideaGrid").innerHTML = (await Promise.all(visibleIdeas.map(renderIdeaCard))).join("") || emptyState("暂无创意。可以截图后点“添加创意”直接粘贴。");
}

async function renderIdeaCard(idea) {
  const images = ideaImages(idea);
  const mainImage = await getIdeaImageUrl(images[0]);
  return `
    <article class="idea-card">
      <figure class="idea-image" data-idea-view="${idea.id}">
        ${mainImage ? `<img src="${mainImage}" alt="${text(idea.summary)}" />` : `<span>创意图片</span>`}
      </figure>
      <div class="idea-body">
        <span class="pill">${text(idea.category)}</span>
        <strong>${text(idea.summary)}</strong>
        <div class="card-actions">
          <button class="secondary-button idea-view-button" type="button" data-idea-view="${idea.id}">查看</button>
          <button class="secondary-button" type="button" data-idea-edit="${idea.id}">编辑</button>
          <button class="delete-button" type="button" data-idea-delete="${idea.id}">删除</button>
        </div>
      </div>
    </article>
  `;
}

function ideaImages(idea) {
  return Array.isArray(idea.images) && idea.images.length ? idea.images : (idea.imageData ? [idea.imageData] : []);
}

function renderGuests() {
  const filter = document.querySelector("#guestFilter");
  if (filter) {
    filter.innerHTML = `<option value="all">全部标签</option>${state.guestTags.map((tag) => `<option value="${text(tag)}">${text(tag)}</option>`).join("")}`;
    filter.value = state.guestTags.includes(guestFilter) ? guestFilter : "all";
  }

  const visibleGuests = guestFilter === "all" ? state.guests : state.guests.filter((guest) => guest.group === guestFilter);
  document.querySelector("#guestTable").innerHTML = visibleGuests
    .map(
      (guest) => {
        const related = relatedGuest(guest);
        return `
      <tr>
        <td>${text(guest.name)}</td>
        <td>${text(guest.group)}</td>
        <td>${guest.plusOne ? "是" : "否"}</td>
        <td>${guestCount(guest)} 人</td>
        <td>${guest.lodging ? "需要" : "不需要"}</td>
        <td>${related ? text(related.name) : "无"}</td>
        <td>${text(guest.note || "无")}</td>
        <td class="table-actions">
          <button class="text-button" type="button" data-guest-edit="${guest.id}">编辑</button>
          <button class="text-button danger" type="button" data-guest-delete="${guest.id}">删除</button>
        </td>
        <td class="attendance-cell"><button class="${guest.confirmed ? "status-button active" : "status-button"}" type="button" data-guest-toggle="${guest.id}">${guest.confirmed ? "已出席" : "待确认"}</button></td>
      </tr>
    `;
      }
    )
    .join("") || `<tr><td colspan="9">${emptyState("暂无匹配宾客")}</td></tr>`;
}

function renderGuestFormOptions() {
  const groupSelect = document.querySelector("#guestGroupSelect");
  const relatedList = document.querySelector("#guestRelationList");
  if (!groupSelect || !relatedList) return;
  const editingId = Number(document.querySelector("#guestForm").dataset.editingId || 0);
  groupSelect.innerHTML = state.guestTags.map((tag) => `<option value="${text(tag)}">${text(tag)}</option>`).join("");
  relatedList.innerHTML = state.guests
    .filter((guest) => guest.id !== editingId)
    .map((guest) => `<option value="${text(guest.name)}"></option>`)
    .join("");
}

function renderVendorFormOptions() {
  const typeSelect = document.querySelector("#vendorTypeSelect");
  if (!typeSelect) return;
  typeSelect.innerHTML = state.vendorTags.map((tag) => `<option value="${text(tag)}">${text(tag)}</option>`).join("");
}

function resetVendorForm() {
  const form = document.querySelector("#vendorForm");
  form.dataset.editingId = "";
  document.querySelector("#vendorModalTitle").textContent = "添加供应商";
  document.querySelector("#vendorSubmitButton").textContent = "保存供应商";
  document.querySelector("#vendorImagesData").value = "";
  document.querySelector("#vendorImageInput").value = "";
  const preview = document.querySelector("#vendorPreview");
  preview.classList.add("hidden");
  preview.innerHTML = "";
}

function currentVendorImages() {
  try {
    return JSON.parse(document.querySelector("#vendorImagesData").value || "[]");
  } catch {
    return [];
  }
}

async function setVendorImages(images) {
  const uniqueImages = images.filter(Boolean);
  document.querySelector("#vendorImagesData").value = JSON.stringify(uniqueImages);
  const preview = document.querySelector("#vendorPreview");
  preview.classList.toggle("hidden", uniqueImages.length === 0);
  preview.innerHTML = (await Promise.all(uniqueImages.map(async (image, index) => {
    const imageUrl = await getVendorImageUrl(image);
    return `
      <figure>
        <button class="preview-remove-button" type="button" data-vendor-image-remove="${index}" aria-label="删除第 ${index + 1} 张图片">×</button>
        <img src="${imageUrl}" alt="供应商案例预览 ${index + 1}" />
        <figcaption>${index === 0 ? "主图" : `图片 ${index + 1}`}</figcaption>
      </figure>
    `;
  }))).join("");
}

async function setVendorImageFromFile(file) {
  if (!file?.type?.startsWith("image/")) return;
  if (file.size > MAX_VENDOR_FILE_SIZE) {
    window.alert("图片文件超过 100MB，请换一个更小的文件。");
    return;
  }
  const imageId = await saveVendorCaseImage(file);
  await setVendorImages([...currentVendorImages(), imageId]);
}

async function setVendorImagesFromFiles(files) {
  const imageFiles = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
  for (const file of imageFiles) {
    await setVendorImageFromFile(file);
  }
}

function renderIdeaFormOptions() {
  const categorySelect = document.querySelector("#ideaCategorySelect");
  if (!categorySelect) return;
  categorySelect.innerHTML = state.ideaTags.map((tag) => `<option value="${text(tag)}">${text(tag)}</option>`).join("");
}

function memberDisplayName(member) {
  return member.display_name || member.email || "协作成员";
}

function renderTaskFormOptions() {
  const categorySelect = document.querySelector("#taskCategorySelect");
  const ownerSelect = document.querySelector("#taskOwnerSelect");
  const dueInput = document.querySelector("#taskDueInput");
  if (!categorySelect || !ownerSelect || !dueInput) return;

  categorySelect.innerHTML = taskCategories.map((category) => `<option value="${text(category)}">${text(category)}</option>`).join("");
  const members = workspaceMembers.length
    ? workspaceMembers
    : [{ user_id: currentSession?.user?.id, email: currentUser.email, display_name: currentUser.name }];
  ownerSelect.innerHTML = members.map((member) => {
    const label = memberDisplayName(member);
    return `<option value="${text(label)}">${text(label)}</option>`;
  }).join("");
  dueInput.value = state.weddingDate;
}

function resetIdeaForm() {
  const form = document.querySelector("#ideaForm");
  form.dataset.editingId = "";
  document.querySelector("#ideaModalTitle").textContent = "添加创意";
  document.querySelector("#ideaSubmitButton").textContent = "保存创意";
  document.querySelector("#ideaImagesData").value = "";
  document.querySelector("#ideaImageInput").value = "";
  const preview = document.querySelector("#ideaPreview");
  preview.classList.add("hidden");
  preview.innerHTML = "";
}

function currentIdeaImages() {
  try {
    return JSON.parse(document.querySelector("#ideaImagesData").value || "[]");
  } catch {
    return [];
  }
}

async function setIdeaImages(images) {
  const uniqueImages = images.filter(Boolean);
  document.querySelector("#ideaImagesData").value = JSON.stringify(uniqueImages);
  const preview = document.querySelector("#ideaPreview");
  preview.classList.toggle("hidden", uniqueImages.length === 0);
  preview.innerHTML = (await Promise.all(uniqueImages.map(async (image, index) => {
    const imageUrl = await getIdeaImageUrl(image);
    return `
      <figure>
        <button class="preview-remove-button" type="button" data-idea-image-remove="${index}" aria-label="删除第 ${index + 1} 张图片">×</button>
        <img src="${imageUrl}" alt="创意图片预览 ${index + 1}" />
        <figcaption>${index === 0 ? "主图" : `图片 ${index + 1}`}</figcaption>
      </figure>
    `;
  }))).join("");
}

async function setIdeaImageFromFile(file) {
  if (!file?.type?.startsWith("image/")) return;
  const imageId = await saveIdeaImage(file);
  await setIdeaImages([...currentIdeaImages(), imageId]);
}

async function setIdeaImagesFromFiles(files) {
  const imageFiles = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
  if (!imageFiles.length) return;
  const imageIds = await Promise.all(imageFiles.map(saveIdeaImage));
  await setIdeaImages([...currentIdeaImages(), ...imageIds]);
}

async function handleIdeaPaste(event) {
  if (!document.querySelector("#ideaModal").open) return;
  const items = Array.from(event.clipboardData?.items || []);
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  if (!imageItem) return;
  event.preventDefault();
  await setIdeaImageFromFile(imageItem.getAsFile());
}

async function handleVendorPaste(event) {
  if (!document.querySelector("#vendorModal").open) return;
  const items = Array.from(event.clipboardData?.items || []);
  const imageItems = items.filter((item) => item.type.startsWith("image/"));
  if (!imageItems.length) return;
  event.preventDefault();
  for (const imageItem of imageItems) {
    await setVendorImageFromFile(imageItem.getAsFile());
  }
}

async function openIdeaEditor(ideaId) {
  const idea = state.ideas.find((item) => item.id === Number(ideaId));
  if (!idea) return;
  openModal("ideaModal");
  const form = document.querySelector("#ideaForm");
  form.dataset.editingId = String(idea.id);
  document.querySelector("#ideaModalTitle").textContent = "编辑创意";
  document.querySelector("#ideaSubmitButton").textContent = "保存修改";
  form.elements.category.value = idea.category;
  form.elements.summary.value = idea.summary || "";
  form.elements.description.value = idea.description || "";
  form.elements.sourceUrl.value = idea.sourceUrl || "";
  await setIdeaImages(ideaImages(idea));
}

async function openVendorEditor(vendorId) {
  const vendor = state.vendors.find((item) => item.id === Number(vendorId));
  if (!vendor) return;
  openModal("vendorModal");
  const form = document.querySelector("#vendorForm");
  form.dataset.editingId = String(vendor.id);
  document.querySelector("#vendorModalTitle").textContent = "编辑供应商";
  document.querySelector("#vendorSubmitButton").textContent = "保存修改";
  if (![...form.elements.type.options].some((option) => option.value === vendor.type)) {
    form.elements.type.add(new Option(vendor.type || "摄影", vendor.type || "摄影"));
  }
  form.elements.name.value = vendor.name || "";
  form.elements.type.value = vendor.type || "摄影";
  form.elements.schedule.value = vendor.schedule || "";
  form.elements.contactName.value = vendor.contactName || "";
  form.elements.phone.value = vendor.phone || "";
  form.elements.quote.value = vendor.quote || "";
  form.elements.description.value = vendor.description || "";
  form.elements.sourceUrl.value = vendor.sourceUrl || "";
  await setVendorImages(vendorImages(vendor));
}

async function openVendorDetail(vendorId) {
  const vendor = state.vendors.find((item) => item.id === Number(vendorId));
  if (!vendor) return;
  const images = vendorImages(vendor);
  const sourceUrl = extractUrl(vendor.sourceUrl);
  const name = vendor.name || "未命名供应商";
  document.querySelector("#vendorDetailCategory").textContent = vendor.type || "Vendor";
  document.querySelector("#vendorDetailTitle").textContent = name;
  document.querySelector("#vendorDetailDescription").textContent = vendor.description || "暂无文字描述";
  document.querySelector("#vendorDetailMeta").innerHTML = `
    <div><span>排期</span><strong>${text(vendor.schedule || "待确认")}</strong></div>
    <div><span>联系人</span><strong>${text([vendor.contactName, vendor.phone].filter(Boolean).join(" · ") || "待确认")}</strong></div>
    <div><span>报价</span><strong>${money(vendor.quote)}</strong></div>
  `;
  document.querySelector("#vendorDetailActions").innerHTML = `
    ${sourceUrl ? `<a class="secondary-button" href="${text(sourceUrl)}" target="_blank" rel="noreferrer">打开原文</a>` : `<span class="muted-text">无原文链接</span>`}
    <button class="primary-button" type="button" data-vendor-edit="${vendor.id}">编辑供应商</button>
  `;
  document.querySelector("#vendorDetailGallery").innerHTML = (await Promise.all(images.map(async (image, index) => {
    const imageUrl = await getVendorImageUrl(image);
    return `
      <figure>
        <img src="${imageUrl}" alt="${text(name)} 案例图片 ${index + 1}" />
      </figure>
    `;
  }))).join("") || emptyState("暂无案例图片");
  openModal("vendorDetailModal");
}

async function openIdeaDetail(ideaId) {
  const idea = state.ideas.find((item) => item.id === Number(ideaId));
  if (!idea) return;
  const images = ideaImages(idea);
  const sourceUrl = extractUrl(idea.sourceUrl);
  document.querySelector("#ideaDetailCategory").textContent = idea.category || "Idea";
  document.querySelector("#ideaDetailTitle").textContent = idea.summary || "创意详情";
  document.querySelector("#ideaDetailDescription").textContent = idea.description || "暂无创意描述";
  document.querySelector("#ideaDetailActions").innerHTML = `
    ${sourceUrl ? `<a class="secondary-button" href="${text(sourceUrl)}" target="_blank" rel="noreferrer">打开原文</a>` : `<span class="muted-text">无原文链接</span>`}
    <button class="primary-button" type="button" data-idea-edit="${idea.id}">编辑创意</button>
  `;
  document.querySelector("#ideaDetailGallery").innerHTML = (await Promise.all(images.map(async (image, index) => {
    const imageUrl = await getIdeaImageUrl(image);
    return `
      <figure>
        <img src="${imageUrl}" alt="${text(idea.summary)} 图片 ${index + 1}" />
      </figure>
    `;
  }))).join("") || emptyState("暂无图片");
  openModal("ideaDetailModal");
}

function resetTaskFormMode() {
  const form = document.querySelector("#taskForm");
  form.dataset.editingId = "";
  document.querySelector("#taskModalTitle").textContent = "添加任务";
  document.querySelector("#taskSubmitButton").textContent = "保存任务";
}

function openTaskEditor(taskId) {
  const task = state.tasks.find((item) => item.id === Number(taskId));
  if (!task) return;
  openModal("taskModal");
  const form = document.querySelector("#taskForm");
  form.dataset.editingId = String(task.id);
  renderTaskFormOptions();
  document.querySelector("#taskModalTitle").textContent = "编辑任务";
  document.querySelector("#taskSubmitButton").textContent = "保存修改";
  form.elements.title.value = task.title || "";
  form.elements.details.value = task.details || "";
  if (![...form.elements.phase.options].some((option) => option.value === task.phase)) {
    form.elements.phase.add(new Option(task.phase || "统筹", task.phase || "统筹"));
  }
  form.elements.phase.value = task.phase || "统筹";
  form.elements.due.value = task.due || state.weddingDate;
  if (![...form.elements.owner.options].some((option) => option.value === task.owner)) {
    form.elements.owner.add(new Option(task.owner || "未分配", task.owner || "未分配"));
  }
  form.elements.owner.value = task.owner || "";
}

function resetGuestFormMode() {
  const form = document.querySelector("#guestForm");
  form.dataset.editingId = "";
  document.querySelector("#guestModalTitle").textContent = "添加宾客";
  document.querySelector("#guestSubmitButton").textContent = "保存宾客";
}

function openGuestEditor(guestId) {
  const guest = state.guests.find((item) => item.id === Number(guestId));
  if (!guest) return;
  openModal("guestModal");
  const form = document.querySelector("#guestForm");
  form.dataset.editingId = String(guest.id);
  renderGuestFormOptions();
  document.querySelector("#guestModalTitle").textContent = "编辑宾客";
  document.querySelector("#guestSubmitButton").textContent = "保存修改";
  form.elements.name.value = guest.name || "";
  if (![...form.elements.group.options].some((option) => option.value === guest.group)) {
    form.elements.group.add(new Option(guest.group || "男方亲戚", guest.group || "男方亲戚"));
  }
  form.elements.group.value = guest.group || "男方亲戚";
  form.elements.relatedGuestName.value = relatedGuest(guest)?.name || "";
  form.elements.plusOne.checked = Boolean(guest.plusOne);
  form.elements.lodging.checked = Boolean(guest.lodging);
  form.elements.note.value = guest.note || "";
}

function renderSeating() {
  const assigned = assignedGuestIds();
  const unassignedGuests = state.guests.filter((guest) => !assigned.has(guest.id));
  document.querySelector("#seatingTables").innerHTML = state.seating.tables.map(renderTable).join("");
  document.querySelector("#guestPool").innerHTML = `
    <div class="panel-heading">
      <h3>未安排宾客</h3>
      <span class="count-label">${unassignedGuests.reduce((sum, guest) => sum + guestCount(guest), 0)}人</span>
    </div>
    <div class="guest-card-list" data-unassigned-drop="true">
      ${unassignedGuests.map(renderGuestDragCard).join("") || emptyState("所有宾客都已安排")}
    </div>
  `;
}

function renderTable(table) {
  const guests = table.guestIds.map(getGuest).filter(Boolean);
  const used = guests.reduce((sum, guest) => sum + guestCount(guest), 0);
  const seats = guests.map((guest, index) => renderSeat(guest, index, guests.length)).join("");
  return `
    <article class="table-card">
      <div class="panel-heading">
        <h3>${text(table.name)}</h3>
        <span class="${used > 10 ? "pill warn" : "pill"}">${used}/10人</span>
      </div>
      <div class="table-drop-zone" data-table-id="${table.id}">
        <div class="round-table">
          <strong>${text(table.name)}</strong>
          <span>${used}/10</span>
        </div>
        ${seats}
      </div>
    </article>
  `;
}

function renderSeat(guest, index, total) {
  const angle = total <= 1 ? -90 : -90 + (360 / total) * index;
  return `
    <button class="seat-chip" type="button" draggable="true" data-drag-guest-id="${guest.id}" data-unseat="${guest.id}" style="--seat-angle: ${angle}deg;">
      ${text(guestLabel(guest))}
    </button>
  `;
}

function renderGuestDragCard(guest) {
  return `
    <article class="guest-drag-card" draggable="true" data-drag-guest-id="${guest.id}">
      <strong>${text(guest.name)}</strong>
      <span>${text(guest.group)} · ${guestCount(guest)}人</span>
    </article>
  `;
}

function renderTimeline() {
  document.querySelector("#dayTimeline").innerHTML = state.timeline
    .map(
      (item) => `
      <article class="timeline-item">
        <div class="timeline-time">${text(item.time)}</div>
        <div>
          <strong>${text(item.title)}</strong>
          <p>${text(item.check)}</p>
        </div>
        <span class="pill">${text(item.owner)}</span>
      </article>
    `
    )
    .join("");
}

function renderUser() {
  const name = currentUser.name || "未登录";
  document.querySelector("#accountName").textContent = name;
  document.querySelector("#workspaceName").textContent = currentWorkspace?.name || "未进入项目";
  document.querySelector("#accountEmail").textContent = currentUser.email || "--";
  document.querySelector("#accountWorkspace").textContent = currentWorkspace?.name || "--";
  document.querySelector("#accountMemberCount").textContent = workspaceMembers.length ? `${workspaceMembers.length} 人` : "1 人";
  document.querySelector("#profileNameInput").value = currentUser.name || "";
  document.querySelector("#workspaceNameInput").value = currentWorkspace?.name || "";
  const avatar = document.querySelector("#accountAvatar");
  if (currentUser.avatar) {
    avatar.innerHTML = `<img src="${currentUser.avatar}" alt="${text(name)} 的头像" />`;
  } else {
    avatar.textContent = currentUser.name ? currentUser.name.trim().slice(0, 1).toUpperCase() : "囍";
  }

  document.querySelector("#sidebarMembers").innerHTML = renderMemberStack();
  renderHeroPhoto();

  document.querySelector("#inviteCount").textContent = pendingInvites.length;
  document.querySelector("#inviteList").innerHTML = pendingInvites
    .map(
      (invite) => `
        <article class="list-item">
          <div>
            <strong>${text(invite.workspace?.name || "婚礼项目")}</strong>
            <span>邀请你加入协作</span>
          </div>
          <button class="secondary-button" type="button" data-accept-invite="${invite.id}">同意</button>
        </article>
      `
    )
    .join("") || emptyState("暂无新的协作邀请");
}

async function renderHeroPhoto() {
  const heroPhoto = document.querySelector("#heroPhoto");
  const cover = state.cover || currentUser.cover;
  const coverY = state.cover ? state.coverY : currentUser.coverY;
  const coverUrl = await getCoverImageUrl(cover);
  if (cover) {
    heroPhoto.innerHTML = coverUrl
      ? `<img class="cover-shift-image" src="${coverUrl}" alt="婚礼封面照片" style="transform: translateY(${coverOffset(coverY)}%);" />`
      : "<span>封面照片</span>";
  } else {
    heroPhoto.innerHTML = "<span>封面照片</span>";
  }
}

function memberInitial(member) {
  return (member.display_name || member.email || "协").trim().slice(0, 1).toUpperCase();
}

function renderMemberStack() {
  const members = workspaceMembers.length
    ? workspaceMembers
    : [{ user_id: currentSession?.user?.id, email: currentUser.email, display_name: currentUser.name, role: "owner" }];
  const visibleMembers = members.slice(0, 4);
  const avatars = visibleMembers
    .map((member) => {
      const isCurrentUser = member.user_id === currentSession?.user?.id;
      const label = member.display_name || member.email || "协作成员";
      const image = isCurrentUser ? currentUser.avatar : "";
      return `
        <span class="member-avatar" title="${text(label)}">
          ${image ? `<img src="${image}" alt="${text(label)} 的头像" />` : text(memberInitial(member))}
        </span>
      `;
    })
    .join("");
  const more = members.length > visibleMembers.length ? `<span class="member-avatar member-more">+${members.length - visibleMembers.length}</span>` : "";
  return `${avatars}${more}`;
}

async function renderCoverPreview() {
  const preview = document.querySelector("#coverPreview");
  const cover = pendingCover || state.cover || currentUser.cover;
  const y = Number(document.querySelector("#coverPositionInput").value || state.coverY || currentUser.coverY || 50);
  const coverUrl = pendingCoverUrl || await getCoverImageUrl(cover);
  if (!cover) {
    preview.innerHTML = "<span>选择图片后预览</span>";
    return;
  }
  preview.innerHTML = coverUrl
    ? `<img class="cover-shift-image" src="${coverUrl}" alt="封面预览" style="transform: translateY(${coverOffset(y)}%);" />`
    : "<span>选择图片后预览</span>";
}

function renderAll() {
  renderUser();
  document.querySelector("#weddingDate").value = state.weddingDate;
  renderOverview();
  renderTasks();
  renderCalendar();
  renderBudget();
  renderVendors();
  renderIdeas();
  renderGuests();
  renderSeating();
  renderTimeline();
}

function nextTaskStatus(status) {
  const order = ["todo", "doing", "review", "done"];
  return order[Math.min(order.indexOf(status) + 1, order.length - 1)];
}

function openModal(id) {
  const modal = document.querySelector(`#${id}`);
  const form = modal.querySelector("form");
  form?.reset();
  if (id === "accountModal") renderUser();
  if (id === "taskModal") {
    resetTaskFormMode();
    renderTaskFormOptions();
  }
  if (id === "vendorModal") {
    renderVendorFormOptions();
    resetVendorForm();
  }
  if (id === "ideaModal") {
    renderIdeaFormOptions();
    resetIdeaForm();
  }
  if (id === "guestModal") {
    resetGuestFormMode();
    renderGuestFormOptions();
  }
  if (typeof modal.showModal === "function") modal.showModal();
  else modal.setAttribute("open", "");
}

function closeModal(id) {
  const modal = document.querySelector(`#${id}`);
  if (typeof modal.close === "function") {
    if (modal.open) modal.close();
  }
  else modal.removeAttribute("open");
}

document.querySelector("#navList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (button) setView(button.dataset.view);
});

document.querySelectorAll("[data-task-tab]").forEach((button) => {
  button.addEventListener("click", () => setTaskTab(button.dataset.taskTab));
});

document.querySelectorAll("[data-guest-tab]").forEach((button) => {
  button.addEventListener("click", () => setGuestTab(button.dataset.guestTab));
});

document.body.addEventListener("click", async (event) => {
  const opener = event.target.closest("[data-open-modal]");
  if (opener) openModal(opener.dataset.openModal);

  const closer = event.target.closest("[data-close-modal]");
  if (closer) closeModal(closer.dataset.closeModal);

  const jump = event.target.closest("[data-view-jump]");
  if (jump) setView(jump.dataset.viewJump);

  const move = event.target.closest("[data-task-move]");
  if (move) {
    const task = state.tasks.find((item) => item.id === Number(move.dataset.taskMove));
    if (!task) return;
    task.status = nextTaskStatus(task.status);
    saveState();
    renderAll();
  }

  const taskEdit = event.target.closest("[data-task-edit]");
  if (taskEdit) {
    openTaskEditor(taskEdit.dataset.taskEdit);
  }

  const done = event.target.closest("[data-task-done]");
  if (done) {
    const task = state.tasks.find((item) => item.id === Number(done.dataset.taskDone));
    if (!task) return;
    task.status = "done";
    saveState();
    renderAll();
  }

  const taskDelete = event.target.closest("[data-task-delete]");
  if (taskDelete) {
    const task = state.tasks.find((item) => item.id === Number(taskDelete.dataset.taskDelete));
    if (!task || !window.confirm(`确定删除“${task.title}”吗？`)) return;
    state.tasks = state.tasks.filter((item) => item.id !== task.id);
    saveState();
    renderAll();
  }

  const vendorSelect = event.target.closest("[data-vendor-select]");
  if (vendorSelect) {
    const vendor = state.vendors.find((item) => item.id === Number(vendorSelect.dataset.vendorSelect));
    if (!vendor) return;
    vendor.selected = !vendor.selected;
    saveState();
    renderAll();
  }

  const vendorEdit = event.target.closest("[data-vendor-edit]");
  if (vendorEdit) {
    closeModal("vendorDetailModal");
    await openVendorEditor(vendorEdit.dataset.vendorEdit);
  }

  const vendorView = event.target.closest("[data-vendor-view]");
  if (vendorView) {
    await openVendorDetail(vendorView.dataset.vendorView);
  }

  const vendorDelete = event.target.closest("[data-vendor-delete]");
  if (vendorDelete) {
    const vendor = state.vendors.find((item) => item.id === Number(vendorDelete.dataset.vendorDelete));
    if (!vendor || !window.confirm(`确定删除“${vendor.name}”吗？`)) return;
    await Promise.all(vendorImages(vendor).filter((image) => !isInlineMedia(image) && !isRemoteMedia(image)).map((image) => deleteMediaBlob(VENDOR_STORE, image)));
    state.vendors = state.vendors.filter((item) => item.id !== vendor.id);
    saveState();
    renderAll();
  }

  const vendorImageRemove = event.target.closest("[data-vendor-image-remove]");
  if (vendorImageRemove) {
    const index = Number(vendorImageRemove.dataset.vendorImageRemove);
    const nextImages = currentVendorImages().filter((_, imageIndex) => imageIndex !== index);
    await setVendorImages(nextImages);
  }

  const ideaImageRemove = event.target.closest("[data-idea-image-remove]");
  if (ideaImageRemove) {
    const index = Number(ideaImageRemove.dataset.ideaImageRemove);
    const nextImages = currentIdeaImages().filter((_, imageIndex) => imageIndex !== index);
    await setIdeaImages(nextImages);
  }

  const ideaView = event.target.closest("[data-idea-view]");
  if (ideaView) {
    await openIdeaDetail(ideaView.dataset.ideaView);
  }

  const ideaEdit = event.target.closest("[data-idea-edit]");
  if (ideaEdit) {
    closeModal("ideaDetailModal");
    await openIdeaEditor(ideaEdit.dataset.ideaEdit);
  }

  const ideaDelete = event.target.closest("[data-idea-delete]");
  if (ideaDelete) {
    const idea = state.ideas.find((item) => item.id === Number(ideaDelete.dataset.ideaDelete));
    if (!idea || !window.confirm("确定删除这条创意吗？")) return;
    await Promise.all(ideaImages(idea).filter((image) => !isInlineMedia(image)).map((image) => deleteMediaBlob(IDEA_STORE, image)));
    state.ideas = state.ideas.filter((item) => item.id !== idea.id);
    saveState();
    renderAll();
  }

  const guestToggle = event.target.closest("[data-guest-toggle]");
  if (guestToggle) {
    const guest = state.guests.find((item) => item.id === Number(guestToggle.dataset.guestToggle));
    if (!guest) return;
    guest.confirmed = !guest.confirmed;
    saveState();
    renderAll();
  }

  const guestEdit = event.target.closest("[data-guest-edit]");
  if (guestEdit) {
    openGuestEditor(guestEdit.dataset.guestEdit);
  }

  const guestDelete = event.target.closest("[data-guest-delete]");
  if (guestDelete) {
    const guest = state.guests.find((item) => item.id === Number(guestDelete.dataset.guestDelete));
    if (!guest || !window.confirm(`确定删除“${guest.name}”吗？`)) return;
    state.guests = state.guests.filter((item) => item.id !== guest.id);
    state.guests.forEach((item) => {
      if (Number(item.relatedGuestId) === guest.id) item.relatedGuestId = "";
    });
    state.seating.tables.forEach((table) => {
      table.guestIds = table.guestIds.filter((id) => id !== guest.id);
    });
    saveState();
    renderAll();
  }

  const unseat = event.target.closest("[data-unseat]");
  if (unseat) {
    removeGuestFromTables(Number(unseat.dataset.unseat));
    saveState();
    renderAll();
  }

  const budgetDelete = event.target.closest("[data-budget-delete]");
  if (budgetDelete) {
    const budget = state.budget.find((item) => item.id === Number(budgetDelete.dataset.budgetDelete));
    if (!budget || !window.confirm(`确定删除“${budget.item}”吗？`)) return;
    state.budget = state.budget.filter((item) => item.id !== budget.id);
    saveState();
    renderAll();
  }

  const budgetPay = event.target.closest("[data-budget-pay]");
  if (budgetPay) {
    const budget = state.budget.find((item) => item.id === Number(budgetPay.dataset.budgetPay));
    if (!budget) return;
    const amount = Number(window.prompt("这次付款金额是多少？", "0"));
    if (!amount || amount < 0) return;
    budget.paid = Number(budget.paid) + amount;
    budget.balance = Math.max(Number(budget.balance) - amount, 0);
    saveState();
    renderAll();
  }

  const acceptButton = event.target.closest("[data-accept-invite]");
  if (acceptButton) {
    acceptButton.disabled = true;
    acceptButton.textContent = "加入中";
    const accepted = await acceptInvite(acceptButton.dataset.acceptInvite);
    if (!accepted) {
      acceptButton.disabled = false;
      acceptButton.textContent = "同意";
    }
  }
});

document.body.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-drag-guest-id]");
  if (!card) return;
  event.dataTransfer.setData("text/plain", card.dataset.dragGuestId);
  event.dataTransfer.effectAllowed = "move";
});

document.body.addEventListener("dragover", (event) => {
  if (event.target.closest("[data-table-id]") || event.target.closest("[data-unassigned-drop]")) {
    event.preventDefault();
  }
});

document.body.addEventListener("drop", (event) => {
  const guestId = Number(event.dataTransfer.getData("text/plain"));
  if (!guestId) return;

  const tableDrop = event.target.closest("[data-table-id]");
  if (tableDrop) {
    event.preventDefault();
    assignGuestToTable(guestId, Number(tableDrop.dataset.tableId));
    return;
  }

  const unassignedDrop = event.target.closest("[data-unassigned-drop]");
  if (unassignedDrop) {
    event.preventDefault();
    removeGuestFromTables(guestId);
    saveState();
    renderAll();
  }
});

document.querySelector("#addTableButton").addEventListener("click", () => {
  const next = state.seating.tables.length + 1;
  state.seating.tables.push({ id: Date.now(), name: `${next}桌`, guestIds: [] });
  saveState();
  renderAll();
});

document.querySelector("#guestFilter").addEventListener("change", (event) => {
  guestFilter = event.target.value;
  renderGuests();
});

document.querySelector("#vendorFilter").addEventListener("change", (event) => {
  vendorFilter = event.target.value;
  renderVendors();
});

document.querySelector("#ideaFilter").addEventListener("change", (event) => {
  ideaFilter = event.target.value;
  renderIdeas();
});

document.querySelector("#addGuestTagButton").addEventListener("click", () => {
  const label = window.prompt("新标签名称，例如：男方同事");
  const tag = label?.trim();
  if (!tag) return;
  if (!state.guestTags.includes(tag)) state.guestTags.push(tag);
  saveState();
  renderGuestFormOptions();
  document.querySelector("#guestGroupSelect").value = tag;
  renderGuests();
});

document.querySelector("#addVendorTagButton").addEventListener("click", () => {
  const label = window.prompt("新供应商类别，例如：婚车");
  const tag = label?.trim();
  if (!tag) return;
  if (!state.vendorTags.includes(tag)) state.vendorTags.push(tag);
  saveState();
  renderVendorFormOptions();
  document.querySelector("#vendorTypeSelect").value = tag;
  renderVendors();
});

document.querySelector("#addIdeaTagButton").addEventListener("click", () => {
  const label = window.prompt("新创意类别，例如：桌花");
  const tag = label?.trim();
  if (!tag) return;
  if (!state.ideaTags.includes(tag)) state.ideaTags.push(tag);
  saveState();
  renderIdeaFormOptions();
  document.querySelector("#ideaCategorySelect").value = tag;
  renderIdeas();
});

document.querySelector("#vendorPasteZone").addEventListener("click", () => {
  document.querySelector("#vendorPasteZone").focus();
});

document.querySelector("#chooseVendorImageButton").addEventListener("click", () => {
  document.querySelector("#vendorImageInput").click();
});

document.querySelector("#vendorImageInput").addEventListener("change", async (event) => {
  await setVendorImagesFromFiles(event.target.files);
});

document.querySelector("#ideaPasteZone").addEventListener("click", () => {
  document.querySelector("#ideaPasteZone").focus();
});

document.querySelector("#chooseIdeaImageButton").addEventListener("click", () => {
  document.querySelector("#ideaImageInput").click();
});

document.querySelector("#ideaImageInput").addEventListener("change", async (event) => {
  await setIdeaImagesFromFiles(event.target.files);
});

document.addEventListener("paste", handleIdeaPaste);
document.addEventListener("paste", handleVendorPaste);

function removeGuestFromTables(guestId) {
  state.seating.tables.forEach((table) => {
    table.guestIds = table.guestIds.filter((id) => id !== guestId);
  });
}

function tableUsedSeats(table) {
  return table.guestIds.reduce((sum, id) => {
    const guest = getGuest(id);
    return sum + (guest ? guestCount(guest) : 0);
  }, 0);
}

function assignGuestToTable(guestId, tableId) {
  const guest = getGuest(guestId);
  const table = state.seating.tables.find((item) => item.id === tableId);
  if (!guest || !table) return;

  const alreadyInTable = table.guestIds.includes(guestId);
  const nextUsed = tableUsedSeats(table) + (alreadyInTable ? 0 : guestCount(guest));
  if (nextUsed > 10) {
    window.alert(`${table.name} 最多 10 人，${guestLabel(guest)} 放不下。`);
    return;
  }

  removeGuestFromTables(guestId);
  table.guestIds.push(guestId);
  saveState();
  renderAll();
}

document.querySelector("#weddingDate").addEventListener("change", (event) => {
  state.weddingDate = event.target.value;
  saveState();
  renderAll();
});

document.querySelector("#calendarPrevButton")?.addEventListener("click", () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 4, 1);
  calendarMonthInitialized = true;
  renderCalendar();
});

document.querySelector("#calendarNextButton")?.addEventListener("click", () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 4, 1);
  calendarMonthInitialized = true;
  renderCalendar();
});

document.querySelector("#taskImportButton")?.addEventListener("click", () => {
  document.querySelector("#taskImportInput").click();
});

document.querySelector("#taskImportInput")?.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  await importTasksFromFile(file);
  event.target.value = "";
});

document.querySelector("#taskForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const editingId = Number(form.dataset.editingId || 0);
  const task = editingId ? state.tasks.find((item) => item.id === editingId) : null;
  const nextTask = {
    id: task?.id || Date.now(),
    title: data.title,
    details: data.details,
    owner: data.owner,
    due: data.due || state.weddingDate,
    phase: data.phase || "统筹",
    status: task?.status || "todo"
  };
  if (task) Object.assign(task, nextTask);
  else state.tasks.push(nextTask);
  closeModal("taskModal");
  form.dataset.editingId = "";
  saveState();
  renderAll();
});

document.querySelector("#vendorForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const editingId = Number(form.dataset.editingId || 0);
  const vendor = editingId ? state.vendors.find((item) => item.id === editingId) : null;
  const images = currentVendorImages();
  const nextVendor = {
    id: vendor?.id || Date.now(),
    name: String(data.name || "").trim(),
    type: data.type || "摄影",
    schedule: String(data.schedule || "").trim(),
    contactName: String(data.contactName || "").trim(),
    phone: String(data.phone || "").trim(),
    quote: Number(data.quote || 0),
    description: String(data.description || "").trim(),
    sourceUrl: String(data.sourceUrl || "").trim(),
    selected: vendor?.selected || false,
    imageName: "",
    images
  };
  if (vendor) Object.assign(vendor, nextVendor);
  else state.vendors.push(nextVendor);
  closeModal("vendorModal");
  form.dataset.editingId = "";
  saveState();
  renderAll();
});

document.querySelector("#ideaForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const images = currentIdeaImages();
  if (!images.length) {
    window.alert("请先粘贴或选择一张创意图片。");
    return;
  }
  const editingId = Number(form.dataset.editingId || 0);
  const idea = editingId ? state.ideas.find((item) => item.id === editingId) : null;
  const nextIdea = {
    id: idea?.id || Date.now(),
    category: data.category,
    summary: data.summary,
    description: data.description,
    sourceUrl: extractUrl(data.sourceUrl) || data.sourceUrl,
    images,
    imageData: "",
    createdAt: idea?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (idea) Object.assign(idea, nextIdea);
  else state.ideas.unshift(nextIdea);
  closeModal("ideaModal");
  form.dataset.editingId = "";
  saveState();
  renderAll();
});

document.querySelector("#guestForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const editingId = Number(form.dataset.editingId || 0);
  const guest = editingId ? state.guests.find((item) => item.id === editingId) : null;
  const related = state.guests.find((item) => item.id !== editingId && item.name === data.relatedGuestName);
  const nextGuest = {
    id: guest?.id || Date.now(),
    name: data.name,
    group: data.group,
    plusOne: Boolean(data.plusOne),
    lodging: Boolean(data.lodging),
    relatedGuestId: related?.id || "",
    note: data.note,
    confirmed: guest?.confirmed || false
  };
  if (guest) Object.assign(guest, nextGuest);
  else state.guests.push(nextGuest);
  closeModal("guestModal");
  form.dataset.editingId = "";
  saveState();
  renderAll();
});

document.querySelector("#budgetForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  state.budget.push({
    id: Date.now(),
    item: data.item,
    category: data.category,
    planned: Number(data.planned),
    paid: Number(data.paid),
    balance: Number(data.balance)
  });
  closeModal("budgetModal");
  saveState();
  renderAll();
});

document.querySelector("#accountForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentSession?.user) return;
  const form = event.currentTarget;
  const name = document.querySelector("#profileNameInput").value.trim() || profileName(currentSession.user);
  const workspaceName = document.querySelector("#workspaceNameInput").value.trim() || currentWorkspace?.name || `${name}的婚礼计划`;
  const avatarFile = form.elements.avatar.files[0];
  let avatar = currentUser.avatar;

  if (avatarFile) {
    avatar = await readFileAsDataUrl(avatarFile);
  }

  const { error: profileError } = await supabaseClient
    .from("profiles")
    .update({ display_name: name, updated_at: new Date().toISOString() })
    .eq("id", currentSession.user.id);
  if (profileError) {
    window.alert(`保存失败：${profileError.message}`);
    return;
  }

  if (currentWorkspace?.id && workspaceName !== currentWorkspace.name) {
    const { error: workspaceError } = await supabaseClient
      .from("wedding_workspaces")
      .update({ name: workspaceName, updated_at: new Date().toISOString() })
      .eq("id", currentWorkspace.id);
    if (workspaceError) {
      window.alert(`项目名称保存失败：${workspaceError.message}`);
      return;
    }
    currentWorkspace = { ...currentWorkspace, name: workspaceName };
  }

  currentUser = { ...currentUser, name, avatar, mediaReady: true };
  saveUser();
  closeModal("accountModal");
  form.reset();
  renderAll();
});

document.querySelectorAll("[data-auth-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-auth-tab]").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelector("#authLoginForm").classList.toggle("active", button.dataset.authTab === "login");
    document.querySelector("#authRegisterForm").classList.toggle("active", button.dataset.authTab === "register");
    setAuthMessage("");
  });
});

document.querySelector("#authLoginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireSupabase()) return;
  const data = Object.fromEntries(new FormData(event.currentTarget));
  setAuthMessage("正在登录...");
  const { data: result, error } = await supabaseClient.auth.signInWithPassword({
    email: data.email.trim().toLowerCase(),
    password: data.password
  });
  if (error) {
    setAuthMessage(`登录失败：${error.message}`, "error");
    return;
  }
  await enterApplication(result.session);
});

document.querySelector("#authRegisterForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireSupabase()) return;
  const data = Object.fromEntries(new FormData(event.currentTarget));
  setAuthMessage("正在注册...");
  const { data: result, error } = await supabaseClient.auth.signUp({
    email: data.email.trim().toLowerCase(),
    password: data.password,
    options: { data: { display_name: data.name.trim() } }
  });
  if (error) {
    setAuthMessage(`注册失败：${error.message}`, "error");
    return;
  }
  if (!result.session) {
    setAuthMessage("注册成功，请先去邮箱确认账号，然后回来登录。", "success");
    return;
  }
  await ensureProfile(result.session.user, data.name.trim());
  await enterApplication(result.session);
});

document.querySelector("#sendInviteButton").addEventListener("click", () => {
  sendInvite(document.querySelector("#inviteEmailInput").value);
});

document.querySelector("#signOutButton").addEventListener("click", async () => {
  if (supabaseClient) await supabaseClient.auth.signOut();
  currentSession = null;
  currentWorkspace = null;
  workspaceMembers = [];
  pendingInvites = [];
  currentUser = { name: "", email: "", avatar: "", cover: "", coverY: 50, mediaReady: false };
  saveUser();
  closeModal("accountModal");
  showAuthGate();
});

document.querySelector("#uploadCoverButton").addEventListener("click", () => {
  pendingCover = "";
  pendingCoverUrl = "";
  openModal("coverModal");
  document.querySelector("#coverPositionInput").value = state.coverY || currentUser.coverY || 50;
  document.querySelector("#coverFileLabel").textContent = state.cover || currentUser.cover ? "更换图片" : "选择图片";
  renderCoverPreview();
});

document.querySelector("#coverImageInput").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  saveCoverImage(file).then(async (coverId) => {
    pendingCover = coverId;
    pendingCoverUrl = await getCoverImageUrl(coverId);
    document.querySelector("#coverFileLabel").textContent = file.name;
    renderCoverPreview();
  });
});

document.querySelector("#coverPositionInput").addEventListener("input", renderCoverPreview);

document.querySelector("#coverForm").addEventListener("submit", (event) => {
  event.preventDefault();
  state.cover = pendingCover || state.cover || currentUser.cover;
  state.coverY = Number(document.querySelector("#coverPositionInput").value || 50);
  currentUser = {
    ...currentUser,
    cover: state.cover,
    coverY: state.coverY,
    mediaReady: true
  };
  saveState();
  saveUser();
  closeModal("coverModal");
  renderAll();
  event.currentTarget.reset();
  pendingCover = "";
  pendingCoverUrl = "";
});

async function consumeAuthCallback() {
  const url = new URL(window.location.href);
  const errorDescription = url.searchParams.get("error_description") || new URLSearchParams(url.hash.slice(1)).get("error_description");
  if (errorDescription) {
    showAuthGate(`邮箱验证失败：${errorDescription.replaceAll("+", " ")}`, "error");
    return null;
  }

  const code = url.searchParams.get("code");
  if (!code) return null;

  const { data, error } = await supabaseClient.auth.exchangeCodeForSession(code);
  url.searchParams.delete("code");
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);

  if (error) {
    showAuthGate(`邮箱验证失败：${error.message}`, "error");
    return null;
  }
  return data.session;
}

async function initApp() {
  if (!requireSupabase()) return;
  showAuthGate("正在检查登录状态...");
  const callbackSession = await consumeAuthCallback();
  if (callbackSession) {
    await enterApplication(callbackSession);
    return;
  }

  const { data, error } = await supabaseClient.auth.getSession();
  if (error || !data.session) {
    showAuthGate();
    return;
  }
  await enterApplication(data.session);
}

initApp();
