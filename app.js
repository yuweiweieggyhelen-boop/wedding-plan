const STORAGE_KEY = "wedding-pm-state-v1";

const initialState = {
  weddingDate: "2026-10-18",
  tasks: [
    { id: 1, title: "确认婚宴酒店合同与尾款节点", details: "核对合同金额、菜单、场地使用时间和尾款支付日期。", owner: "Helen", due: "2026-07-12", phase: "场地", status: "doing", priority: "高" },
    { id: 2, title: "筛选摄影摄像作品集并约档期", details: "对比样片风格、交付内容、双机位价格和婚礼当天档期。", owner: "两人", due: "2026-07-18", phase: "供应商", status: "todo", priority: "高" },
    { id: 3, title: "整理第一版宾客名单", details: "先列出双方亲友、朋友和同事，后续再确认是否出席。", owner: "双方父母", due: "2026-07-21", phase: "宾客", status: "doing", priority: "中" },
    { id: 4, title: "确认婚礼主色与花艺方向", details: "确定主色、花材倾向、迎宾区和仪式区基础风格。", owner: "Helen", due: "2026-08-02", phase: "设计", status: "review", priority: "中" },
    { id: 5, title: "试妆并记录妆造反馈", details: "试妆后记录底妆、发型、头饰、换装时间和需要调整的点。", owner: "Helen", due: "2026-08-16", phase: "造型", status: "todo", priority: "中" },
    { id: 6, title: "准备婚礼当天物料箱清单", details: "整理戒指、誓词卡、红包、签到用品、备用针线和充电器。", owner: "伴娘", due: "2026-10-10", phase: "执行", status: "done", priority: "低" }
  ],
  budget: [
    { id: 1, item: "婚宴酒店", category: "场地", planned: 88000, paid: 30000, due: "2026-09-18" },
    { id: 2, item: "婚庆策划", category: "策划", planned: 36000, paid: 12000, due: "2026-08-30" },
    { id: 3, item: "摄影摄像", category: "影像", planned: 22000, paid: 6000, due: "2026-09-28" },
    { id: 4, item: "婚纱礼服", category: "造型", planned: 18000, paid: 9000, due: "2026-08-16" },
    { id: 5, item: "伴手礼与喜糖", category: "采购", planned: 12000, paid: 0, due: "2026-09-20" }
  ],
  vendors: [
    { id: 1, name: "湖畔宴会厅", type: "婚宴酒店", contact: "周经理 138-0000-0001", quote: 88000, next: "确认菜单升级与停车位" },
    { id: 2, name: "白昼婚礼策划", type: "婚庆策划", contact: "Mia 138-0000-0002", quote: 36000, next: "提交舞台平面图" },
    { id: 3, name: "Frame 27 Studio", type: "摄影摄像", contact: "Leo 138-0000-0003", quote: 22000, next: "锁定双机位档期" },
    { id: 4, name: "Luna Bridal", type: "婚纱礼服", contact: "Nora 138-0000-0004", quote: 18000, next: "预约二次试纱" }
  ],
  guests: [
    { id: 1, name: "李阿姨", group: "女方亲友", confirmed: true, table: "A03", note: "素食" },
    { id: 2, name: "王叔叔", group: "男方亲友", confirmed: true, table: "B02", note: "需停车" },
    { id: 3, name: "陈同学", group: "朋友", confirmed: false, table: "待定", note: "等航班" },
    { id: 4, name: "Grace", group: "同事", confirmed: true, table: "C01", note: "" }
  ],
  timeline: [
    { time: "07:30", title: "新娘妆造开始", owner: "化妆师", check: "晨袍、首饰、捧花" },
    { time: "10:30", title: "接亲与合影", owner: "伴郎伴娘", check: "红包、堵门道具、摄影到位" },
    { time: "14:00", title: "场地彩排", owner: "婚庆统筹", check: "音响、灯光、走位" },
    { time: "17:30", title: "迎宾签到", owner: "签到负责人", check: "签到本、座位表、伴手礼" },
    { time: "18:18", title: "仪式开始", owner: "主持人", check: "戒指、誓词卡、音乐" },
    { time: "20:30", title: "送客与物料回收", owner: "双方家人", check: "礼金、衣物、影像素材" }
  ]
};

let state = loadState();

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

function money(value) {
  return `¥${Number(value).toLocaleString("zh-CN")}`;
}

function text(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function daysBetween(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateString);
  return Math.ceil((target - today) / 86400000);
}

function isOverdue(task) {
  return task.status !== "done" && daysBetween(task.due) < 0;
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
  const overBudget = state.budget.filter((item) => Number(item.paid) > Number(item.planned)).length;
  const risks = state.tasks.filter(isOverdue).length + overBudget;
  const daysLeft = daysBetween(state.weddingDate);

  document.querySelector("#daysLeft").textContent = daysLeft >= 0 ? `${daysLeft} 天` : `已完成 ${Math.abs(daysLeft)} 天`;
  document.querySelector("#taskProgress").textContent = `${progress}%`;
  document.querySelector("#taskProgressBar").style.width = `${progress}%`;
  document.querySelector("#budgetUsed").textContent = money(paid);
  document.querySelector("#budgetTotal").textContent = `总预算 ${money(planned)}`;
  document.querySelector("#guestConfirmed").textContent = `${confirmed} 人`;
  document.querySelector("#guestTotal").textContent = `宾客总数 ${state.guests.length} 人`;
  document.querySelector("#riskCount").textContent = `${risks} 项`;

  const activeTasks = state.tasks
    .filter((task) => task.status !== "done")
    .sort((a, b) => new Date(a.due) - new Date(b.due))
    .slice(0, 4);
  document.querySelector("#priorityTasks").innerHTML = activeTasks.map(renderMiniTask).join("");
  document.querySelector("#sidebarFocus").textContent = activeTasks[0]?.title || "所有事项都已完成";

  const payments = state.budget
    .filter((item) => item.planned - item.paid > 0)
    .sort((a, b) => new Date(a.due) - new Date(b.due))
    .slice(0, 4);
  document.querySelector("#upcomingPayments").innerHTML = payments.map(renderPayment).join("");
}

function renderMiniTask(task) {
  const days = daysBetween(task.due);
  const dueText = days < 0 ? `已逾期 ${Math.abs(days)} 天` : `${days} 天后截止`;
  return `
    <article class="list-item">
      <div>
        <strong>${task.title}</strong>
        <span>${task.owner} · ${task.phase}</span>
      </div>
      <span class="${days < 0 ? "pill warn" : "pill"}">${dueText}</span>
    </article>
  `;
}

function renderPayment(item) {
  return `
    <article class="list-item">
      <div>
        <strong>${item.item}</strong>
        <span>${item.category} · ${item.due}</span>
      </div>
      <span class="pill">${money(item.planned - item.paid)}</span>
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
      const cards = state.tasks
        .filter((task) => task.status === status)
        .sort((a, b) => new Date(a.due) - new Date(b.due))
        .map(renderTaskCard)
        .join("");
      return `<section class="board-column"><h3>${label}</h3>${cards}</section>`;
    })
    .join("");
}

function renderTaskCard(task) {
  const days = daysBetween(task.due);
  const details = task.details || "暂无任务内容";
  return `
    <article class="task-card">
      <div class="task-card-heading">
        <strong>${text(task.title)}</strong>
        <button class="delete-button" type="button" data-task-delete="${task.id}" aria-label="删除任务">删除</button>
      </div>
      <p>${text(details)}</p>
      <div class="task-meta">
        <span class="pill">${text(task.owner)}</span>
        <span class="pill">${text(task.phase)}</span>
        <span class="${days < 0 && task.status !== "done" ? "pill warn" : "pill"}">${task.due}</span>
      </div>
      <div class="task-actions">
        <button class="item-action" data-task-move="${task.id}">推进</button>
        <button class="item-action" data-task-done="${task.id}">完成</button>
      </div>
    </article>
  `;
}

function renderBudget() {
  document.querySelector("#budgetTable").innerHTML = state.budget
    .map((item) => {
      const balance = Number(item.planned) - Number(item.paid);
      const status = balance <= 0 ? "已结清" : `${item.due} 前付款`;
      return `
        <tr>
          <td>${item.item}</td>
          <td>${item.category}</td>
          <td>${money(item.planned)}</td>
          <td>${money(item.paid)}</td>
          <td>${money(Math.max(balance, 0))}</td>
          <td><span class="${balance < 0 ? "pill warn" : "pill"}">${status}</span></td>
        </tr>
      `;
    })
    .join("");
}

function renderVendors() {
  document.querySelector("#vendorGrid").innerHTML = state.vendors
    .map(
      (vendor) => `
      <article class="vendor-card">
        <span class="pill">${vendor.type}</span>
        <strong>${vendor.name}</strong>
        <p>${vendor.next}</p>
        <div class="vendor-footer">
          <span>${vendor.contact}</span>
          <span>${money(vendor.quote)}</span>
        </div>
      </article>
    `
    )
    .join("");
}

function renderGuests() {
  document.querySelector("#guestTable").innerHTML = state.guests
    .map(
      (guest) => `
      <tr>
        <td>${guest.name}</td>
        <td>${guest.group}</td>
        <td><button class="item-action" data-guest-toggle="${guest.id}">${guest.confirmed ? "已确认" : "待确认"}</button></td>
        <td>${guest.table}</td>
        <td>${guest.note || "无"}</td>
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
        <div class="timeline-time">${item.time}</div>
        <div>
          <strong>${item.title}</strong>
          <p>${item.check}</p>
        </div>
        <span class="pill">${item.owner}</span>
      </article>
    `
    )
    .join("");
}

function renderAll() {
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

document.querySelector("#navList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (button) setView(button.dataset.view);
});

document.body.addEventListener("click", (event) => {
  const jump = event.target.closest("[data-view-jump]");
  if (jump) setView(jump.dataset.viewJump);

  const move = event.target.closest("[data-task-move]");
  if (move) {
    const task = state.tasks.find((item) => item.id === Number(move.dataset.taskMove));
    task.status = nextTaskStatus(task.status);
    saveState();
    renderAll();
  }

  const done = event.target.closest("[data-task-done]");
  if (done) {
    const task = state.tasks.find((item) => item.id === Number(done.dataset.taskDone));
    task.status = "done";
    saveState();
    renderAll();
  }

  const taskDelete = event.target.closest("[data-task-delete]");
  if (taskDelete) {
    const task = state.tasks.find((item) => item.id === Number(taskDelete.dataset.taskDelete));
    if (!task) return;
    const shouldDelete = window.confirm(`确定删除“${task.title}”吗？`);
    if (!shouldDelete) return;
    state.tasks = state.tasks.filter((item) => item.id !== task.id);
    saveState();
    renderAll();
  }

  const guestToggle = event.target.closest("[data-guest-toggle]");
  if (guestToggle) {
    const guest = state.guests.find((item) => item.id === Number(guestToggle.dataset.guestToggle));
    guest.confirmed = !guest.confirmed;
    saveState();
    renderAll();
  }
});

document.querySelector("#weddingDate").addEventListener("change", (event) => {
  state.weddingDate = event.target.value;
  saveState();
  renderAll();
});

const taskModal = document.querySelector("#taskModal");
const taskForm = document.querySelector("#taskForm");

function openTaskModal() {
  taskForm.reset();
  if (typeof taskModal.showModal === "function") {
    taskModal.showModal();
  } else {
    taskModal.setAttribute("open", "");
  }
}

function closeTaskModal() {
  taskModal.close();
}

document.querySelector("#openTaskModal").addEventListener("click", openTaskModal);
document.querySelector("#closeTaskModal").addEventListener("click", closeTaskModal);
document.querySelector("#cancelTaskModal").addEventListener("click", closeTaskModal);
taskModal.addEventListener("click", (event) => {
  if (event.target === taskModal) closeTaskModal();
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
    status: "todo",
    priority: "中"
  });
  event.currentTarget.reset();
  closeTaskModal();
  saveState();
  renderAll();
});

document.querySelector("#budgetForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  state.budget.push({
    id: Date.now(),
    item: data.item,
    category: "新增",
    planned: Number(data.planned),
    paid: Number(data.paid),
    due: state.weddingDate
  });
  event.currentTarget.reset();
  saveState();
  renderAll();
});

document.querySelector("#guestForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  state.guests.push({
    id: Date.now(),
    name: data.name,
    group: data.group,
    confirmed: false,
    table: data.table,
    note: ""
  });
  event.currentTarget.reset();
  saveState();
  renderAll();
});

renderAll();
