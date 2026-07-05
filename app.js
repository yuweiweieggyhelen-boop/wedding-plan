const STORAGE_KEY = "wedding-pm-state-v2";
const USER_STORAGE_KEY = "wedding-pm-user-v1";
const VENDOR_DB_NAME = "wedding-pm-vendor-files";
const VENDOR_STORE = "caseImages";
const MAX_VENDOR_FILE_SIZE = 100 * 1024 * 1024;
const SUPABASE_URL = "https://pcxxtgewmverwqmrijlo.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_JIW4FwbiDd1OwUh0ZoAYGQ_2v_-Wjq6";
const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const initialState = {
  weddingDate: "2026-10-18",
  tasks: [],
  budget: [],
  vendors: [],
  guests: [],
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
let pendingInvites = [];
let appReady = false;
let remoteSaveTimer = 0;
let vendorDbPromise;
let vendorImageUrls = new Map();
let pendingCover = "";

const views = {
  overview: document.querySelector("#overviewView"),
  tasks: document.querySelector("#tasksView"),
  budget: document.querySelector("#budgetView"),
  vendors: document.querySelector("#vendorsView"),
  guests: document.querySelector("#guestsView"),
  seating: document.querySelector("#seatingView"),
  timeline: document.querySelector("#timelineView")
};

const titles = {
  overview: "总览仪表盘",
  tasks: "任务看板",
  budget: "预算管理",
  vendors: "供应商管理",
  guests: "宾客管理",
  seating: "宾客排桌",
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  queueRemoteSave();
}

function loadUser() {
  const saved = localStorage.getItem(USER_STORAGE_KEY);
  if (!saved) return { name: "", email: "", avatar: "", cover: "", coverY: 50 };
  try {
    return { name: "", email: "", avatar: "", cover: "", coverY: 50, ...JSON.parse(saved) };
  } catch {
    return { name: "", email: "", avatar: "", cover: "", coverY: 50 };
  }
}

function saveUser() {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(currentUser));
}

function text(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
    .update({ state, updated_at: new Date().toISOString() })
    .eq("id", currentWorkspace.id);
  if (error) console.warn("保存协作数据失败", error.message);
}

function money(value) {
  return `¥${Number(value || 0).toLocaleString("zh-CN")}`;
}

function coverOffset(value) {
  return (50 - Number(value || 50)) * 0.7;
}

function openVendorDb() {
  if (vendorDbPromise) return vendorDbPromise;
  vendorDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(VENDOR_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(VENDOR_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return vendorDbPromise;
}

async function saveVendorImage(id, file) {
  const db = await openVendorDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(VENDOR_STORE, "readwrite");
    tx.objectStore(VENDOR_STORE).put(file, String(id));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteVendorImage(id) {
  const db = await openVendorDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(VENDOR_STORE, "readwrite");
    tx.objectStore(VENDOR_STORE).delete(String(id));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getVendorImageUrl(id) {
  if (vendorImageUrls.has(id)) return vendorImageUrls.get(id);
  const db = await openVendorDb();
  const blob = await new Promise((resolve, reject) => {
    const tx = db.transaction(VENDOR_STORE, "readonly");
    const request = tx.objectStore(VENDOR_STORE).get(String(id));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (!blob) return "";
  const url = URL.createObjectURL(blob);
  vendorImageUrls.set(id, url);
  return url;
}

function profileName(user) {
  return user?.user_metadata?.display_name || user?.email?.split("@")[0] || "协作账号";
}

async function ensureProfile(user, name = "") {
  const displayName = name || profileName(user);
  const { error } = await supabaseClient.from("profiles").upsert({
    id: user.id,
    email: user.email,
    display_name: displayName,
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
  currentUser = { ...currentUser, name: displayName, email: user.email };
  saveUser();
}

async function createWorkspaceForUser(user) {
  const workspaceName = `${profileName(user)}的婚礼计划`;
  const workspace = {
    id: crypto.randomUUID(),
    name: workspaceName,
    owner_id: user.id,
    state: structuredClone(initialState)
  };
  const { error: workspaceError } = await supabaseClient
    .from("wedding_workspaces")
    .insert(workspace);
  if (workspaceError) throw workspaceError;

  const { error: memberError } = await supabaseClient.from("wedding_memberships").insert({
    workspace_id: workspace.id,
    user_id: user.id,
    role: "owner"
  });
  if (memberError) throw memberError;
  return { id: workspace.id, name: workspace.name, state: workspace.state };
}

async function loadCurrentWorkspace(user) {
  const { data: memberships, error } = await supabaseClient
    .from("wedding_memberships")
    .select("role, workspace:wedding_workspaces(id, name, state, updated_at)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const workspace = memberships?.[0]?.workspace || (await createWorkspaceForUser(user));
  currentWorkspace = workspace;
  state = normalizeState({ ...structuredClone(initialState), ...(workspace.state || {}) });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
    showAuthGate(`数据库还没准备好：${error.message}。请先运行 supabase-schema.sql。`, "error");
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
  const invitation = pendingInvites.find((item) => item.id === invitationId);
  if (!invitation || !currentSession?.user) return;

  const { error: memberError } = await supabaseClient.from("wedding_memberships").insert({
    workspace_id: invitation.workspace.id,
    user_id: currentSession.user.id,
    role: "member"
  });
  if (memberError && memberError.code !== "23505") {
    window.alert(`加入协作失败：${memberError.message}`);
    return;
  }

  const { error: inviteError } = await supabaseClient
    .from("wedding_invitations")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", invitationId);
  if (inviteError) {
    window.alert(`更新邀请失败：${inviteError.message}`);
    return;
  }

  await loadCurrentWorkspace(currentSession.user);
  await loadInvitations();
  renderAll();
  closeModal("accountModal");
}

function daysBetween(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateString);
  return Math.ceil((target - today) / 86400000);
}

function setView(viewName) {
  Object.entries(views).forEach(([name, element]) => element.classList.toggle("active", name === viewName));
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
  document.querySelector("#pageTitle").textContent = titles[viewName];
}

function renderOverview() {
  const completed = state.tasks.filter((task) => task.status === "done").length;
  const progress = state.tasks.length ? Math.round((completed / state.tasks.length) * 100) : 0;
  const planned = state.budget.reduce((sum, item) => sum + Number(item.planned), 0);
  const paid = state.budget.reduce((sum, item) => sum + Number(item.paid), 0);
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
  const library = state.vendors.filter((vendor) => !vendor.selected);
  const selected = state.vendors.filter((vendor) => vendor.selected);
  document.querySelector("#vendorLibraryCount").textContent = library.length;
  document.querySelector("#vendorSelectedCount").textContent = selected.length;
  document.querySelector("#vendorLibrary").innerHTML = (await Promise.all(library.map(renderVendorCard))).join("") || emptyState("暂无供应商");
  document.querySelector("#vendorSelected").innerHTML = (await Promise.all(selected.map(renderVendorCard))).join("") || emptyState("暂无最终选择");
}

async function renderVendorCard(vendor) {
  const imageUrl = await getVendorImageUrl(vendor.id);
  return `
    <article class="vendor-card">
      <div class="vendor-image">${imageUrl ? `<img src="${imageUrl}" alt="${text(vendor.name)} 案例" />` : `<span>案例图片</span>`}</div>
      <div class="vendor-body">
        <div class="vendor-title">
          <span class="pill">${text(vendor.type)}</span>
          <strong>${text(vendor.name)}</strong>
        </div>
        <dl>
          <div><dt>排期</dt><dd>${text(vendor.schedule)}</dd></div>
          <div><dt>联系人</dt><dd>${text(vendor.contactName)} · ${text(vendor.phone)}</dd></div>
          <div><dt>报价</dt><dd>${money(vendor.quote)}</dd></div>
        </dl>
        <div class="card-actions">
          <button class="secondary-button" type="button" data-vendor-select="${vendor.id}">${vendor.selected ? "移出最终" : "最终选择"}</button>
          <button class="delete-button" type="button" data-vendor-delete="${vendor.id}">删除</button>
        </div>
      </div>
    </article>
  `;
}

function renderGuests() {
  document.querySelector("#guestTable").innerHTML = state.guests
    .map(
      (guest) => `
      <tr>
        <td>${text(guest.name)}</td>
        <td>${text(guest.group)}</td>
        <td>${guest.plusOne ? "是" : "否"}</td>
        <td>${guestCount(guest)} 人</td>
        <td>${guest.lodging ? "需要" : "不需要"}</td>
        <td>${text(guest.note || "无")}</td>
        <td><button class="text-button danger" type="button" data-guest-delete="${guest.id}">删除</button></td>
        <td class="attendance-cell"><button class="${guest.confirmed ? "status-button active" : "status-button"}" type="button" data-guest-toggle="${guest.id}">${guest.confirmed ? "已出席" : "待确认"}</button></td>
      </tr>
    `
    )
    .join("");
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
  document.querySelector("#profileNameInput").value = currentUser.name || "";
  const avatar = document.querySelector("#accountAvatar");
  if (currentUser.avatar) {
    avatar.innerHTML = `<img src="${currentUser.avatar}" alt="${text(name)} 的头像" />`;
  } else {
    avatar.textContent = currentUser.name ? currentUser.name.trim().slice(0, 1).toUpperCase() : "囍";
  }

  const heroPhoto = document.querySelector("#heroPhoto");
  if (currentUser.cover) {
    heroPhoto.innerHTML = `<img class="cover-shift-image" src="${currentUser.cover}" alt="婚礼封面照片" style="transform: translateY(${coverOffset(currentUser.coverY)}%);" />`;
  } else {
    heroPhoto.innerHTML = "<span>封面照片</span>";
  }

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

function renderCoverPreview() {
  const preview = document.querySelector("#coverPreview");
  const cover = pendingCover || currentUser.cover;
  const y = Number(document.querySelector("#coverPositionInput").value || currentUser.coverY || 50);
  if (!cover) {
    preview.innerHTML = "<span>选择图片后预览</span>";
    return;
  }
  preview.innerHTML = `<img class="cover-shift-image" src="${cover}" alt="封面预览" style="transform: translateY(${coverOffset(y)}%);" />`;
}

function renderAll() {
  renderUser();
  document.querySelector("#weddingDate").value = state.weddingDate;
  renderOverview();
  renderTasks();
  renderBudget();
  renderVendors();
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
  if (typeof modal.showModal === "function") modal.showModal();
  else modal.setAttribute("open", "");
}

function closeModal(id) {
  const modal = document.querySelector(`#${id}`);
  if (typeof modal.close === "function") modal.close();
  else modal.removeAttribute("open");
}

document.querySelector("#navList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (button) setView(button.dataset.view);
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

  const vendorDelete = event.target.closest("[data-vendor-delete]");
  if (vendorDelete) {
    const vendor = state.vendors.find((item) => item.id === Number(vendorDelete.dataset.vendorDelete));
    if (!vendor || !window.confirm(`确定删除“${vendor.name}”吗？`)) return;
    await deleteVendorImage(vendor.id);
    state.vendors = state.vendors.filter((item) => item.id !== vendor.id);
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

  const guestDelete = event.target.closest("[data-guest-delete]");
  if (guestDelete) {
    const guest = state.guests.find((item) => item.id === Number(guestDelete.dataset.guestDelete));
    if (!guest || !window.confirm(`确定删除“${guest.name}”吗？`)) return;
    state.guests = state.guests.filter((item) => item.id !== guest.id);
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
    await acceptInvite(acceptButton.dataset.acceptInvite);
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

document.querySelectorAll(".modal").forEach((modal) => {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal(modal.id);
  });
});

document.querySelector("#weddingDate").addEventListener("change", (event) => {
  state.weddingDate = event.target.value;
  saveState();
  renderAll();
});

document.querySelector("#taskForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  state.tasks.push({
    id: Date.now(),
    title: data.title,
    details: data.details,
    owner: data.owner,
    due: state.weddingDate,
    phase: "新事项",
    status: "todo"
  });
  closeModal("taskModal");
  saveState();
  renderAll();
});

document.querySelector("#vendorForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const file = form.elements.caseImage.files[0];
  if (!file) return;
  if (file.size > MAX_VENDOR_FILE_SIZE) {
    window.alert("图片文件超过 100MB，请换一个更小的文件。");
    return;
  }
  const id = Date.now();
  await saveVendorImage(id, file);
  state.vendors.push({
    id,
    name: data.name,
    type: data.type,
    schedule: data.schedule,
    contactName: data.contactName,
    phone: data.phone,
    quote: Number(data.quote),
    selected: false,
    imageName: file.name
  });
  closeModal("vendorModal");
  saveState();
  renderAll();
});

document.querySelector("#guestForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  state.guests.push({
    id: Date.now(),
    name: data.name,
    group: data.group,
    plusOne: Boolean(data.plusOne),
    lodging: Boolean(data.lodging),
    note: data.note,
    confirmed: false
  });
  closeModal("guestModal");
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
  const name = document.querySelector("#profileNameInput").value.trim() || profileName(currentSession.user);
  const { error } = await supabaseClient
    .from("profiles")
    .update({ display_name: name, updated_at: new Date().toISOString() })
    .eq("id", currentSession.user.id);
  if (error) {
    window.alert(`保存失败：${error.message}`);
    return;
  }
  currentUser = { ...currentUser, name };
  saveUser();
  closeModal("accountModal");
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
  pendingInvites = [];
  currentUser = { name: "", email: "", avatar: "", cover: "", coverY: 50 };
  saveUser();
  closeModal("accountModal");
  showAuthGate();
});

document.querySelector("#uploadCoverButton").addEventListener("click", () => {
  pendingCover = "";
  openModal("coverModal");
  document.querySelector("#coverPositionInput").value = currentUser.coverY || 50;
  document.querySelector("#coverFileLabel").textContent = currentUser.cover ? "更换图片" : "选择图片";
  renderCoverPreview();
});

document.querySelector("#coverImageInput").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    pendingCover = reader.result;
    document.querySelector("#coverFileLabel").textContent = file.name;
    renderCoverPreview();
  };
  reader.readAsDataURL(file);
});

document.querySelector("#coverPositionInput").addEventListener("input", renderCoverPreview);

document.querySelector("#coverForm").addEventListener("submit", (event) => {
  event.preventDefault();
  currentUser = {
    ...currentUser,
    cover: pendingCover || currentUser.cover,
    coverY: Number(document.querySelector("#coverPositionInput").value || 50)
  };
  saveUser();
  closeModal("coverModal");
  renderAll();
  event.currentTarget.reset();
  pendingCover = "";
});

async function initApp() {
  if (!requireSupabase()) return;
  showAuthGate("正在检查登录状态...");
  const { data, error } = await supabaseClient.auth.getSession();
  if (error || !data.session) {
    showAuthGate();
    return;
  }
  await enterApplication(data.session);
}

initApp();
