const dateFilter = document.getElementById("dateFilter");
const startInput = document.getElementById("startDate");
const endInput = document.getElementById("endDate");
const detailDialog = document.getElementById("detailDialog");

const chartInstances = {};
let toastTimer;

const money = amount => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0
}).format(amount || 0);

const number = value => new Intl.NumberFormat("en-IN").format(value || 0);

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function shiftDate(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
function dateInRange(value, start, end) {
  const date = parseDate(value);
  return date >= start && date <= end;
}
function getDateRange() {
  const today = parseDate(formatDate(new Date()));
  if (dateFilter.value === "today") return { start: today, end: today };
  if (dateFilter.value === "custom") {
    if (!startInput.value || !endInput.value) return null;
    const start = parseDate(startInput.value);
    const end = parseDate(endInput.value);
    if (start > end || end > today) {
      showToast(start > end ? "Start date must be on or before end date." : "End date cannot be in the future.");
      return null;
    }
    return { start, end };
  }
  const days = Number(dateFilter.value);
  return { start: shiftDate(today, -(days - 1)), end: today };
}
function pct(current, previous) {
  if (previous === 0) return current === 0 ? "0% vs previous period" : "New activity vs previous period";
  const change = ((current - previous) / previous) * 100;
  return `${change > 0 ? "↑" : change < 0 ? "↓" : "→"} ${Math.abs(change).toFixed(1)}% vs previous period`;
}
function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}
function getLead(id) { return leads.find(item => item.id === id); }
function getDeal(id) { return deals.find(item => item.id === id); }
function getOrder(id) { return orders.find(item => item.id === id); }
function getQuote(id) { return quotations.find(item => item.id === id); }
function getPaymentsForDeal(dealId) { return payments.filter(payment => payment.dealId === dealId); }
function getPaymentsForOrder(orderId) { return payments.filter(payment => payment.orderId === orderId); }
function getCollectedForDeal(dealId, start = null, end = null) {
  return getPaymentsForDeal(dealId)
    .filter(payment => payment.status === "Received" && (!start || dateInRange(payment.date, start, end)))
    .reduce((sum, payment) => sum + payment.amount, 0);
}
function getReceivedTotalForDeal(dealId) {
  return getPaymentsForDeal(dealId).filter(p => p.status === "Received").reduce((sum, p) => sum + p.amount, 0);
}
function getDealOutstanding(deal) {
  return Math.max(0, deal.value - getReceivedTotalForDeal(deal.id));
}
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}
function pill(status) {
  const s = String(status).toLowerCase();
  let cls = "";
  if (["accepted", "converted", "qualified", "completed", "received"].includes(s)) cls = "green";
  else if (["sent", "in progress", "website"].includes(s)) cls = "blue";
  else if (["high", "rejected", "unqualified", "on hold"].includes(s)) cls = s === "high" ? "red" : "red";
  else if (["medium", "pending", "draft"].includes(s)) cls = "orange";
  else if (s === "low") cls = "purple";
  return `<span class="pill ${cls}">${escapeHTML(status)}</span>`;
}
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}
function drawChart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas || typeof Chart === "undefined") return;
  if (chartInstances[id]) chartInstances[id].destroy();
  chartInstances[id] = new Chart(canvas, {
    ...config,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { usePointStyle: true, boxWidth: 7, padding: 16 } }, ...(config.options?.plugins || {}) },
      ...config.options
    }
  });
}
function emptyRow(colspan, text) {
  return `<tr><td class="empty" colspan="${colspan}">${escapeHTML(text)}</td></tr>`;
}
function fillTable(id, rows, colspan, emptyText = "No records found for this period.") {
  const tbody = document.getElementById(id);
  if (tbody) tbody.innerHTML = rows.length ? rows.join("") : emptyRow(colspan, emptyText);
}
function chartColors(count) {
  const palette = ["#2864e8", "#10b981", "#8058e8", "#f59e0b", "#ec4899", "#06b6d4", "#ef4444", "#64748b"];
  return Array.from({ length: count }, (_, i) => palette[i % palette.length]);
}
function aggregate(records, keyFn, valueFn = () => 1) {
  const result = {};
  records.forEach(record => {
    const key = keyFn(record);
    result[key] = (result[key] || 0) + valueFn(record);
  });
  return result;
}
function rangeDays(start, end) {
  const labels = [], keys = [];
  for (let date = new Date(start); date <= end; date = shiftDate(date, 1)) {
    keys.push(formatDate(date));
    labels.push(`${String(date.getDate()).padStart(2, "0")} ${date.toLocaleString("en-IN", { month: "short" })}`);
  }
  return { labels, keys };
}

function renderDashboard() {
  const range = getDateRange();
  if (!range) return;
  const { start, end } = range;
  const duration = Math.round((end - start) / 86400000) + 1;
  const previousEnd = shiftDate(start, -1);
  const previousStart = shiftDate(previousEnd, -(duration - 1));

  const currentLeads = leads.filter(x => dateInRange(x.date, start, end));
  const previousLeads = leads.filter(x => dateInRange(x.date, previousStart, previousEnd));
  const currentQuotes = quotations.filter(x => dateInRange(x.date, start, end));
  const previousQuotes = quotations.filter(x => dateInRange(x.date, previousStart, previousEnd));
  const currentDeals = deals.filter(x => dateInRange(x.date, start, end));
  const previousDeals = deals.filter(x => dateInRange(x.date, previousStart, previousEnd));
  const currentOrders = orders.filter(x => dateInRange(x.date, start, end));
  const currentPayments = payments.filter(x => dateInRange(x.date, start, end));

  renderLeads(currentLeads, previousLeads, start, end);
  renderQuotations(currentQuotes, previousQuotes, currentDeals, start, end);
  renderDeals(currentDeals, previousDeals, start, end);
  renderOrders(currentOrders, currentPayments, currentDeals, start, end);
  renderActivity(start, end);
}

function renderLeads(records, previousRecords, start, end) {
  const count = status => records.filter(x => x.status === status).length;
  const previousCount = status => previousRecords.filter(x => x.status === status).length;
  setText("totalLeads", number(records.length));
  setText("qualifiedLeads", number(count("Qualified")));
  setText("convertedLeads", number(count("Converted")));
  setText("unqualifiedLeads", number(count("Unqualified")));
  setText("conversionRate", `${records.length ? (count("Converted") / records.length * 100).toFixed(1) : "0.0"}%`);
  setText("leadsChange", pct(records.length, previousRecords.length));
  setText("qualifiedChange", pct(count("Qualified"), previousCount("Qualified")));
  setText("convertedChange", pct(count("Converted"), previousCount("Converted")));

  const search = (document.getElementById("leadSearch")?.value || "").toLowerCase();
  const visible = records.filter(x => `${x.name} ${x.source} ${x.status}`.toLowerCase().includes(search));
  fillTable("leadTable", visible.map(lead => {
    const quoteCount = quotations.filter(q => q.leadId === lead.id).length;
    const dealCount = deals.filter(d => d.leadId === lead.id).length;
    return `<tr class="clickable" data-kind="lead" data-id="${lead.id}"><td><strong>${escapeHTML(lead.name)}</strong></td><td>${escapeHTML(lead.source)}</td><td>${pill(lead.status)}</td><td>${lead.date}</td><td>${quoteCount}</td><td>${dealCount}</td></tr>`;
  }), 6);

  const days = rangeDays(start, end);
  const daily = days.keys.map(day => records.filter(x => x.date === day));
  drawChart("leadChart", {
    type: "line",
    data: { labels: days.labels, datasets: [
      { label: "New Leads", data: daily.map(x => x.length), borderColor: "#2864e8", backgroundColor: "#2864e8", tension: .32 },
      { label: "Qualified", data: daily.map(x => x.filter(y => y.status === "Qualified").length), borderColor: "#10b981", backgroundColor: "#10b981", tension: .32 },
      { label: "Converted", data: daily.map(x => x.filter(y => y.status === "Converted").length), borderColor: "#f59e0b", backgroundColor: "#f59e0b", tension: .32 }
    ] },
    options: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
  const sources = aggregate(records, x => x.source);
  drawChart("sourceChart", {
    type: "doughnut",
    data: { labels: Object.keys(sources), datasets: [{ data: Object.values(sources), backgroundColor: chartColors(Object.keys(sources).length), borderWidth: 0 }] },
    options: { cutout: "62%", plugins: { legend: { position: "bottom" } } }
  });
}

function renderQuotations(records, previousRecords, currentDeals, start, end) {
  const totalValue = records.reduce((sum, x) => sum + x.amount, 0);
  const accepted = records.filter(x => x.status === "Accepted").length;
  const linkedQuoteIds = new Set(currentDeals.map(x => x.quoteId));
  const conversion = records.length ? records.filter(q => linkedQuoteIds.has(q.id)).length / records.length * 100 : 0;
  setText("totalQuotes", number(records.length));
  setText("quoteValue", money(totalValue));
  setText("acceptedQuotes", number(accepted));
  setText("quoteConversion", `${conversion.toFixed(1)}%`);
  setText("quotesChange", pct(records.length, previousRecords.length));

  const statusFilter = document.getElementById("quoteStatusFilter")?.value || "all";
  const visible = records.filter(q => statusFilter === "all" || q.status === statusFilter);
  fillTable("quotationTable", visible.map(q => {
    const lead = getLead(q.leadId);
    const deal = deals.find(d => d.quoteId === q.id);
    return `<tr class="clickable" data-kind="quote" data-id="${q.id}"><td><strong>Q-${q.id}</strong></td><td>${escapeHTML(lead?.name || "Unknown")}</td><td>${escapeHTML(q.service)}</td><td>${money(q.amount)}</td><td>${pill(q.status)}</td><td>${q.date}</td><td>${deal ? `D-${deal.id}` : "—"}</td></tr>`;
  }), 7);

  const byService = aggregate(records, x => x.service, x => x.amount);
  drawChart("quotationServiceChart", {
    type: "bar",
    data: { labels: Object.keys(byService), datasets: [{ label: "Quoted value", data: Object.values(byService), backgroundColor: chartColors(Object.keys(byService).length), borderRadius: 5 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => "₹" + number(v) } } } }
  });
  const statuses = ["Draft", "Sent", "Accepted", "Rejected"];
  drawChart("quotationStatusChart", {
    type: "doughnut",
    data: { labels: statuses, datasets: [{ data: statuses.map(s => records.filter(q => q.status === s).length), backgroundColor: ["#94a3b8", "#2864e8", "#10b981", "#ef4444"], borderWidth: 0 }] },
    options: { cutout: "62%", plugins: { legend: { position: "bottom" } } }
  });
}

function renderDeals(records, previousRecords, start, end) {
  const dealValue = records.reduce((sum, d) => sum + d.value, 0);
  const collected = records.reduce((sum, d) => sum + getReceivedTotalForDeal(d.id), 0);
  const outstanding = records.reduce((sum, d) => sum + getDealOutstanding(d), 0);
  setText("totalDeals", number(records.length));
  setText("totalDealValue", money(dealValue));
  setText("collectedRevenue", money(collected));
  setText("outstandingRevenue", money(outstanding));
  setText("dealsChange", pct(records.length, previousRecords.length));

  const statusFilter = document.getElementById("dealStatusFilter")?.value || "all";
  const visible = records.filter(d => statusFilter === "all" || d.status === statusFilter);
  fillTable("dealTable", visible.map(d => {
    const lead = getLead(d.leadId);
    const received = getReceivedTotalForDeal(d.id);
    return `<tr class="clickable" data-kind="deal" data-id="${d.id}"><td><strong>D-${d.id}</strong></td><td>${escapeHTML(lead?.name || "Unknown")}</td><td>${escapeHTML(d.service)}</td><td>${pill(d.priority)}</td><td>${pill(d.status)}</td><td>${money(d.value)}</td><td>${money(received)}</td><td>${money(getDealOutstanding(d))}</td><td>${d.date}</td></tr>`;
  }), 9);

  const byService = aggregate(records, d => d.service, d => d.value);
  drawChart("revenueServiceChart", {
    type: "bar",
    data: { labels: Object.keys(byService), datasets: [{ label: "Deal value", data: Object.values(byService), backgroundColor: chartColors(Object.keys(byService).length), borderRadius: 5 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => "₹" + number(v) } } } }
  });
  const priorities = ["High", "Medium", "Low"];
  drawChart("dealPriorityChart", {
    type: "doughnut",
    data: { labels: priorities, datasets: [{ data: priorities.map(p => records.filter(d => d.priority === p).length), backgroundColor: ["#ef4444", "#f59e0b", "#10b981"], borderWidth: 0 }] },
    options: { cutout: "62%", plugins: { legend: { position: "bottom" } } }
  });
  const days = rangeDays(start, end);
  drawChart("dailyRevenueChart", {
    type: "line",
    data: { labels: days.labels, datasets: [
      { label: "Deal value", data: days.keys.map(day => records.filter(d => d.date === day).reduce((sum, d) => sum + d.value, 0)), borderColor: "#2864e8", backgroundColor: "#2864e8", tension: .3 },
      { label: "Collections received", data: days.keys.map(day => payments.filter(p => p.status === "Received" && p.date === day && records.some(d => d.id === p.dealId)).reduce((sum, p) => sum + p.amount, 0)), borderColor: "#10b981", backgroundColor: "#10b981", tension: .3 }
    ] },
    options: { scales: { y: { beginAtZero: true, ticks: { callback: v => "₹" + number(v) } } } }
  });
  const statuses = ["In Progress", "Completed", "On Hold"];
  drawChart("dealProgressChart", {
    type: "bar",
    data: { labels: statuses, datasets: [{ label: "Deals", data: statuses.map(s => records.filter(d => d.status === s).length), backgroundColor: ["#f59e0b", "#10b981", "#8058e8"], borderRadius: 5 }] },
    options: { indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
}

function renderOrders(records, paymentRecords, currentDeals, start, end) {
  const completed = records.filter(o => o.status === "Completed").length;
  const receivedPayments = paymentRecords.filter(p => p.status === "Received");
  const collectedInPeriod = receivedPayments.reduce((sum, p) => sum + p.amount, 0);
  const dealValue = currentDeals.reduce((sum, d) => sum + d.value, 0);
  const dealCollected = currentDeals.reduce((sum, d) => sum + getReceivedTotalForDeal(d.id), 0);
  setText("totalOrders", number(records.length));
  setText("completedOrders", number(completed));
  setText("paymentsCollected", money(collectedInPeriod));
  setText("collectionRate", `${dealValue ? (dealCollected / dealValue * 100).toFixed(1) : "0.0"}%`);

  const statusFilter = document.getElementById("orderStatusFilter")?.value || "all";
  const visible = records.filter(o => statusFilter === "all" || o.status === statusFilter);
  fillTable("orderTable", visible.map(o => {
    const deal = getDeal(o.dealId);
    const lead = getLead(o.leadId);
    const paymentCount = payments.filter(p => p.orderId === o.id).length;
    return `<tr class="clickable" data-kind="order" data-id="${o.id}"><td><strong>O-${o.id}</strong></td><td>${deal ? `D-${deal.id}` : "—"}</td><td>${escapeHTML(lead?.name || "Unknown")}</td><td>${escapeHTML(o.service)}</td><td>${pill(o.status)}</td><td>${money(o.value)}</td><td>${o.date}</td><td>${paymentCount}</td></tr>`;
  }), 8);

  fillTable("paymentTable", paymentRecords.slice().sort((a, b) => b.date.localeCompare(a.date)).map(p => {
    const order = getOrder(p.orderId);
    const deal = getDeal(p.dealId);
    const lead = getLead(deal?.leadId);
    return `<tr class="clickable" data-kind="payment" data-id="${p.id}"><td><strong>P-${p.id}</strong></td><td>${order ? `O-${order.id}` : "—"}</td><td>${deal ? `D-${deal.id}` : "—"}</td><td>${escapeHTML(lead?.name || "Unknown")}</td><td>${escapeHTML(p.method)}</td><td>${money(p.amount)}</td><td>${pill(p.status)}</td><td>${p.date}</td></tr>`;
  }), 8);

  const statuses = ["Pending", "In Progress", "Completed", "On Hold"];
  drawChart("orderStatusChart", {
    type: "doughnut",
    data: { labels: statuses, datasets: [{ data: statuses.map(s => records.filter(o => o.status === s).length), backgroundColor: ["#f59e0b", "#2864e8", "#10b981", "#8058e8"], borderWidth: 0 }] },
    options: { cutout: "62%", plugins: { legend: { position: "bottom" } } }
  });
  const days = rangeDays(start, end);
  drawChart("paymentTrendChart", {
    type: "bar",
    data: { labels: days.labels, datasets: [{ label: "Payments received", data: days.keys.map(day => payments.filter(p => p.status === "Received" && p.date === day).reduce((sum, p) => sum + p.amount, 0)), backgroundColor: "#10b981", borderRadius: 4 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => "₹" + number(v) } } } }
  });
}

function renderActivity(start, end) {
  const activity = [];
  leads.filter(x => dateInRange(x.date, start, end)).forEach(x => activity.push({ date: x.date, record: `Lead #${x.id}`, action: "Lead added", details: `${x.name} · ${x.source}` }));
  quotations.filter(x => dateInRange(x.date, start, end)).forEach(x => activity.push({ date: x.date, record: `Quote #${x.id}`, action: `Quotation ${x.status.toLowerCase()}`, details: `${x.service} · ${money(x.amount)}` }));
  deals.filter(x => dateInRange(x.date, start, end)).forEach(x => activity.push({ date: x.date, record: `Deal #${x.id}`, action: `Deal ${x.status.toLowerCase()}`, details: `${x.service} · ${money(x.value)}` }));
  payments.filter(x => dateInRange(x.date, start, end)).forEach(x => activity.push({ date: x.date, record: `Payment #${x.id}`, action: `Payment ${x.status.toLowerCase()}`, details: `${x.method} · ${money(x.amount)}` }));
  activity.sort((a, b) => b.date.localeCompare(a.date));
  fillTable("activityTable", activity.slice(0, 30).map(x => `<tr><td>${x.date}</td><td>${escapeHTML(x.record)}</td><td>${escapeHTML(x.action)}</td><td>${escapeHTML(x.details)}</td></tr>`), 4);
}

function showDetails(kind, id) {
  const body = document.getElementById("dialogBody");
  const title = document.getElementById("dialogTitle");
  let fields = [];
  let related = [];
  let heading = "";
  const field = (label, value) => `<div class="detail-field"><small>${escapeHTML(label)}</small><strong>${escapeHTML(value)}</strong></div>`;
  const list = (label, detail) => `<div class="detail-item"><strong>${escapeHTML(label)}</strong><span>${escapeHTML(detail)}</span></div>`;

  if (kind === "lead") {
    const x = getLead(Number(id)); if (!x) return;
    title.textContent = `Lead: ${x.name}`;
    fields = [["Lead ID", x.id], ["Source", x.source], ["Status", x.status], ["Created", x.date]];
    const qs = quotations.filter(q => q.leadId === x.id);
    const ds = deals.filter(d => d.leadId === x.id);
    heading = "Related quotations";
    related = qs.length ? qs.map(q => list(`Q-${q.id} · ${q.service}`, `${money(q.amount)} · ${q.status} · ${q.date}`)) : [list("No quotations", "No linked quotations")];
    related.push(`<h3>Related deals</h3>`);
    related.push(...(ds.length ? ds.map(d => list(`D-${d.id} · ${d.service}`, `${money(d.value)} · ${d.status}`)) : [list("No deals", "No linked deals")]));
  } else if (kind === "quote") {
    const x = getQuote(Number(id)); if (!x) return;
    const lead = getLead(x.leadId); const deal = deals.find(d => d.quoteId === x.id);
    title.textContent = `Quotation Q-${x.id}`;
    fields = [["Lead", lead?.name || "Unknown"], ["Service", x.service], ["Amount", money(x.amount)], ["Status", x.status], ["Date", x.date], ["Linked deal", deal ? `D-${deal.id}` : "No deal yet"]];
    related = [list("Lead history", `${quotations.filter(q => q.leadId === x.leadId).length} quotations for this lead`)];
    if (deal) related.push(list(`Deal D-${deal.id}`, `${money(deal.value)} · ${deal.status}`));
  } else if (kind === "deal") {
    const x = getDeal(Number(id)); if (!x) return;
    const lead = getLead(x.leadId); const quote = getQuote(x.quoteId);
    title.textContent = `Deal D-${x.id}`;
    fields = [["Lead", lead?.name || "Unknown"], ["Quotation", quote ? `Q-${quote.id}` : "—"], ["Service", x.service], ["Priority", x.priority], ["Status", x.status], ["Deal value", money(x.value)], ["Collected", money(getReceivedTotalForDeal(x.id))], ["Outstanding", money(getDealOutstanding(x))]];
    const os = orders.filter(o => o.dealId === x.id);
    related = [list("Linked quotation", quote ? `Q-${quote.id} · ${money(quote.amount)}` : "No quotation")];
    related.push(`<h3>Related orders</h3>`);
    related.push(...(os.length ? os.map(o => list(`O-${o.id} · ${o.service}`, `${money(o.value)} · ${o.status}`)) : [list("No orders", "No linked orders")]));
    related.push(`<h3>Payment history</h3>`);
    const ps = payments.filter(p => p.dealId === x.id);
    related.push(...(ps.length ? ps.map(p => list(`P-${p.id} · ${p.method}`, `${money(p.amount)} · ${p.status} · ${p.date}`)) : [list("No payments", "No linked payments")]));
  } else if (kind === "order") {
    const x = getOrder(Number(id)); if (!x) return;
    const deal = getDeal(x.dealId); const lead = getLead(x.leadId);
    title.textContent = `Order O-${x.id}`;
    fields = [["Lead", lead?.name || "Unknown"], ["Deal", deal ? `D-${deal.id}` : "—"], ["Service", x.service], ["Status", x.status], ["Order value", money(x.value)], ["Date", x.date]];
    const ps = getPaymentsForOrder(x.id);
    related = ps.length ? ps.map(p => list(`P-${p.id} · ${p.method}`, `${money(p.amount)} · ${p.status} · ${p.date}`)) : [list("No payments", "No payments linked to this order")];
  } else if (kind === "payment") {
    const x = payments.find(p => p.id === Number(id)); if (!x) return;
    const order = getOrder(x.orderId); const deal = getDeal(x.dealId); const lead = getLead(deal?.leadId);
    title.textContent = `Payment P-${x.id}`;
    fields = [["Lead", lead?.name || "Unknown"], ["Deal", deal ? `D-${deal.id}` : "—"], ["Order", order ? `O-${order.id}` : "—"], ["Amount", money(x.amount)], ["Method", x.method], ["Status", x.status], ["Date", x.date]];
    related = [list("Order value", order ? money(order.value) : "—"), list("Deal outstanding", deal ? money(getDealOutstanding(deal)) : "—")];
  }
  body.innerHTML = `<div class="detail-grid">${fields.map(([label, value]) => field(label, value)).join("")}</div>${heading ? `<h3>${escapeHTML(heading)}</h3>` : ""}<div class="detail-list">${related.join("")}</div>`;
  detailDialog.showModal();
}

function exportCSV() {
  const range = getDateRange();
  if (!range) return;
  const { start, end } = range;
  const rows = [["Record Type", "ID", "Related ID", "Name / Service", "Status", "Amount", "Date", "Notes"]];
  leads.filter(x => dateInRange(x.date, start, end)).forEach(x => rows.push(["Lead", x.id, "", x.name, x.status, "", x.date, x.source]));
  quotations.filter(x => dateInRange(x.date, start, end)).forEach(x => rows.push(["Quotation", x.id, `Lead ${x.leadId}`, x.service, x.status, x.amount, x.date, "INR"]));
  deals.filter(x => dateInRange(x.date, start, end)).forEach(x => rows.push(["Deal", x.id, `Lead ${x.leadId} / Quote ${x.quoteId}`, x.service, x.status, x.value, x.date, `${x.priority} priority`]));
  orders.filter(x => dateInRange(x.date, start, end)).forEach(x => rows.push(["Order", x.id, `Deal ${x.dealId}`, x.service, x.status, x.value, x.date, "INR"]));
  payments.filter(x => dateInRange(x.date, start, end)).forEach(x => rows.push(["Payment", x.id, `Order ${x.orderId} / Deal ${x.dealId}`, x.method, x.status, x.amount, x.date, "INR"]));
  const csv = rows.map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `business-analytics-${formatDate(start)}-to-${formatDate(end)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("CSV export downloaded.");
}

// Event delegation makes each record row open its drill-down view.
document.addEventListener("click", event => {
  const row = event.target.closest("tr[data-kind][data-id]");
  if (row) showDetails(row.dataset.kind, row.dataset.id);
});
document.getElementById("closeDialog").addEventListener("click", () => detailDialog.close());
detailDialog.addEventListener("click", event => {
  if (event.target === detailDialog) detailDialog.close();
});
document.getElementById("exportBtn").addEventListener("click", exportCSV);
document.getElementById("leadSearch").addEventListener("input", () => renderDashboard());
document.getElementById("quoteStatusFilter").addEventListener("change", () => renderDashboard());
document.getElementById("dealStatusFilter").addEventListener("change", () => renderDashboard());
document.getElementById("orderStatusFilter").addEventListener("change", () => renderDashboard());
dateFilter.addEventListener("change", () => {
  const custom = dateFilter.value === "custom";
  startInput.hidden = !custom;
  endInput.hidden = !custom;
  if (custom) {
    const today = formatDate(new Date());
    if (!startInput.value) startInput.value = today;
    if (!endInput.value) endInput.value = today;
    startInput.max = today;
    endInput.max = today;
  }
  renderDashboard();
});
startInput.addEventListener("change", renderDashboard);
endInput.addEventListener("change", renderDashboard);

// Start with Last 7 Days selected.
renderDashboard();
