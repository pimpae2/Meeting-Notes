const STORAGE_KEYS = {
  mode: "meetingNotes.mode",
  notes: "meetingNotes.notes",
  draft: "meetingNotes.draft",
  sheetUrl: "meetingNotes.sheetUrl",
  sheetColumns: "meetingNotes.sheetColumns"
};

const MAX_NOTES = 100;
const OAUTH_PLACEHOLDER = "REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID";
const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/1luIsRBcM14cXsuj1xtHc33eZ44oar6Iv6JshyjZtC2s/edit?gid=1425714802#gid=1425714802";
const DEFAULT_SHEET_COLUMNS = {
  title: "B",
  details: "C",
  link: "F"
};
const SEQUENCE_COLUMN = "A";
const SYSTEM_COLUMN = "E";
const RESERVED_COLUMNS = [SEQUENCE_COLUMN, SYSTEM_COLUMN];

const els = {
  clearButton: document.querySelector("#clearButton"),
  detailsInput: document.querySelector("#detailsInput"),
  emptyState: document.querySelector("#emptyState"),
  exportButton: document.querySelector("#exportButton"),
  form: document.querySelector("#noteForm"),
  linkInput: document.querySelector("#linkInput"),
  localModeButton: document.querySelector("#localModeButton"),
  notesList: document.querySelector("#notesList"),
  refreshLinkButton: document.querySelector("#refreshLinkButton"),
  columnSettings: document.querySelector("#columnSettings"),
  resetColumnsButton: document.querySelector("#resetColumnsButton"),
  saveButton: document.querySelector("#saveButton"),
  saveButtonLabel: document.querySelector("#saveButtonLabel"),
  sheetModeButton: document.querySelector("#sheetModeButton"),
  sheetUrl: document.querySelector("#sheetUrl"),
  statusMessage: document.querySelector("#statusMessage"),
  toggleColumnsButton: document.querySelector("#toggleColumnsButton"),
  titleColumn: document.querySelector("#titleColumn"),
  detailsColumn: document.querySelector("#detailsColumn"),
  linkColumn: document.querySelector("#linkColumn"),
  titleInput: document.querySelector("#titleInput")
};

let state = {
  mode: "local",
  notes: [],
  statusTimer: 0
};

init();

async function init() {
  bindEvents();

  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.mode,
    STORAGE_KEYS.notes,
    STORAGE_KEYS.draft,
    STORAGE_KEYS.sheetUrl,
    STORAGE_KEYS.sheetColumns
  ]);

  state.mode = stored[STORAGE_KEYS.mode] || "local";
  state.notes = Array.isArray(stored[STORAGE_KEYS.notes]) ? stored[STORAGE_KEYS.notes] : [];

  const draft = stored[STORAGE_KEYS.draft] || {};
  els.titleInput.value = draft.title || "";
  els.detailsInput.value = draft.details || "";
  els.linkInput.value = draft.link || "";
  els.sheetUrl.value = stored[STORAGE_KEYS.sheetUrl] || DEFAULT_SHEET_URL;
  applySheetColumns(normalizeSheetColumns(stored[STORAGE_KEYS.sheetColumns]));

  setMode(state.mode);
  renderNotes();
  await fillCurrentTabLink({ onlyIfEmpty: true });
}

function bindEvents() {
  els.localModeButton.addEventListener("click", () => setMode("local"));
  els.sheetModeButton.addEventListener("click", () => setMode("sheet"));
  els.refreshLinkButton.addEventListener("click", () => fillCurrentTabLink({ onlyIfEmpty: false }));
  els.clearButton.addEventListener("click", clearForm);
  els.exportButton.addEventListener("click", exportCsv);
  els.form.addEventListener("submit", handleSubmit);

  for (const input of [els.titleInput, els.detailsInput, els.linkInput]) {
    input.addEventListener("input", saveDraft);
  }

  els.sheetUrl.addEventListener("input", () => {
    chrome.storage.local.set({ [STORAGE_KEYS.sheetUrl]: els.sheetUrl.value.trim() });
  });

  els.toggleColumnsButton.addEventListener("click", () => {
    setColumnSettingsOpen(els.columnSettings.hidden);
  });

  for (const input of [els.titleColumn, els.detailsColumn, els.linkColumn]) {
    input.addEventListener("input", () => {
      input.value = normalizeColumnName(input.value);
      saveSheetColumns();
    });
  }

  els.resetColumnsButton.addEventListener("click", () => {
    applySheetColumns(DEFAULT_SHEET_COLUMNS);
    saveSheetColumns();
    setStatus("รีเซ็ตคอลัมน์เป็น B/C/F แล้ว", "success");
  });
}

async function setMode(mode) {
  state.mode = mode;
  const isSheet = mode === "sheet";

  document.body.classList.toggle("is-sheet-mode", isSheet);
  els.localModeButton.classList.toggle("is-active", !isSheet);
  els.sheetModeButton.classList.toggle("is-active", isSheet);
  els.localModeButton.setAttribute("aria-selected", String(!isSheet));
  els.sheetModeButton.setAttribute("aria-selected", String(isSheet));
  els.saveButtonLabel.textContent = isSheet ? "บันทึกเข้า Sheet" : "บันทึกโน้ต";

  if (!isSheet) {
    setColumnSettingsOpen(false);
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.mode]: mode });
}

function setColumnSettingsOpen(isOpen) {
  els.columnSettings.hidden = !isOpen;
  els.toggleColumnsButton.classList.toggle("is-active", isOpen);
  els.toggleColumnsButton.setAttribute("aria-expanded", String(isOpen));
}

async function fillCurrentTabLink({ onlyIfEmpty }) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      return;
    }

    const url = tab.url || "";

    if (!onlyIfEmpty || !els.linkInput.value.trim()) {
      els.linkInput.value = isSupportedPageUrl(url) ? url : "";
      await saveDraft();
    }
  } catch (error) {
    setStatus("ดึงลิงก์แท็บนี้ไม่ได้", "error");
  }
}

function isSupportedPageUrl(url) {
  return /^https?:\/\//i.test(url);
}

async function handleSubmit(event) {
  event.preventDefault();

  const note = createNoteFromForm();
  if (!note.title || !note.details) {
    setStatus("กรอกหัวข้อและรายละเอียดก่อนบันทึก", "error");
    return;
  }

  els.saveButton.disabled = true;

  try {
    if (state.mode === "sheet") {
      const sheetColumns = getSheetColumns();
      await appendNoteToSheet(note, els.sheetUrl.value.trim(), sheetColumns);
      note.destination = "sheet";
      note.sheetUrl = els.sheetUrl.value.trim();
      note.sheetColumns = sheetColumns;
      note.systemCode = detectSystemCodeFromUrl(note.link);
      setStatus("บันทึกเข้า Google Sheet แล้ว", "success");
    } else {
      note.destination = "local";
      setStatus("บันทึกโน้ตแล้ว", "success");
    }

    await addNote(note);
    clearForm({ keepLink: false, keepSheet: true });
  } catch (error) {
    setStatus(error.message || "บันทึกไม่สำเร็จ", "error", { sticky: true });
  } finally {
    els.saveButton.disabled = false;
  }
}

function createNoteFromForm() {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    title: els.titleInput.value.trim(),
    details: els.detailsInput.value.trim(),
    link: els.linkInput.value.trim(),
    destination: state.mode === "sheet" ? "sheet" : "local"
  };
}

function getSheetColumns() {
  const columns = {
    title: normalizeColumnName(els.titleColumn.value),
    details: normalizeColumnName(els.detailsColumn.value),
    link: normalizeColumnName(els.linkColumn.value)
  };

  if (!columns.title || !columns.details || !columns.link) {
    throw new Error("กรอกคอลัมน์ของหัวข้อ รายละเอียด และลิงก์ให้ครบ");
  }

  validateUniqueColumns(columns);
  validateReservedColumns(columns);
  return columns;
}

function applySheetColumns(columns) {
  const normalized = normalizeSheetColumns(columns);
  els.titleColumn.value = normalized.title;
  els.detailsColumn.value = normalized.details;
  els.linkColumn.value = normalized.link;
}

function normalizeSheetColumns(columns) {
  const source = columns && typeof columns === "object" ? columns : {};
  return {
    title: normalizeAssignableColumn(source.title, DEFAULT_SHEET_COLUMNS.title),
    details: normalizeAssignableColumn(source.details, DEFAULT_SHEET_COLUMNS.details),
    link: normalizeAssignableColumn(source.link, DEFAULT_SHEET_COLUMNS.link)
  };
}

function normalizeColumnName(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2);
}

function normalizeAssignableColumn(value, fallback) {
  const column = normalizeColumnName(value);
  if (!column || RESERVED_COLUMNS.includes(column)) {
    return fallback;
  }

  return column;
}

function validateUniqueColumns(columns) {
  const seen = {};
  for (const key of Object.keys(columns)) {
    const column = columns[key];
    if (seen[column]) {
      throw new Error(`คอลัมน์ ${column} ถูกใช้ซ้ำ เลือกคอลัมน์คนละช่องก่อนบันทึก`);
    }
    seen[column] = true;
  }
}

function validateReservedColumns(columns) {
  for (const column of Object.values(columns)) {
    if (RESERVED_COLUMNS.includes(column)) {
      throw new Error("คอลัมน์ A และ E เป็นคอลัมน์อัตโนมัติ เลือกคอลัมน์อื่นก่อนบันทึก");
    }
  }
}

async function saveSheetColumns() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.sheetColumns]: {
      title: normalizeColumnName(els.titleColumn.value),
      details: normalizeColumnName(els.detailsColumn.value),
      link: normalizeColumnName(els.linkColumn.value)
    }
  });
}

function buildSheetRow(note, columns, sequenceNumber) {
  const entries = [
    { column: SEQUENCE_COLUMN, value: sequenceNumber },
    { column: columns.title, value: note.title },
    { column: columns.details, value: note.details },
    { column: SYSTEM_COLUMN, value: detectSystemCodeFromUrl(note.link) },
    { column: columns.link, value: note.link }
  ];
  const cellsByIndex = {};
  let maxIndex = 0;

  for (const entry of entries) {
    const index = columnNameToIndex(entry.column);
    cellsByIndex[index] = toSheetCell(entry.value);
    maxIndex = Math.max(maxIndex, index);
  }

  const row = Array.from({ length: maxIndex + 1 }, () => ({}));
  for (const index of Object.keys(cellsByIndex)) {
    row[Number(index)] = cellsByIndex[index];
  }

  return row;
}

function detectSystemCodeFromUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    return "";
  }

  if (url.hostname !== "10.21.31.9") {
    return "";
  }

  switch (url.port) {
    case "8095":
      return "DMS";
    case "8096":
    case "8098":
      return "SLF";
    case "8097":
      return "LCS";
    default:
      return "";
  }
}

function columnNameToIndex(columnName) {
  if (!/^[A-Z]{1,2}$/.test(columnName)) {
    throw new Error("กรอกคอลัมน์เป็นตัวอักษร เช่น B, C, E หรือ AA");
  }

  let index = 0;
  for (const letter of columnName) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }

  return index - 1;
}

async function appendNoteToSheet(note, sheetUrl, sheetColumns) {
  const target = extractSheetTarget(sheetUrl);
  if (!target.spreadsheetId) {
    throw new Error("แปะลิงก์ Google Sheet ให้ถูกต้องก่อนบันทึก");
  }

  const token = await getGoogleAuthToken();
  const sheet = await getSheetProperties(target, token);
  const sequenceNumber = await getNextSequenceNumber(target.spreadsheetId, sheet.title, token);
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${target.spreadsheetId}:batchUpdate`;
  const body = {
    requests: [
      {
        appendCells: {
          sheetId: sheet.sheetId,
          rows: [
            {
              values: buildSheetRow(note, sheetColumns, sequenceNumber)
            }
          ],
          fields: "userEnteredValue"
        }
      }
    ]
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  await ensureGoogleResponse(response, token, "ส่งข้อมูลเข้า Google Sheet ไม่สำเร็จ");

  await chrome.storage.local.set({ [STORAGE_KEYS.sheetUrl]: sheetUrl });
}

function extractSheetTarget(value) {
  const input = value.trim();
  const fromUrl = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const rawId = input.match(/^([a-zA-Z0-9-_]{20,})$/);
  const gid = input.match(/[?#&]gid=(\d+)/);

  return {
    spreadsheetId: fromUrl ? fromUrl[1] : rawId ? rawId[1] : "",
    sheetId: gid ? Number(gid[1]) : null
  };
}

async function getSheetProperties(target, token) {
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${target.spreadsheetId}?fields=sheets.properties(sheetId,index,title)`;
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  await ensureGoogleResponse(response, token, "อ่านข้อมูลแท็บใน Google Sheet ไม่สำเร็จ");

  const payload = await response.json();
  const sheets = Array.isArray(payload.sheets) ? payload.sheets : [];
  let selectedSheet = null;

  if (target.sheetId !== null) {
    selectedSheet = sheets.find((sheet) => sheet.properties && sheet.properties.sheetId === target.sheetId);
  }

  if (!selectedSheet) {
    sheets.sort((a, b) => {
      const aIndex = a.properties && typeof a.properties.index === "number" ? a.properties.index : 0;
      const bIndex = b.properties && typeof b.properties.index === "number" ? b.properties.index : 0;
      return aIndex - bIndex;
    });
    selectedSheet = sheets[0] || null;
  }

  if (!selectedSheet || !selectedSheet.properties || typeof selectedSheet.properties.sheetId !== "number") {
    throw new Error("หาแท็บใน Google Sheet ไม่เจอ");
  }

  return {
    sheetId: selectedSheet.properties.sheetId,
    title: selectedSheet.properties.title || "Sheet1"
  };
}

async function getNextSequenceNumber(spreadsheetId, sheetTitle, token) {
  const range = encodeURIComponent(`${quoteSheetName(sheetTitle)}!${SEQUENCE_COLUMN}:${SEQUENCE_COLUMN}`);
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?majorDimension=COLUMNS`;
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  await ensureGoogleResponse(response, token, "อ่านเลขลำดับใน Google Sheet ไม่สำเร็จ");

  const payload = await response.json();
  const values = Array.isArray(payload.values) && Array.isArray(payload.values[0]) ? payload.values[0] : [];
  const numbers = values
    .map((value) => Number(String(value).replace(/,/g, "").trim()))
    .filter((value) => Number.isFinite(value) && value > 0);

  return numbers.length ? Math.max(...numbers) + 1 : 1;
}

function quoteSheetName(sheetTitle) {
  return `'${String(sheetTitle).replace(/'/g, "''")}'`;
}

function toSheetCell(value) {
  if (!value) {
    return {};
  }

  if (typeof value === "number") {
    return {
      userEnteredValue: {
        numberValue: value
      }
    };
  }

  return {
    userEnteredValue: {
      stringValue: value
    }
  };
}

async function ensureGoogleResponse(response, token, fallbackMessage) {
  if (response.status === 401) {
    await removeCachedToken(token);
    throw new Error("สิทธิ์ Google หมดอายุ ลองบันทึกอีกครั้ง");
  }

  if (!response.ok) {
    const detail = await readGoogleError(response);
    throw new Error(detail || fallbackMessage);
  }
}

async function getGoogleAuthToken() {
  const manifest = chrome.runtime.getManifest();
  const clientId = manifest.oauth2 && manifest.oauth2.client_id ? manifest.oauth2.client_id : "";
  if (!clientId || clientId.includes(OAUTH_PLACEHOLDER)) {
    throw new Error("ตั้งค่า Google OAuth client_id ใน manifest.json ก่อนใช้โหมด Sheet");
  }

  const result = await chrome.identity.getAuthToken({ interactive: true });
  const token = typeof result === "string" ? result : result && result.token;
  if (!token) {
    throw new Error("เข้าสู่ระบบ Google ไม่สำเร็จ");
  }

  return token;
}

async function removeCachedToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, resolve);
  });
}

async function readGoogleError(response) {
  try {
    const payload = await response.json();
    return payload.error && payload.error.message ? payload.error.message : "";
  } catch (error) {
    return "";
  }
}

async function addNote(note) {
  state.notes = [note, ...state.notes].slice(0, MAX_NOTES);
  await chrome.storage.local.set({ [STORAGE_KEYS.notes]: state.notes });
  renderNotes();
  await saveDraft();
}

function renderNotes() {
  els.notesList.textContent = "";
  els.emptyState.hidden = state.notes.length > 0;

  const template = document.querySelector("#noteTemplate");
  const fragment = document.createDocumentFragment();

  for (const note of state.notes) {
    const item = template.content.firstElementChild.cloneNode(true);
    const destination = item.querySelector(".note-destination");
    const noteLink = item.querySelector(".note-link");
    const deleteButton = item.querySelector(".delete-note");

    destination.textContent = note.destination === "sheet" ? "Sheet" : "Note";
    destination.classList.toggle("is-sheet", note.destination === "sheet");
    item.querySelector(".note-time").textContent = formatDisplayDate(note.createdAt);
    item.querySelector(".note-title").textContent = note.title;
    item.querySelector(".note-details").textContent = note.details;

    if (note.link) {
      noteLink.href = note.link;
      noteLink.textContent = note.link;
    } else {
      noteLink.remove();
    }

    deleteButton.addEventListener("click", () => deleteNote(note.id));
    fragment.append(item);
  }

  els.notesList.append(fragment);
}

async function deleteNote(id) {
  state.notes = state.notes.filter((note) => note.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEYS.notes]: state.notes });
  renderNotes();
  setStatus("ลบโน้ตแล้ว", "success");
}

function clearForm(options = {}) {
  const { keepLink = false, keepSheet = true } = options;
  els.titleInput.value = "";
  els.detailsInput.value = "";

  if (!keepLink) {
    els.linkInput.value = "";
  }

  if (!keepSheet) {
    els.sheetUrl.value = "";
  }

  saveDraft();
  els.titleInput.focus();
}

async function saveDraft() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.draft]: {
      title: els.titleInput.value,
      details: els.detailsInput.value,
      link: els.linkInput.value
    }
  });
}

function exportCsv() {
  if (!state.notes.length) {
    setStatus("ยังไม่มีโน้ตให้ export", "error");
    return;
  }

  const rows = [
    ["created_at", "destination", "title", "details", "link"],
    ...state.notes.map((note) => [
      note.createdAt,
      note.destination,
      note.title,
      note.details,
      note.link
    ])
  ];

  const csv = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `meeting-notes-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus("Export CSV แล้ว", "success");
}

function escapeCsvCell(value = "") {
  const text = String(value).replaceAll('"', '""');
  return `"${text}"`;
}

function formatSheetDate(value) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "medium"
  }).format(new Date(value));
}

function formatDisplayDate(value) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function setStatus(message, type = "info", options = {}) {
  window.clearTimeout(state.statusTimer);
  els.statusMessage.textContent = message;
  els.statusMessage.classList.toggle("is-success", type === "success");
  els.statusMessage.classList.toggle("is-error", type === "error");

  if (!options.sticky) {
    state.statusTimer = window.setTimeout(() => {
      els.statusMessage.textContent = "";
      els.statusMessage.classList.remove("is-success", "is-error");
    }, 3500);
  }
}
