const STORAGE_KEY = "ecotrackRecords";
const GOAL_STORAGE_KEY = "ecotrackGoals";
const SETTINGS_KEY = "ecotrackSettings";
const DEMO_SOURCE = "demo";
const USER_SOURCE = "manual";
const MAX_FUTURE_DAYS = 3650;

const RESOURCE_OPTIONS = {
  Electricity: ["kWh"],
  Water: ["L", "kL"],
  "Waste generated": ["kg"],
  "Waste diverted": ["kg"],
};

const app = {
  records: [],
  goals: [],
  currentPage: "dashboard",
  period: "30",
  chartInstances: {},
};

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindGlobalActions();
  bindAddDataForm();
  bindDataPage();
  bindAnalytics();
  bindGoals();
  setupCSVImportExport();
  initializePageState();
  renderAll();
});

function bindNavigation() {
  const navButtons = document.querySelectorAll(".nav-link");
  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetPage = button.dataset.page;
      setActivePage(targetPage);
    });
  });
}

function bindGlobalActions() {
  document.getElementById("goToAddDataBtn").addEventListener("click", () => {
    setActivePage("add-data");
  });

  document.getElementById("viewAllRecordsBtn").addEventListener("click", () => {
    setActivePage("data");
  });

  document.getElementById("loadDemoDataBtn").addEventListener("click", () => {
    if (confirm("Load the demonstration dataset? This will replace the current records in this browser.")) {
      const demoRecords = generateDemoData();
      saveRecords(demoRecords);
      app.records = demoRecords;
      showToast("Demo dataset loaded.");
      renderAll();
    }
  });

  document.getElementById("clearDataBtn").addEventListener("click", () => {
    if (confirm("Clear all data stored in this browser? This action cannot be undone.")) {
      localStorage.removeItem(STORAGE_KEY);
      app.records = [];
      showToast("All records cleared.");
      renderAll();
    }
  });

  document.getElementById("resetFormBtn").addEventListener("click", () => {
    resetForm();
  });

  document.getElementById("dashboardDateFilter").addEventListener("change", (event) => {
    app.period = event.target.value;
    renderDashboard();
    renderAnalytics();
  });
}

function bindAddDataForm() {
  const form = document.getElementById("addDataForm");
  const resourceTypeInput = document.getElementById("resourceType");

  resourceTypeInput.addEventListener("change", updateUnitOptions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = getFormValues();
    const validation = validateRecord(formData, { allowDuplicateWarning: true });

    clearFormMessages();

    if (!validation.valid) {
      showFieldErrors(validation.errors);
      setFormStatus("Please fix the highlighted errors.", "error");
      return;
    }

    const duplicate = findDuplicateRecord(formData);
    if (duplicate && !confirm("A similar record already exists. It may be a duplicate, but separate measurements can legitimately share the same values. Continue saving?")) {
      setFormStatus("Saving cancelled. Review the record and try again.", "error");
      return;
    }

    if (formData.id) {
      const targetIndex = app.records.findIndex((record) => record.id === formData.id);
      if (targetIndex >= 0) {
        app.records[targetIndex] = formData;
        showToast("Record updated.");
      }
    } else {
      formData.id = generateId();
      formData.sourceType = USER_SOURCE;
      app.records.push(formData);
      showToast("Record saved.");
    }

    saveRecords(app.records);
    resetForm();
    renderAll();
  });
}

function bindDataPage() {
  const resourceFilter = document.getElementById("dataResourceFilter");
  const fromDate = document.getElementById("dataFromDate");
  const toDate = document.getElementById("dataToDate");
  const searchInput = document.getElementById("dataSearchInput");

  resourceFilter.addEventListener("change", renderDataTable);
  fromDate.addEventListener("change", renderDataTable);
  toDate.addEventListener("change", renderDataTable);
  searchInput.addEventListener("input", renderDataTable);
}

function bindAnalytics() {
  document.getElementById("analyticsResourceFilter").addEventListener("change", renderAnalytics);
  document.getElementById("analyticsPeriodFilter").addEventListener("change", (event) => {
    app.period = event.target.value;
    document.getElementById("dashboardDateFilter").value = app.period;
    renderDashboard();
    renderAnalytics();
  });
}

function bindGoals() {
  document.getElementById("goalForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const goal = getGoalFormValues();
    const errors = validateGoal(goal);

    if (errors.length > 0) {
      document.getElementById("goalFormStatus").textContent = errors.join(" ");
      document.getElementById("goalFormStatus").className = "form-status error";
      return;
    }

    const existingIndex = app.goals.findIndex((item) => item.id === goal.id);
    if (existingIndex >= 0) {
      app.goals[existingIndex] = goal;
    } else {
      goal.id = generateId();
      app.goals.push(goal);
    }

    saveGoals();
    document.getElementById("goalForm").reset();
    document.getElementById("studentCount").value = getStudentCount();
    document.getElementById("goalFormStatus").textContent = "Goal saved successfully.";
    document.getElementById("goalFormStatus").className = "form-status success";
    renderGoals();
    renderBenchmark();
  });
}

function setupCSVImportExport() {
  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = ".csv,text/csv";
  importInput.style.display = "none";
  document.body.appendChild(importInput);

  const importButton = document.createElement("button");
  importButton.type = "button";
  importButton.textContent = "Import CSV";
  importButton.className = "button button-secondary";
  importButton.addEventListener("click", () => importInput.click());

  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.textContent = "Export CSV";
  exportButton.className = "button button-secondary";
  exportButton.addEventListener("click", exportRecordsAsCSV);

  const templateButton = document.createElement("button");
  templateButton.type = "button";
  templateButton.textContent = "Download template";
  templateButton.className = "button button-secondary";
  templateButton.addEventListener("click", downloadCSVTemplate);

  const controlBar = document.createElement("div");
  controlBar.className = "form-actions";
  controlBar.append(importButton, exportButton, templateButton);
  document.getElementById("page-data").appendChild(controlBar);

  importInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const csvText = await file.text();
      const result = parseAndValidateCsv(csvText);
      if (!result.validRows.length && !result.invalidRows.length) {
        showToast("No data was imported.");
        return;
      }

      if (result.invalidRows.length) {
        const reasons = result.invalidRows.map((row) => row.reason).slice(0, 5).join("; ");
        showToast(`Imported ${result.validRows.length} valid records. ${result.invalidRows.length} rows were rejected: ${reasons}`);
      }

      if (!confirm(`Import ${result.validRows.length} valid records into the current dataset?`)) {
        return;
      }

      const mergedRecords = [...app.records, ...result.validRows];
      saveRecords(mergedRecords);
      app.records = mergedRecords;
      renderAll();
      showToast(`Imported ${result.validRows.length} records.`);
    } catch (error) {
      console.error(error);
      showToast("CSV import failed. Please check the file and try again.");
    } finally {
      event.target.value = "";
    }
  });
}

function initializePageState() {
  const savedGoals = safeReadJson(GOAL_STORAGE_KEY, []);
  app.goals = Array.isArray(savedGoals) ? savedGoals : [];

  const settings = safeReadJson(SETTINGS_KEY, {});
  if (settings.period) {
    app.period = settings.period;
  }
  document.getElementById("dashboardDateFilter").value = app.period;
  document.getElementById("analyticsPeriodFilter").value = app.period;
  document.getElementById("studentCount").value = settings.studentCount || 900;

  const existingRecords = safeReadJson(STORAGE_KEY, []);
  if (!Array.isArray(existingRecords) || existingRecords.length === 0) {
    app.records = generateDemoData();
    saveRecords(app.records);
  } else {
    app.records = existingRecords.filter((item) => item && item.date && item.resourceType && item.value !== undefined);
  }
}

function renderAll() {
  renderDashboard();
  renderDataTable();
  renderAnalytics();
  renderGoals();
  renderBenchmark();
  renderDemoBanner();
  setActivePage(app.currentPage);
}

function setActivePage(pageName) {
  app.currentPage = pageName;
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === pageName);
  });

  document.querySelectorAll(".page-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `page-${pageName}`);
  });

  const pageTitleMap = {
    dashboard: "School Sustainability Dashboard",
    data: "Sustainability Data",
    "add-data": "Add Data",
    analytics: "Analytics",
    goals: "Goals and Recommendations",
    about: "About EcoTrack",
  };

  document.getElementById("pageTitle").textContent = pageTitleMap[pageName] || "EcoTrack";
}

function renderDashboard() {
  const filteredRecords = getFilteredRecords(app.period);
  const totalElectricity = calculateResourceTotal(filteredRecords, "Electricity");
  const totalWater = calculateResourceTotal(filteredRecords, "Water");
  const totalWaste = calculateResourceTotal(filteredRecords, "Waste generated");
  const totalDiverted = calculateResourceTotal(filteredRecords, "Waste diverted");
  const previousPeriodRecords = getPreviousPeriodRecords(app.period);
  const previousElectricity = calculateResourceTotal(previousPeriodRecords, "Electricity");
  const previousWater = calculateResourceTotal(previousPeriodRecords, "Water");
  const previousWaste = calculateResourceTotal(previousPeriodRecords, "Waste generated");

  document.getElementById("electricityValue").textContent = formatNumber(totalElectricity, 1) + " kWh";
  document.getElementById("waterValue").textContent = formatVolume(totalWater);
  document.getElementById("wasteValue").textContent = formatNumber(totalWaste, 1) + " kg";
  document.getElementById("divertedValue").textContent = formatPercentage(calculateWasteDiversionRate(filteredRecords));

  document.getElementById("electricityTrend").textContent = buildComparisonText("Electricity", totalElectricity, previousElectricity);
  document.getElementById("waterTrend").textContent = buildComparisonText("Water", totalWater, previousWater);
  document.getElementById("wasteTrend").textContent = buildComparisonText("Waste generated", totalWaste, previousWaste);
  document.getElementById("divertedTrend").textContent = totalDiverted > 0 ? "Waste diversion captured from current period data." : "Not enough diverted waste data yet.";

  const recent = [...app.records].sort(sortByDateDesc).slice(0, 5);
  const recentTableBody = document.getElementById("recentRecordsTableBody");
  if (!recent.length) {
    recentTableBody.innerHTML = `<tr><td colspan="6" class="empty-state">No records available yet. Add your first measurement.</td></tr>`;
  } else {
    recentTableBody.innerHTML = recent.map((record) => `
      <tr>
        <td>${formatDate(record.date)}</td>
        <td>${escapeHtml(record.resourceType)}</td>
        <td>${formatNumber(record.value, 2)}</td>
        <td>${escapeHtml(record.unit)}</td>
        <td>${escapeHtml(record.location || "—")}</td>
        <td>${escapeHtml(record.source || "—")}</td>
      </tr>
    `).join("");
  }

  const recordCount = app.records.length;
  const latestDate = app.records.length ? getLatestDate(app.records) : "—";
  const dataType = getDataTypeLabel();
  const reviewStatus = app.records.some((record) => record.needsReview) ? "Some records need review" : "No major review flags";

  document.getElementById("recordsCount").textContent = String(recordCount);
  document.getElementById("latestDateValue").textContent = latestDate === "—" ? "—" : formatDate(latestDate);
  document.getElementById("dataTypeValue").textContent = dataType;
  document.getElementById("reviewStatusValue").textContent = reviewStatus;

  const periodName = getPeriodLabel(app.period);
  document.getElementById("dashboardReportPeriod").textContent = `Reporting period: ${periodName}`;
  document.getElementById("dashboardDataStatus").textContent = dataType === "Demo data" ? "DEMO DATA — NOT ACTUAL SCHOOL MEASUREMENTS" : "This dataset may contain real school data.";
}

function renderDataTable() {
  const filter = document.getElementById("dataResourceFilter").value;
  const fromDate = document.getElementById("dataFromDate").value;
  const toDate = document.getElementById("dataToDate").value;
  const searchTerm = document.getElementById("dataSearchInput").value.trim().toLowerCase();

  const filtered = app.records.filter((record) => {
    const matchesResource = filter === "all" || record.resourceType === filter;
    const matchesFrom = !fromDate || new Date(record.date) >= new Date(fromDate);
    const matchesTo = !toDate || new Date(record.date) <= new Date(toDate);
    const matchesSearch = !searchTerm || `${record.location || ""} ${record.source || ""}`.toLowerCase().includes(searchTerm);
    return matchesResource && matchesFrom && matchesTo && matchesSearch;
  }).sort(sortByDateDesc);

  const rows = document.getElementById("recordsTableBody");
  if (!filtered.length) {
    rows.innerHTML = `<tr><td colspan="7" class="empty-state">No records match the current filters.</td></tr>`;
    document.getElementById("recordDetailPanel").innerHTML = "<p>No record selected.</p>";
    return;
  }

  rows.innerHTML = filtered.map((record) => `
    <tr>
      <td>${formatDate(record.date)}</td>
      <td>${escapeHtml(record.resourceType)}</td>
      <td>${formatNumber(record.value, 2)}</td>
      <td>${escapeHtml(record.unit)}</td>
      <td>${escapeHtml(record.location || "—")}</td>
      <td>${escapeHtml(record.source || "—")}</td>
      <td>
        <div class="table-actions">
          <button class="inline-button" type="button" data-action="view" data-id="${record.id}">View</button>
          <button class="inline-button" type="button" data-action="edit" data-id="${record.id}">Edit</button>
          <button class="inline-button danger" type="button" data-action="delete" data-id="${record.id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");

  rows.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      const recordId = button.dataset.id;
      const record = app.records.find((item) => item.id === recordId);
      if (!record) return;

      if (action === "view") {
        renderRecordDetail(record);
      }
      if (action === "edit") {
        populateEditForm(record);
        setActivePage("add-data");
      }
      if (action === "delete") {
        if (confirm("Delete this record? This change will update all related data immediately.")) {
          app.records = app.records.filter((item) => item.id !== recordId);
          saveRecords(app.records);
          renderAll();
          showToast("Record deleted.");
        }
      }
    });
  });
}

function renderRecordDetail(record) {
  const panel = document.getElementById("recordDetailPanel");
  panel.innerHTML = `
    <p><strong>Date:</strong> ${formatDate(record.date)}</p>
    <p><strong>Resource:</strong> ${escapeHtml(record.resourceType)}</p>
    <p><strong>Value:</strong> ${formatNumber(record.value, 2)} ${escapeHtml(record.unit)}</p>
    <p><strong>Location:</strong> ${escapeHtml(record.location || "Not provided")}</p>
    <p><strong>Source:</strong> ${escapeHtml(record.source || "Not provided")}</p>
    <p><strong>Notes:</strong> ${escapeHtml(record.notes || "No notes provided")}</p>
  `;
}

function renderAnalytics() {
  const filtered = getFilteredRecords(app.period);
  const electricitySeries = getSeriesData(filtered, "Electricity");
  const waterSeries = getSeriesData(filtered, "Water");
  const wasteGenerated = calculateResourceTotal(filtered, "Waste generated");
  const wasteDiverted = calculateResourceTotal(filtered, "Waste diverted");
  const landfill = Math.max(0, wasteGenerated - wasteDiverted);

  const summary = buildAnalyticsSummary(filtered);
  document.getElementById("analyticsSummary").innerHTML = summary;

  renderChart("chartElectricity", {
    type: "line",
    labels: electricitySeries.map((item) => item.label),
    datasets: [{
      label: "Electricity (kWh)",
      data: electricitySeries.map((item) => item.value),
      borderColor: "#2cd4a4",
      backgroundColor: "rgba(44, 212, 164, 0.16)",
      fill: true,
      tension: 0.3,
    }],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: false, title: { display: true, text: "kWh" } },
        x: { title: { display: true, text: "Date" } },
      },
      plugins: { legend: { display: true } },
    },
  });

  renderChart("chartWater", {
    type: "line",
    labels: waterSeries.map((item) => item.label),
    datasets: [{
      label: "Water (kL)",
      data: waterSeries.map((item) => item.value),
      borderColor: "#4db7ff",
      backgroundColor: "rgba(77, 183, 255, 0.14)",
      fill: true,
      tension: 0.3,
    }],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: false, title: { display: true, text: "kL" } },
        x: { title: { display: true, text: "Date" } },
      },
      plugins: { legend: { display: true } },
    },
  });

  renderChart("chartWasteBreakdown", {
    type: "bar",
    labels: ["Waste generated", "Waste diverted", "Waste to landfill"],
    datasets: [{
      label: "Waste in kg",
      data: [wasteGenerated || 0, wasteDiverted || 0, landfill || 0],
      backgroundColor: ["#f4b942", "#2cd4a4", "#ef6a6a"],
    }],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "kg" } },
        x: { title: { display: true, text: "Waste category" } },
      },
      plugins: { legend: { display: false } },
    },
  });

  const comparisonData = getComparisonData(filtered);
  renderChart("chartComparison", {
    type: "bar",
    labels: comparisonData.map((item) => item.label),
    datasets: [{
      label: "Measured value",
      data: comparisonData.map((item) => item.value),
      backgroundColor: ["#2cd4a4", "#4db7ff", "#f4b942", "#ef6a6a"],
    }],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: false },
        x: { title: { display: true, text: "Location" } },
      },
      plugins: { legend: { display: false } },
    },
  });

  const selectedResource = document.getElementById("analyticsResourceFilter").value;
  const selectedSummary = buildSelectedResourceSummary(selectedResource, filtered);
  if (selectedSummary) {
    const summaryBox = document.getElementById("analyticsSummary");
    summaryBox.innerHTML = `${summaryBox.innerHTML}<p>${selectedSummary}</p>`;
  }
}

function renderGoals() {
  const goalList = document.getElementById("goalList");

  if (!app.goals.length) {
    goalList.innerHTML = '<div class="empty-state">No goals saved yet. Add a simple target to track progress.</div>';
    return;
  }

  goalList.innerHTML = app.goals.map((goal) => {
    const progress = calculateGoalProgress(goal);
    const percent = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;
    return `
      <div class="goal-item">
        <h4>${escapeHtml(goal.name || "Untitled goal")}</h4>
        <div class="goal-meta">${escapeHtml(goal.resourceType)} • Target date: ${formatDate(goal.targetDate)}</div>
        <div>Baseline: ${escapeHtml(String(goal.baselineValue))} • Target: ${escapeHtml(String(goal.targetValue))}</div>
        <div class="progress-bar"><span style="width:${percent}%"></span></div>
        <div class="goal-meta">Progress: ${percent.toFixed(0)}%</div>
      </div>
    `;
  }).join("");
}

function renderBenchmark() {
  const benchmarkOutput = document.getElementById("benchmarkOutput");
  const studentCount = getStudentCount();
  const records = app.records;
  let output = "Benchmark comparison requires matching dates and compatible units. At present, the site can only provide a reference statement instead of a direct comparison.";

  if (!records.length) {
    output = "There are no records yet. Add a few measurements before comparing with the reference benchmark.";
  } else if (!studentCount || Number(studentCount) <= 0) {
    output = "Enter the approximate student enrolment to calculate a per-student benchmark reference.";
  } else {
    const electricityTotal = calculateResourceTotal(records, "Electricity");
    const waterTotal = calculateResourceTotal(records, "Water");
    const wasteGenerated = calculateResourceTotal(records, "Waste generated");
    const days = getDateRangeDays(records);
    const annualisedElectricity = days > 0 ? (electricityTotal / days) * 365 : 0;
    const annualisedWater = days > 0 ? (waterTotal / days) * 365 : 0;
    const annualisedWaste = days > 0 ? (wasteGenerated / days) * 365 : 0;

    output = `Using ${studentCount} students and ${days || 0} days of data, the reference figures are approximately: ${formatNumber(annualisedElectricity / studentCount, 1)} kWh per student per year for electricity, ${formatNumber((annualisedWater / 1000) / studentCount, 2)} kL per student per year for water, and ${formatNumber((annualisedWaste / 1000) / studentCount, 2)} kg of waste generated per student per year. These are rough annualised indicators only. The benchmark should be interpreted carefully because the data must match the same period and unit definitions.`;
  }

  benchmarkOutput.innerHTML = `<p>${escapeHtml(output)}</p>`;
  renderRecommendations();
}

function renderRecommendations() {
  const recommendationList = document.getElementById("recommendationList");
  const recommendations = generateRecommendations();
  recommendationList.innerHTML = recommendations.map((item) => `
    <div class="recommendation-item">
      <h4>${escapeHtml(item.title)}</h4>
      <p>${escapeHtml(item.message)}</p>
    </div>
  `).join("");
}

function renderDemoBanner() {
  const banner = document.getElementById("demoNotice");
  const hasDemo = app.records.some((record) => record.sourceType === DEMO_SOURCE);
  banner.classList.toggle("visible", hasDemo);
}

function getFormValues() {
  const rawValue = document.getElementById("measurementValue").value;
  return {
    id: document.getElementById("recordId").value || null,
    date: document.getElementById("measurementDate").value,
    resourceType: document.getElementById("resourceType").value,
    value: rawValue === "" ? Number.NaN : Number(rawValue),
    unit: document.getElementById("measurementUnit").value,
    location: document.getElementById("locationField").value.trim(),
    source: document.getElementById("dataSource").value.trim(),
    notes: document.getElementById("measurementNotes").value.trim(),
  };
}

function getGoalFormValues() {
  const rawBaseline = document.getElementById("goalBaseline").value;
  const rawTarget = document.getElementById("goalTarget").value;
  return {
    id: null,
    name: document.getElementById("goalName").value.trim(),
    resourceType: document.getElementById("goalResource").value,
    baselineValue: rawBaseline === "" ? Number.NaN : Number(rawBaseline),
    targetValue: rawTarget === "" ? Number.NaN : Number(rawTarget),
    targetDate: document.getElementById("goalDate").value,
    studentCount: Number(document.getElementById("studentCount").value) || 0,
  };
}

function validateRecord(record, options = {}) {
  const errors = {};

  if (!record.date) {
    errors.date = "Measurement date is required.";
  } else if (!isValidDate(record.date)) {
    errors.date = "Please enter a valid measurement date.";
  } else if (isDateTooFarInFuture(record.date)) {
    errors.date = "The date is too far in the future for this prototype.";
  }

  if (!record.resourceType) {
    errors.resourceType = "Resource type is required.";
  }

  if (!Number.isFinite(record.value)) {
    errors.value = "Please enter a valid numerical value.";
  } else if (record.value < 0) {
    errors.value = "Values must be zero or greater.";
  } else if (record.value > 1000000) {
    errors.value = "The value exceeds a basic data-quality check for this school prototype.";
  }

  if (!record.unit) {
    errors.unit = "Unit is required.";
  } else if (record.resourceType && !RESOURCE_OPTIONS[record.resourceType].includes(record.unit)) {
    errors.unit = `This resource type expects one of: ${RESOURCE_OPTIONS[record.resourceType].join(", ")}.`;
  }

  if (!record.source || !record.source.trim()) {
    errors.source = "Data source is required.";
  }

  const valid = Object.keys(errors).length === 0;
  return {
    valid,
    errors,
  };
}

function validateGoal(goal) {
  const errors = [];

  if (!goal.name) errors.push("Goal name is required.");
  if (!goal.targetDate) errors.push("Target date is required.");
  if (!Number.isFinite(goal.baselineValue) || goal.baselineValue < 0) errors.push("Baseline value must be a valid number.");
  if (!Number.isFinite(goal.targetValue) || goal.targetValue < 0) errors.push("Target value must be a valid number.");
  if (goal.resourceType === "Waste diverted" && goal.targetValue > 100) {
    errors.push("Waste diversion targets should be entered as a proportion or value in kg, not an unrealistic value.");
  }

  if (goal.baselineValue === goal.targetValue) {
    errors.push("The target matches the baseline. Progress would be misleading for this goal.");
  }

  if (goal.targetValue < 0 || goal.baselineValue < 0) {
    errors.push("Goal values cannot be negative.");
  }

  return errors;
}

function findDuplicateRecord(record) {
  return app.records.some((existing) => {
    const sameResource = existing.resourceType === record.resourceType;
    const sameDate = existing.date === record.date;
    const sameLocation = (existing.location || "") === (record.location || "");
    const sameValue = Number(existing.value) === Number(record.value);
    const sameSource = (existing.source || "") === (record.source || "");
    return sameResource && sameDate && sameLocation && sameValue && sameSource;
  });
}

function clearFormMessages() {
  document.querySelectorAll(".field-error").forEach((node) => {
    node.textContent = "";
  });
}

function showFieldErrors(errors) {
  const fieldMap = {
    date: "measurementDateError",
    resourceType: "resourceTypeError",
    value: "measurementValueError",
    unit: "measurementUnitError",
    source: "dataSourceError",
    location: "locationFieldError",
  };

  Object.entries(errors).forEach(([key, message]) => {
    const targetId = fieldMap[key] || `${key}Error`;
    const element = document.getElementById(targetId);
    if (element) {
      element.textContent = message;
    }
  });
}

function setFormStatus(message, type = "success") {
  const box = document.getElementById("formStatus");
  if (!box) return;
  box.textContent = message;
  box.className = `form-status ${type}`;
}

function resetForm() {
  document.getElementById("addDataForm").reset();
  document.getElementById("recordId").value = "";
  updateUnitOptions();
  clearFormMessages();
  setFormStatus("", "success");
}

function populateEditForm(record) {
  document.getElementById("recordId").value = record.id;
  document.getElementById("measurementDate").value = record.date;
  document.getElementById("resourceType").value = record.resourceType;
  document.getElementById("measurementValue").value = record.value;
  updateUnitOptions();
  document.getElementById("measurementUnit").value = record.unit;
  document.getElementById("locationField").value = record.location || "";
  document.getElementById("dataSource").value = record.source || "";
  document.getElementById("measurementNotes").value = record.notes || "";
  setFormStatus("Editing record. Save changes when ready.", "success");
}

function updateUnitOptions() {
  const unitSelect = document.getElementById("measurementUnit");
  const resourceType = document.getElementById("resourceType").value;
  const optionList = RESOURCE_OPTIONS[resourceType] || [];

  unitSelect.innerHTML = "";
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "Select unit";
  unitSelect.appendChild(defaultOption);

  optionList.forEach((unit) => {
    const option = document.createElement("option");
    option.value = unit;
    option.textContent = unit;
    unitSelect.appendChild(option);
  });

  if (optionList.length) {
    const preferredUnit = resourceType === "Water" && optionList.includes("kL") ? "kL" : optionList[0];
    unitSelect.value = preferredUnit;
  }
}

function saveRecords(records) {
  const safeRecords = Array.isArray(records) ? records : [];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeRecords));
  } catch (error) {
    console.error("Could not save records to localStorage.", error);
    showToast("Unable to save data in this browser.");
  }
}

function saveGoals() {
  try {
    localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify(app.goals));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      period: app.period,
      studentCount: getStudentCount(),
    }));
  } catch (error) {
    console.error("Could not save goals to localStorage.", error);
  }
}

function safeReadJson(key, fallback) {
  try {
    const savedValue = localStorage.getItem(key);
    if (!savedValue) return fallback;
    return JSON.parse(savedValue);
  } catch (error) {
    console.error("Unable to read saved data.", error);
    return fallback;
  }
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => {
    toast.classList.remove("visible");
  }, 2500);
}

function generateId() {
  return `ecotrack-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function generateDemoData() {
  const records = [
    { id: generateId(), date: "2026-09-05", resourceType: "Electricity", value: 630, unit: "kWh", location: "Main administration", source: "Utility report", notes: "Term 3 usage baseline", sourceType: DEMO_SOURCE },
    { id: generateId(), date: "2026-09-10", resourceType: "Water", value: 1480, unit: "L", location: "Science block", source: "Meter reading", notes: "Water use review", sourceType: DEMO_SOURCE },
    { id: generateId(), date: "2026-09-14", resourceType: "Waste generated", value: 215, unit: "kg", location: "Canteen", source: "Waste audit", notes: "General waste", sourceType: DEMO_SOURCE },
    { id: generateId(), date: "2026-09-18", resourceType: "Waste diverted", value: 150, unit: "kg", location: "Canteen", source: "Waste audit", notes: "Recycling and composting", sourceType: DEMO_SOURCE },
    { id: generateId(), date: "2026-09-22", resourceType: "Electricity", value: 680, unit: "kWh", location: "Library", source: "Utility report", notes: "High use after school", sourceType: DEMO_SOURCE },
    { id: generateId(), date: "2026-10-01", resourceType: "Water", value: 1860, unit: "L", location: "Sports centre", source: "Meter reading", notes: "Pool showers", sourceType: DEMO_SOURCE },
    { id: generateId(), date: "2026-10-04", resourceType: "Waste generated", value: 230, unit: "kg", location: "General buildings", source: "Waste audit", notes: "Lunch time collections", sourceType: DEMO_SOURCE },
    { id: generateId(), date: "2026-10-08", resourceType: "Waste diverted", value: 175, unit: "kg", location: "General buildings", source: "Waste audit", notes: "Compost and recycling mix", sourceType: DEMO_SOURCE },
    { id: generateId(), date: "2026-10-11", resourceType: "Electricity", value: 720, unit: "kWh", location: "Main building", source: "Utility report", notes: "Computer lab use", sourceType: DEMO_SOURCE },
    { id: generateId(), date: "2026-10-18", resourceType: "Water", value: 2000, unit: "L", location: "Main building", source: "Meter reading", notes: "Higher usage after events", sourceType: DEMO_SOURCE },
    { id: generateId(), date: "2026-10-21", resourceType: "Electricity", value: 710, unit: "kWh", location: "Science block", source: "Utility report", notes: "Equipment use", sourceType: DEMO_SOURCE },
  ];

  return records;
}

function formatNumber(value, digits = 0) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) {
    return "0";
  }
  return number.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function formatVolume(value) {
  const numericValue = Number(value || 0);
  const kilolitres = numericValue / 1000;
  if (numericValue >= 1000) {
    return `${formatNumber(kilolitres, 2)} kL`;
  }
  return `${formatNumber(numericValue, 0)} L`;
}

function formatPercentage(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return "0%";
  }
  return `${numeric.toFixed(0)}%`;
}

function formatDate(dateString) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isValidDate(dateString) {
  const date = new Date(dateString);
  return typeof dateString === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateString) && !Number.isNaN(date.getTime());
}

function isDateTooFarInFuture(dateString) {
  const date = new Date(dateString);
  const today = new Date();
  const differenceMs = date.getTime() - today.getTime();
  return differenceMs > MAX_FUTURE_DAYS * 24 * 60 * 60 * 1000;
}

function getFilteredRecords(period) {
  const records = [...app.records];
  if (period === "all") return records;
  const days = Number(period) || 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return records.filter((record) => {
    const recordDate = new Date(record.date);
    return recordDate >= cutoff && !Number.isNaN(recordDate.getTime());
  });
}

function getPreviousPeriodRecords(period) {
  if (period === "all") return [];
  const days = Number(period) || 30;
  const endBoundary = new Date();
  if (period === "7") {
    endBoundary.setDate(endBoundary.getDate() - 7);
  }
  const startBoundary = new Date();
  startBoundary.setDate(startBoundary.getDate() - (days * 2));
  const previousCutoff = new Date();
  previousCutoff.setDate(previousCutoff.getDate() - days);
  return app.records.filter((record) => {
    const recordDate = new Date(record.date);
    return recordDate >= startBoundary && recordDate < previousCutoff && !Number.isNaN(recordDate.getTime());
  });
}

function getPeriodLabel(period) {
  switch (period) {
    case "7": return "Last 7 days";
    case "30": return "Last 30 days";
    case "90": return "Last 90 days";
    default: return "All available data";
  }
}

function calculateResourceTotal(records, resourceType) {
  return records
    .filter((record) => record.resourceType === resourceType)
    .reduce((total, record) => {
      const numericValue = Number(record.value || 0);
      if (resourceType === "Water") {
        return total + (record.unit === "kL" ? numericValue * 1000 : numericValue);
      }
      return total + numericValue;
    }, 0);
}

function calculateWasteDiversionRate(records) {
  const wasteGenerated = calculateResourceTotal(records, "Waste generated");
  const wasteDiverted = calculateResourceTotal(records, "Waste diverted");
  if (!wasteGenerated) return 0;
  return (wasteDiverted / wasteGenerated) * 100;
}

function buildComparisonText(label, currentValue, previousValue) {
  if (!previousValue && previousValue !== 0) {
    return "Not enough data to compare yet";
  }
  const difference = currentValue - previousValue;
  if (Math.abs(difference) < 0.01) {
    return "No meaningful change from the previous period";
  }
  if (difference > 0) {
    return `${label} increased by ${formatNumber(Math.abs(difference), 1)} compared with the previous period.`;
  }
  return `${label} decreased by ${formatNumber(Math.abs(difference), 1)} compared with the previous period.`;
}

function getSeriesData(records, resourceType) {
  return [...records]
    .filter((record) => record.resourceType === resourceType)
    .sort(sortByDateAsc)
    .map((record) => ({
      label: formatDate(record.date),
      value: resourceType === "Water"
        ? (record.unit === "kL" ? Number(record.value) : Number(record.value) / 1000)
        : Number(record.value),
    }));
}

function getComparisonData(records) {
  const resources = ["Electricity", "Water", "Waste generated", "Waste diverted"];
  const values = resources.map((resource) => {
    const total = calculateResourceTotal(records, resource);
    return {
      label: resource,
      value: total,
    };
  });
  return values.filter((item) => item.value > 0);
}

function buildAnalyticsSummary(records) {
  if (!records.length) {
    return '<p>There are no records in the selected period. Add data to generate charts and analysis.</p>';
  }

  const electricity = calculateResourceTotal(records, "Electricity");
  const water = calculateResourceTotal(records, "Water");
  const waste = calculateResourceTotal(records, "Waste generated");
  const diversion = calculateWasteDiversionRate(records);

  return `
    <p><strong>Selected period:</strong> ${getPeriodLabel(app.period)}.</p>
    <p>Electricity usage is ${formatNumber(electricity, 1)} kWh, water consumption is ${formatVolume(water)}, and waste generated totals ${formatNumber(waste, 1)} kg. The measured diversion rate is ${formatPercentage(diversion)}.</p>
  `;
}

function buildSelectedResourceSummary(resourceType, records) {
  if (!records.length) return "No data available for the selected resource.";
  const total = calculateResourceTotal(records, resourceType);
  if (!total) return `${resourceType} has no valid values in the selected period.`;

  if (resourceType === "Waste diverted") {
    return `Waste diverted totals ${formatNumber(total, 1)} kg in the selected period.`;
  }

  if (resourceType === "Electricity") {
    return `Electricity use in the selected period is ${formatNumber(total, 1)} kWh.`;
  }

  if (resourceType === "Water") {
    return `Water usage in the selected period is ${formatVolume(total)}.`;
  }

  return `Waste generated in the selected period is ${formatNumber(total, 1)} kg.`;
}

function calculateGoalProgress(goal) {
  if (!goal || !Number.isFinite(goal.baselineValue) || !Number.isFinite(goal.targetValue)) {
    return 0;
  }

  if (goal.resourceType === "Waste diverted") {
    if (goal.targetValue <= goal.baselineValue) return 0;
    const currentValue = calculateResourceTotal(app.records, "Waste diverted");
    return ((currentValue - goal.baselineValue) / (goal.targetValue - goal.baselineValue)) * 100;
  }

  const currentValue = calculateResourceTotal(app.records, goal.resourceType);
  const baseline = Number(goal.baselineValue);
  const target = Number(goal.targetValue);
  if (goal.resourceType === "Electricity" || goal.resourceType === "Water") {
    if (target >= baseline) return 0;
    return ((baseline - currentValue) / (baseline - target)) * 100;
  }

  return 0;
}

function generateRecommendations() {
  const recommendations = [];
  const filteredPeriod = getFilteredRecords(app.period);
  const electricityChange = getTrendDifference(filteredPeriod, "Electricity");
  const waterChange = getTrendDifference(filteredPeriod, "Water");

  if (electricityChange > 0) {
    recommendations.push({
      title: "Review electricity use",
      message: "Electricity use increased between comparable periods. Investigate lighting schedules, classroom technology use, and heating and cooling settings before making changes.",
    });
  }

  if (waterChange > 0) {
    recommendations.push({
      title: "Check water efficiency",
      message: "Water usage is higher than the earlier comparable period. Check for leaks, irrigation schedules or unusually high use in sports and garden areas.",
    });
  }

  if (!calculateResourceTotal(filteredPeriod, "Waste diverted")) {
    recommendations.push({
      title: "Conduct a waste audit",
      message: "Recycling and diversion data is incomplete. A waste audit would help identify which materials can be diverted from landfill.",
    });
  }

  if (!filteredPeriod.length) {
    recommendations.push({
      title: "Collect more measurements",
      message: "There are not enough records available in the selected period to draw a reliable conclusion. Add more school data before assessing change.",
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      title: "Maintain current monitoring",
      message: "The current dataset does not show a major increase, so the key next step is to keep collecting consistent readings and compare trends over time.",
    });
  }

  return recommendations.slice(0, 4);
}

function getTrendDifference(records, resourceType) {
  const current = calculateResourceTotal(records, resourceType);
  const previous = calculateResourceTotal(getPreviousPeriodRecords(app.period), resourceType);
  if (!previous && previous !== 0) return 0;
  return current - previous;
}

function getDataTypeLabel() {
  if (!app.records.length) return "No data";
  const demoCount = app.records.filter((record) => record.sourceType === DEMO_SOURCE).length;
  const realCount = app.records.filter((record) => record.sourceType !== DEMO_SOURCE).length;
  if (demoCount && !realCount) return "Demo data";
  if (realCount && !demoCount) return "Real school data";
  if (demoCount && realCount) return "Mixed data";
  return "Unspecified";
}

function getLatestDate(records) {
  if (!records.length) return null;
  return [...records].sort(sortByDateDesc)[0].date;
}

function sortByDateAsc(a, b) {
  return new Date(a.date) - new Date(b.date);
}

function sortByDateDesc(a, b) {
  return new Date(b.date) - new Date(a.date);
}

function getDateRangeDays(records) {
  if (!records.length) return 0;
  const dates = records.map((record) => new Date(record.date)).filter((date) => !Number.isNaN(date.getTime()));
  if (!dates.length) return 0;
  const sorted = dates.sort((a, b) => a - b);
  const diffMs = sorted[sorted.length - 1] - sorted[0];
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

function getStudentCount() {
  const value = document.getElementById("studentCount")?.value;
  return Number(value) || 900;
}

function parseAndValidateCsv(csvText) {
  const rows = parseCsvRows(csvText);
  if (!rows.length) return { validRows: [], invalidRows: [] };

  const expectedHeaders = ["date", "resourcetype", "value", "unit", "location", "source", "notes"];
  const [headerRow, ...dataRows] = rows;
  const normalizedHeaders = headerRow.map((header) => header.trim().toLowerCase());
  const missingHeaders = expectedHeaders.filter((header) => !normalizedHeaders.includes(header));
  if (missingHeaders.length) {
    return {
      validRows: [],
      invalidRows: [{ reason: `Missing required CSV headers: ${missingHeaders.join(", ")}` }],
    };
  }

  const validRows = [];
  const invalidRows = [];

  dataRows.forEach((row, index) => {
    const rowObject = {};
    normalizedHeaders.forEach((header, columnIndex) => {
      rowObject[header] = row[columnIndex] || "";
    });

    const testRecord = {
      date: rowObject.date?.trim(),
      resourceType: rowObject.resourcetype?.trim(),
      value: Number(rowObject.value),
      unit: rowObject.unit?.trim(),
      location: rowObject.location?.trim(),
      source: rowObject.source?.trim(),
      notes: rowObject.notes?.trim(),
    };

    const validation = validateRecord(testRecord);
    if (!validation.valid) {
      invalidRows.push({ rowNumber: index + 2, reason: Object.values(validation.errors).join(" | ") });
      return;
    }

    validRows.push({
      id: generateId(),
      date: testRecord.date,
      resourceType: testRecord.resourceType,
      value: Number(testRecord.value),
      unit: testRecord.unit,
      location: testRecord.location || "",
      source: testRecord.source,
      notes: testRecord.notes || "",
      sourceType: USER_SOURCE,
    });
  });

  return { validRows, invalidRows };
}

function parseCsvRows(csvText) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(current);
      if (row.some((field) => field.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  if (current || row.length) {
    row.push(current);
    if (row.some((field) => field.trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

function exportRecordsAsCSV() {
  const rows = [
    ["date", "resourceType", "value", "unit", "location", "source", "notes"],
    ...app.records.map((record) => [
      record.date,
      record.resourceType,
      record.value,
      record.unit,
      record.location || "",
      record.source || "",
      record.notes || "",
    ]),
  ];

  const csvText = rows.map((line) => line.map((item) => `"${String(item).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ecotrack-sustainability-data.csv";
  link.click();
  URL.revokeObjectURL(url);
  showToast("CSV export started.");
}

function downloadCSVTemplate() {
  const templateText = "date,resourceType,value,unit,location,source,notes\n2026-10-01,Electricity,320,kWh,Main building,School utility report,After-hours use\n";
  const blob = new Blob([templateText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ecotrack-sample-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function isMobileResize() {
  return window.innerWidth <= 980;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {});
}

window.addEventListener("resize", () => {
  if (typeof window.Chart !== "undefined") {
    Object.keys(app.chartInstances).forEach((key) => {
      if (app.chartInstances[key]) {
        app.chartInstances[key].resize();
      }
    });
  }
});

function renderChart(canvasId, config) {
  if (typeof window.Chart === "undefined") {
    console.warn("Chart.js is unavailable, so analytics charts are disabled.");
    return;
  }

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (app.chartInstances[canvasId]) {
    app.chartInstances[canvasId].destroy();
  }

  app.chartInstances[canvasId] = new Chart(canvas, {
    type: config.type,
    data: {
      labels: config.labels,
      datasets: config.datasets,
    },
    options: config.options || {},
  });
}

if (typeof window !== "undefined") {
  window.ecotrack = { generateDemoData, parseAndValidateCsv, exportRecordsAsCSV };
}
