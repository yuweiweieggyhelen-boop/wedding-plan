const STORAGE_KEY = "wedding-pm-state-v2";
const USER_STORAGE_KEY = "wedding-pm-user-v1";
const VENDOR_DB_NAME = "wedding-pm-vendor-files";
const VENDOR_STORE = "caseImages";
const MAX_VENDOR_FILE_SIZE = 100 * 1024 * 1024;

const initialState = {
  weddingDate: "2026-10-18",
  tasks: [
    { id: 1, title: "确认婚宴酒店合同与尾款节点", details: "核对合同金额、菜单、场地使用时间和尾款支付日期。", owner: "Helen", due: "2026-07-12", phase: "场地", status: "doing" },
    { id: 2, title: "筛选摄影摄像作品集并约档期", details: "对比样片风格、交付内容、双机位价格和婚礼当天档期。", owner: "两人", due: "2026-07-18", phase: "供应商", status: "todo" },
    { id: 3, title: "整理第一版宾客名单", details: "先列出双方亲友、朋友和同事，后续再确认是否出席。", owner: "双方父母", due: "2026-07-21", phase: "宾客", status: "doing" }
  ],
  budget: [
    { id: 1, item: "婚宴酒店", category: "场地", planned: 88000, paid: 30000, balance: 58000 },
    { id: 2, item: "婚庆策划", category: "策划", planned: 36000, paid: 12000, balance: 24000 },
    { id: 3, item: "摄影摄像", category: "影像", planned: 22000, paid: 6000, balance: 16000 }
  ],
  vendors: [
    { id: 1, name: "湖畔宴会厅", type: "婚宴酒店", schedule: "婚礼日全天可用", contactName: "周经理", phone: "138-0000-0001", quote: 88000, selected: true, imageName: "" },
    { id: 2, name: "白昼婚礼策划", type: "婚庆策划", schedule: "待确认现场勘测", contactName: "Mia", phone: "138-0000-0002", quote: 36000, selected: false, imageName: "" }
  ],
  guests: [
    { id: 1, name: "李阿姨", group: "女方亲友", plusOne: false, lodging: false, note: "素食", confirmed: true },
    { id: 2, name: "王叔叔", group: "男方亲友", plusOne: true, lodging: false, note: "需停车", confirmed: true },
    { id: 3, name: "陈同学", group: "朋友", plusOne: false, lodging: true, note: "等航班", confirmed: false }
  ],
  timeline: [
    { time: "07:30", title: "新娘妆造开始", owner: "化妆师", check: "晨袍、首饰、捧花" },
    { time: "10:30", title: "接亲与合影", owner: "伴郎伴娘", check: "红包、堵门道具、摄影到位" },
    { time: "14:00", title: "场地彩排", owner: "婚庆统筹", check: "音响、灯光、走位" },
    { time: "17:30", title: "迎宾签到", owner: "签到负责人", check: "签到本、座位表、伴手礼" },
    { time: "18:18", title: "仪式开始", owner: "主持人", check: "戒指、誓词卡、音乐" }
  ]
};

let state = loadState();
let currentUser = loadUser();
let vendorDbPromise;
let vendorImageUrls = new Map();

const views = {
  overview: document.querySelector("#overviewView"),
  tasks: document.querySelector("#tasksView"),
  budget: document.querySelector("#budgetView"),
  vendors: document.querySelector("#vendorsView"),
  guests: document.querySelector("#guestsView"),
  timeline: document.querySelector("#timelineView")
};

const titles = {
  overview: "总览仪表盘",
  tasks: "任务看板",
  budget: "预算管理",
  vendors: "供应商管理",
  guests: "宾客管理",
  timeline: "婚礼当天流程"
};

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(initialState);
  try {
    return { ...structuredClone(initialState), ...JSON.parse(saved) };
  } catch {
    return structuredClone(initialState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadUser() {
  const saved = localStorage.getItem(USER_STORAGE_KEY);
  if (!saved) return { name: "", avatar: "", cover: "" };
  try {
    return { name: "", avatar: "", cover: "", ...JSON.parse(saved) };
  } catch {
    return { name: "", avatar: "", cover: "" };
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

function money(value) {
  return `¥${Number(value || 0).toLocaleString("zh-CN")}`;
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
  const confirmed = state.guests.filter((guest) => guest.confirmed).length;
  const selectedVendors = state.vendors.filter((vendor) => vendor.selected).length;
  const daysLeft = daysBetween(state.weddingDate);

  document.querySelector("#daysLeft").textContent = daysLeft >= 0 ? `${daysLeft} 天` : `已完成 ${Math.abs(daysLeft)} 天`;
  document.querySelector("#taskProgress").textContent = `${progress}%`;
  document.querySelector("#taskProgressBar").style.width = `${progress}%`;
  document.querySelector("#budgetUsed").textContent = money(paid);
  document.querySelector("#budgetTotal").textContent = `总预算 ${money(planned)}`;
  document.querySelector("#guestConfirmed").textContent = `${confirmed} 人`;
  document.querySelector("#guestTotal").textContent = `宾客总数 ${state.guests.length} 人`;
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
        <td>${guest.lodging ? "需要" : "不需要"}</td>
        <td>${text(guest.note || "无")}</td>
        <td><button class="text-button danger" type="button" data-guest-delete="${guest.id}">删除</button></td>
        <td class="attendance-cell"><button class="${guest.confirmed ? "status-button active" : "status-button"}" type="button" data-guest-toggle="${guest.id}">${guest.confirmed ? "已出席" : "待确认"}</button></td>
      </tr>
    `
    )
    .join("");
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
  const avatar = document.querySelector("#accountAvatar");
  if (currentUser.avatar) {
    avatar.innerHTML = `<img src="${currentUser.avatar}" alt="${text(name)} 的头像" />`;
  } else {
    avatar.textContent = currentUser.name ? currentUser.name.trim().slice(0, 1).toUpperCase() : "囍";
  }

  const heroPhoto = document.querySelector("#heroPhoto");
  if (currentUser.cover) {
    heroPhoto.innerHTML = `<img src="${currentUser.cover}" alt="婚礼封面照片" />`;
  } else {
    heroPhoto.innerHTML = "<span>封面照片</span>";
  }
}

function renderAll() {
  renderUser();
  document.querySelector("#weddingDate").value = state.weddingDate;
  renderOverview();
  renderTasks();
  renderBudget();
  renderVendors();
  renderGuests();
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
});

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

document.querySelector("#loginForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const file = form.elements.avatar.files[0];

  function persistUser(avatar = currentUser.avatar || "") {
    currentUser = { ...currentUser, name: data.name, avatar };
    saveUser();
    closeModal("loginModal");
    renderAll();
  }

  if (!file) {
    persistUser();
    return;
  }

  const reader = new FileReader();
  reader.onload = () => persistUser(reader.result);
  reader.readAsDataURL(file);
});

document.querySelector("#uploadCoverButton").addEventListener("click", () => {
  document.querySelector("#coverImageInput").click();
});

document.querySelector("#coverImageInput").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    currentUser = { ...currentUser, cover: reader.result };
    saveUser();
    renderAll();
    event.target.value = "";
  };
  reader.readAsDataURL(file);
});

renderAll();

if (!currentUser.name) {
  openModal("loginModal");
}
