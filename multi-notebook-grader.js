(function () {
  "use strict";

  var loader = document.getElementById("loader");
  var app = document.getElementById("app");
  var baseInput = document.getElementById("base-file");
  var studentInput = document.getElementById("student-files");
  var taskInput = document.getElementById("task-file");
  var notesInput = document.getElementById("notes-files");
  var loadStatus = document.getElementById("load-status");
  var columnsRoot = document.getElementById("columns");
  var columnsViewport = document.getElementById("columns-viewport");
  var gradeDialog = document.getElementById("grade-dialog");
  var gradeForm = document.getElementById("grade-form");
  var gradeContext = document.getElementById("grade-context");
  var gradeValue = document.getElementById("grade-value");
  var gradeComment = document.getElementById("grade-comment");
  var gradeDestination = document.getElementById("grade-destination");
  var toast = document.getElementById("toast");
  var DEFAULT_IGNORE_DELETION_PATTERNS = ["^[^A-Za-zА-Яа-яЁё0-9]*$"];
  var DEFAULT_IGNORE_ADDITION_PATTERNS = ["^\\s*$"];

  var state = {
    base: null,
    baseName: "hw.ipynb",
    submissions: [],
    tasks: [],
    columns: [],
    activeIndex: 0,
    currentTask: 0,
    gradingTask: null,
    gradingStudent: null,
    grades: {},
    storageKey: "",
    scrollFrame: 0,
    syncing: false,
    horizontalWheelAmount: 0,
    horizontalWheelAt: 0,
    horizontalWheelLockedUntil: 0,
    horizontalWheelNavigated: false,
  };

  function setStatus(message, isError) {
    loadStatus.textContent = message;
    loadStatus.classList.toggle("error", !!isError);
  }

  function readFile(file) {
    return file.text().then(function (text) {
      try { return JSON.parse(text); }
      catch (error) { throw new Error(file.name + ": " + error.message); }
    });
  }

  function notesFromLoadedFile(data, fileName) {
    if (data && Array.isArray(data.cells)) {
      throw new Error((fileName || "Notes file") + " is a notebook. Save notes as JSON instead.");
    }
    var raw = data && !Array.isArray(data) && Array.isArray(data.notes) ? data.notes : data;
    return IpynbToHtml.parseNotesList(raw, fileName || "notes");
  }

  function notebookIdentity() {
    return [state.baseName].concat(state.submissions.map(function (item) { return item.name; })).join("|");
  }

  function gradeKey(taskIndex, studentIndex) {
    return state.tasks[taskIndex].id + "::" + state.submissions[studentIndex].name;
  }

  function loadGrades() {
    state.storageKey = "multi_notebook_grades::" + notebookIdentity();
    try {
      var parsed = JSON.parse(localStorage.getItem(state.storageKey) || "{}");
      state.grades = parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      state.grades = {};
    }
  }

  function persistGrades() {
    try { localStorage.setItem(state.storageKey, JSON.stringify(state.grades)); }
    catch (error) { /* local files may disallow persistent storage */ }
  }

  function download(name, value) {
    var blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); link.remove(); }, 0);
  }

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function () { toast.hidden = true; }, 2200);
  }

  function buildColumnModel(submission, index) {
    var merged = NotebookDiff.mergeNotebooks(state.base, submission.notebook, {
      baseName: state.baseName,
      headName: submission.name,
    }).notebook;
    var filteredMerged = NotebookDiff.mergeNotebooks(state.base, submission.notebook, {
      baseName: state.baseName,
      headName: submission.name,
      ignoreDeletionPatterns: DEFAULT_IGNORE_DELETION_PATTERNS,
      ignoreAdditionPatterns: DEFAULT_IGNORE_ADDITION_PATTERNS,
    }).notebook;
    NotebookDiff.attachDiffVariant(merged, filteredMerged, "filtered");
    var logical = MultiNotebookCore.logicalMapForMergedNotebook(
      state.base,
      submission.notebook,
      merged,
      state.tasks
    );
    var html = IpynbToHtml.convertNotebookToHtml(merged, {
      title: submission.name,
      sourceName: state.baseName + " → " + submission.name,
      exportNotebook: submission.notebook,
      exportSourceName: submission.name,
      noteStorageKey: "multi-grader::" + state.baseName + "::" + submission.name,
      notes: submission.notes != null ? submission.notes : [],
      diffInitialMode: "filtered",
    });
    return {
      index: index,
      name: submission.name,
      notebook: submission.notebook,
      merged: merged,
      logical: logical,
      html: html,
      shell: null,
      iframe: null,
      doc: null,
      win: null,
      groups: {},
      groupWrappers: {},
      taskStarts: {},
      taskSections: {},
      diffByTask: {},
      focusedCell: null,
    };
  }

  function frameStyle() {
    return [
      "html{scroll-behavior:auto!important}",
      "body{padding:.45rem .55rem 4rem!important;background:#f5f7f9!important}",
      ":root{--page-max:100vw!important;--notes-rail-width:17rem!important;--notes-rail-gap:.55rem!important}",
      ".doc-header,.doc-footer,.toolbar-bottom{display:none!important}",
      ".cells-stack{gap:.34rem!important}",
      ".grader-logical-group{display:flex;flex-direction:column;gap:.34rem;min-height:1px;overflow:auto;scrollbar-width:thin}",
      "body.grader-active-column .grader-logical-group{height:auto!important;overflow:visible!important}",
      ".grader-task-section{display:flex;flex-direction:column;gap:.34rem;border-top:6px solid #34495d;border-bottom:6px solid #34495d;border-radius:0!important;padding:.45rem .35rem .65rem;margin:.45rem 0;transition:background-color .14s ease,box-shadow .14s ease}",
      ".grader-task-section+.grader-task-section{border-top:0;margin-top:calc(-.34rem - .45rem)}",
      ".grader-task-divider{margin:-.45rem -.35rem .1rem;padding:.35rem .55rem;color:#263849;background:#dce4eb;border-bottom:2px solid #8b9aaa;font:800 13px/1.35 ui-sans-serif,system-ui,sans-serif}",
      ".grader-task-section.grader-task-graded{background:rgba(47,138,88,.2);border-radius:0!important;box-shadow:inset 6px 0 #2f8a58}",
      ".grader-task-section.grader-task-graded .grader-task-divider{color:#1f6841}",
      ".grader-task-section.grader-task-graded .cell:not(.diff-add):not(.diff-del){background:#dcefe3!important}",
      "body.diff-mode-off .grader-task-section.grader-task-graded .cell{background:#dcefe3!important}",
      ".grader-downloads{display:flex;flex-wrap:wrap;gap:.45rem;margin:1.2rem 0 0;padding:1rem .35rem;border-top:3px solid #8b9aaa;font:600 12px/1.35 ui-sans-serif,system-ui,sans-serif}",
      ".grader-downloads button{cursor:pointer;border:1px solid #aab4bf;border-radius:5px;padding:.4rem .65rem;background:#fff;color:#263849}",
    ].join("\n");
  }

  function logicalInfo(column, cellId) {
    return column.logical.byMergedCellId[String(cellId)] || null;
  }

  function addToMap(map, key, value) {
    if (!map[key]) map[key] = [];
    map[key].push(value);
  }

  function configureFrame(column) {
    var doc = column.iframe.contentDocument;
    var win = column.iframe.contentWindow;
    column.doc = doc;
    column.win = win;
    var style = doc.createElement("style");
    style.textContent = frameStyle();
    doc.head.appendChild(style);

    doc.querySelectorAll("section.cell[data-cell-id]").forEach(function (cell) {
      var info = logicalInfo(column, cell.getAttribute("data-cell-id"));
      if (!info) return;
      cell.dataset.logicalIndex = String(info.baseIndex);
      cell.dataset.taskIndex = String(info.taskIndex);
      var row = cell.closest(".cell-row");
      if (row) {
        row.dataset.logicalIndex = String(info.baseIndex);
        row.dataset.taskIndex = String(info.taskIndex);
      }
      addToMap(column.groups, info.baseIndex, cell);
      if (info.taskIndex >= 0 && !column.taskStarts[info.taskIndex]) {
        column.taskStarts[info.taskIndex] = cell;
      }
      if (info.taskIndex >= 0 && cell.hasAttribute("data-diff-status")) {
        addToMap(column.diffByTask, info.taskIndex, cell);
      }
    });

    var currentLogical = null;
    var currentWrapper = null;
    Array.from(doc.querySelectorAll("#cells-stack > .cell-row[data-logical-index]")).forEach(function (row) {
      var logicalIndex = row.dataset.logicalIndex;
      if (logicalIndex !== currentLogical) {
        currentLogical = logicalIndex;
        currentWrapper = doc.createElement("div");
        currentWrapper.className = "grader-logical-group";
        currentWrapper.dataset.logicalIndex = logicalIndex;
        row.parentNode.insertBefore(currentWrapper, row);
        column.groupWrappers[logicalIndex] = currentWrapper;
      }
      currentWrapper.appendChild(row);
    });

    var currentTaskIndex = null;
    var currentTaskSection = null;
    Array.from(doc.querySelectorAll("#cells-stack > .grader-logical-group")).forEach(function (wrapper) {
      var logicalIndex = Number(wrapper.dataset.logicalIndex);
      var taskIndex = column.logical.taskByBase[logicalIndex];
      wrapper.dataset.taskIndex = String(taskIndex);
      if (!(taskIndex >= 0)) {
        currentTaskIndex = null;
        currentTaskSection = null;
        return;
      }
      if (taskIndex !== currentTaskIndex) {
        currentTaskIndex = taskIndex;
        currentTaskSection = doc.createElement("div");
        currentTaskSection.className = "grader-task-section";
        currentTaskSection.dataset.taskIndex = String(taskIndex);
        var divider = doc.createElement("div");
        divider.className = "grader-task-divider";
        divider.textContent = state.tasks[taskIndex].title + " · " + state.tasks[taskIndex].points + " points";
        currentTaskSection.appendChild(divider);
        wrapper.parentNode.insertBefore(currentTaskSection, wrapper);
        column.taskSections[taskIndex] = currentTaskSection;
      }
      currentTaskSection.appendChild(wrapper);
    });

    var downloads = doc.createElement("div");
    downloads.className = "grader-downloads";
    [
      ["Download HTML", "downloadAsHtml"],
      ["Download IPYNB", "downloadIpynb"],
      ["Download notes", "downloadNotesJson"],
    ].forEach(function (entry) {
      var button = doc.createElement("button");
      button.type = "button";
      button.textContent = entry[0];
      button.addEventListener("click", function () {
        var notebookState = column.win.__IPYNB_TO_HTML__;
        if (!notebookState || typeof notebookState[entry[1]] !== "function") return;
        var graded = Array.from(doc.querySelectorAll(".grader-task-graded"));
        if (entry[1] === "downloadAsHtml") {
          graded.forEach(function (section) { section.classList.remove("grader-task-graded"); });
        }
        try { notebookState[entry[1]](); }
        finally {
          if (entry[1] === "downloadAsHtml") {
            graded.forEach(function (section) { section.classList.add("grader-task-graded"); });
          }
        }
      });
      downloads.appendChild(button);
    });
    var page = doc.querySelector(".page");
    var footer = doc.querySelector(".doc-footer");
    if (page) page.insertBefore(downloads, footer || null);

    doc.addEventListener("pointerdown", function (event) {
      selectColumn(column.index, true);
      var target = event.target && event.target.closest ? event.target.closest("section.cell[data-task-index]") : null;
      if (target) setFocusedCell(column, target, true);
    }, true);
    doc.addEventListener("wheel", function (event) {
      if (!handleHorizontalNotebookWheel(event, column.index)) {
        selectColumn(column.index, true);
      }
    }, { passive: false, capture: true });
    doc.addEventListener("keydown", handleNavigationKey, true);
    win.addEventListener("scroll", function () {
      if (column.index !== state.activeIndex || state.syncing) return;
      scheduleSync();
    }, { passive: true });
    win.dispatchEvent(new Event("resize"));
  }

  function renderColumns() {
    columnsRoot.innerHTML = "";
    var loads = state.columns.map(function (column) {
      var shell = document.createElement("section");
      shell.className = "submission-column";
      shell.dataset.studentIndex = String(column.index);
      var head = document.createElement("div");
      head.className = "column-head";
      head.innerHTML = '<span class="student-name"></span><span class="spacer"></span><span class="grade-chip"></span>';
      head.querySelector(".student-name").textContent = column.name;
      head.addEventListener("click", function () { selectColumn(column.index, true); });
      var iframe = document.createElement("iframe");
      iframe.title = column.name + " diff";
      shell.appendChild(head);
      shell.appendChild(iframe);
      columnsRoot.appendChild(shell);
      column.shell = shell;
      column.iframe = iframe;
      return new Promise(function (resolve, reject) {
        iframe.addEventListener("load", function () {
          try { configureFrame(column); resolve(); }
          catch (error) { reject(error); }
        }, { once: true });
        iframe.srcdoc = column.html;
      });
    });
    return Promise.all(loads);
  }

  function scrollElement(column) {
    return column.doc.scrollingElement || column.doc.documentElement;
  }

  function elementBounds(column, elements) {
    if (!elements || !elements.length) return null;
    var scrollTop = scrollElement(column).scrollTop;
    var first = elements[0].getBoundingClientRect();
    var last = elements[elements.length - 1].getBoundingClientRect();
    return { top: first.top + scrollTop, bottom: last.bottom + scrollTop };
  }

  function logicalCoordinate(column) {
    if (!column || !column.doc) return null;
    var scroller = scrollElement(column);
    var anchor = scroller.scrollTop + column.win.innerHeight * 0.28;
    var keys = Object.keys(column.groups).map(Number).sort(function (a, b) { return a - b; });
    var best = null;
    keys.forEach(function (logicalIndex) {
      var bounds = elementBounds(column, column.groups[logicalIndex]);
      if (!bounds) return;
      var distance = anchor < bounds.top ? bounds.top - anchor : anchor > bounds.bottom ? anchor - bounds.bottom : 0;
      if (!best || distance < best.distance) best = { logicalIndex: logicalIndex, bounds: bounds, distance: distance };
    });
    if (!best) return null;
    var height = Math.max(1, best.bounds.bottom - best.bounds.top);
    return {
      logicalIndex: best.logicalIndex,
      progress: Math.max(0, Math.min(1, (anchor - best.bounds.top) / height)),
    };
  }

  function scrollToLogical(column, coordinate) {
    if (!column || !column.doc || !coordinate) return;
    var keys = Object.keys(column.groups).map(Number).sort(function (a, b) { return a - b; });
    if (!keys.length) return;
    var key = coordinate.logicalIndex;
    if (!column.groups[key]) {
      key = keys.reduce(function (best, value) {
        return Math.abs(value - coordinate.logicalIndex) < Math.abs(best - coordinate.logicalIndex) ? value : best;
      }, keys[0]);
    }
    var bounds = elementBounds(column, column.groups[key]);
    if (!bounds) return;
    var height = Math.max(1, bounds.bottom - bounds.top);
    var top = bounds.top + coordinate.progress * height - column.win.innerHeight * 0.28;
    scrollElement(column).scrollTop = Math.max(0, top);
  }

  function synchronizeFromSelected() {
    var active = state.columns[state.activeIndex];
    if (!active || !active.doc) return;
    var selectedScrollTop = scrollElement(active).scrollTop;
    state.syncing = true;
    state.columns.forEach(function (column) {
      if (column.index !== state.activeIndex) scrollElement(column).scrollTop = selectedScrollTop;
    });
    requestAnimationFrame(function () { state.syncing = false; });
  }

  function alignColumnsToSelected() {
    var active = state.columns[state.activeIndex];
    if (!active || !active.doc) return;
    state.columns.forEach(function (column) {
      if (!column.doc) return;
      column.doc.body.classList.toggle("grader-active-column", column.index === state.activeIndex);
      Object.keys(column.groupWrappers).forEach(function (key) {
        column.groupWrappers[key].style.height = "";
      });
    });
    var activeHeights = {};
    Object.keys(active.groupWrappers).forEach(function (key) {
      activeHeights[key] = Math.max(1, Math.ceil(active.groupWrappers[key].getBoundingClientRect().height));
    });
    state.columns.forEach(function (column) {
      if (column.index === state.activeIndex) return;
      Object.keys(column.groupWrappers).forEach(function (key) {
        if (activeHeights[key] != null) column.groupWrappers[key].style.height = activeHeights[key] + "px";
      });
    });
  }

  function scheduleSync() {
    if (state.scrollFrame) return;
    state.scrollFrame = requestAnimationFrame(function () {
      state.scrollFrame = 0;
      focusCellAtReadingPosition();
      synchronizeFromSelected();
    });
  }

  function cellAtReadingPosition(column) {
    if (!column || !column.doc) return null;
    var anchor = column.win.innerHeight * 0.28;
    var best = null;
    column.doc.querySelectorAll("section.cell[data-task-index]").forEach(function (cell) {
      if (Number(cell.dataset.taskIndex) < 0) return;
      var rect = cell.getBoundingClientRect();
      var distance = anchor < rect.top ? rect.top - anchor : anchor > rect.bottom ? anchor - rect.bottom : 0;
      if (!best || distance < best.distance) best = { cell: cell, distance: distance };
    });
    return best && best.cell;
  }

  function setFocusedCell(column, cell, updateTask) {
    if (!column || !cell || Number(cell.dataset.taskIndex) < 0) return false;
    column.focusedCell = cell;
    if (updateTask && column.index === state.activeIndex) {
      setCurrentTask(Number(cell.dataset.taskIndex));
    }
    return true;
  }

  function focusCellAtReadingPosition() {
    var column = state.columns[state.activeIndex];
    var cell = cellAtReadingPosition(column);
    if (cell) setFocusedCell(column, cell, true);
  }

  function selectColumn(index, preservePosition) {
    if (!(index >= 0 && index < state.columns.length)) return;
    if (index === state.activeIndex && state.columns[index].shell.classList.contains("active")) return;
    var coordinate = preservePosition ? logicalCoordinate(state.columns[state.activeIndex]) : null;
    state.activeIndex = index;
    state.columns.forEach(function (column) {
      column.shell.classList.toggle("active", column.index === index);
    });
    alignColumnsToSelected();
    if (coordinate) scrollToLogical(state.columns[index], coordinate);
    setFocusedCell(state.columns[index], cellAtReadingPosition(state.columns[index]), true);
    var activeShell = state.columns[index].shell;
    var left = activeShell.offsetLeft - Math.max(0, (columnsViewport.clientWidth - activeShell.offsetWidth) / 2);
    columnsViewport.scrollTo({ left: left, behavior: "smooth" });
    synchronizeFromSelected();
    updateDashboard();
  }

  function handleHorizontalNotebookWheel(event, sourceIndex) {
    var horizontal = Number(event.deltaX) || 0;
    var vertical = Number(event.deltaY) || 0;
    if (Math.abs(horizontal) < 2 || Math.abs(horizontal) <= Math.abs(vertical)) return false;
    event.preventDefault();
    var now = Date.now();
    if (now - state.horizontalWheelAt > 180) {
      state.horizontalWheelAmount = 0;
      state.horizontalWheelNavigated = false;
    }
    state.horizontalWheelAt = now;
    if (now < state.horizontalWheelLockedUntil || state.horizontalWheelNavigated) return true;
    if (!state.horizontalWheelAmount && sourceIndex >= 0 && sourceIndex !== state.activeIndex) {
      selectColumn(sourceIndex, true);
    }
    state.horizontalWheelAmount += horizontal;
    if (Math.abs(state.horizontalWheelAmount) < 70) return true;
    var direction = state.horizontalWheelAmount > 0 ? 1 : -1;
    state.horizontalWheelAmount = 0;
    state.horizontalWheelNavigated = true;
    state.horizontalWheelLockedUntil = now + 320;
    selectColumn(state.activeIndex + direction, true);
    return true;
  }

  function scrollTaskStart(taskIndex) {
    var column = state.columns[state.activeIndex];
    var start = column.taskSections[taskIndex] || column.taskStarts[taskIndex];
    if (!start) return;
    var top = start.getBoundingClientRect().top + scrollElement(column).scrollTop - 12;
    scrollElement(column).scrollTop = Math.max(0, top);
    scheduleSync();
  }

  function setTask(taskIndex, shouldScroll) {
    if (!(taskIndex >= 0 && taskIndex < state.tasks.length)) return;
    setCurrentTask(taskIndex);
    if (shouldScroll) scrollTaskStart(taskIndex);
    var column = state.columns[state.activeIndex];
    var firstCell = column && column.taskStarts[taskIndex];
    if (firstCell) setFocusedCell(column, firstCell, false);
  }

  function setCurrentTask(taskIndex) {
    if (!(taskIndex >= 0 && taskIndex < state.tasks.length)) return;
    state.currentTask = taskIndex;
    updateDashboard();
  }

  function gradeFocusedTask(target) {
    var column = state.columns[state.activeIndex];
    var targetCell = target && target.closest ? target.closest("section.cell[data-task-index]") : null;
    var cell = targetCell || column.focusedCell || cellAtReadingPosition(column);
    if (!setFocusedCell(column, cell, true)) return;
    openGradeDialog(Number(cell.dataset.taskIndex));
  }

  function openGradeDialog(taskIndex) {
    setCurrentTask(taskIndex);
    var task = state.tasks[taskIndex];
    var student = state.submissions[state.activeIndex];
    state.gradingTask = taskIndex;
    state.gradingStudent = state.activeIndex;
    var existing = state.grades[gradeKey(taskIndex, state.activeIndex)] || {};
    gradeContext.textContent = student.name + " · " + task.title + " · maximum " + task.points + " points";
    gradeValue.max = String(task.points);
    gradeValue.placeholder = "0–" + task.points;
    gradeValue.setCustomValidity("");
    gradeValue.value = existing.grade != null ? existing.grade : "";
    gradeComment.value = existing.comment || "";
    gradeDialog.showModal();
    setTimeout(function () { gradeValue.focus(); gradeValue.select(); }, 0);
  }

  function applyGradeDecoration() {
    state.columns.forEach(function (column) {
      if (!column.doc) return;
      Object.keys(column.taskSections).forEach(function (key) {
        var taskIndex = Number(key);
        column.taskSections[key].classList.toggle(
          "grader-task-graded",
          !!state.grades[gradeKey(taskIndex, column.index)]
        );
      });
    });
  }

  function updateDashboard() {
    if (!state.columns.length) return;
    state.columns.forEach(function (column) {
      var grade = state.grades[gradeKey(state.currentTask, column.index)];
      var chip = column.shell.querySelector(".grade-chip");
      chip.classList.toggle("graded", !!grade);
      chip.textContent = grade
        ? "Grade: " + grade.grade + " / " + state.tasks[state.currentTask].points
        : "Not graded";
    });
  }

  function isEditable(target) {
    if (!target) return false;
    var tag = String(target.tagName || "").toLowerCase();
    return target.isContentEditable || /^(input|textarea|select|button)$/.test(tag);
  }

  function handleNavigationKey(event) {
    var ownerDocument = event.target && event.target.ownerDocument;
    var notebookModalOpen = ownerDocument && ownerDocument !== document && ownerDocument.querySelector(".modal-backdrop.open");
    if (event.defaultPrevented || isEditable(event.target) || gradeDialog.open || notebookModalOpen) return;
    if (event.key === "Enter") {
      event.preventDefault();
      gradeFocusedTask(event.target);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectColumn(state.activeIndex - 1, true);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      selectColumn(state.activeIndex + 1, true);
    }
  }

  function openNotebooks(base, baseName, submissions, taskDefinitions) {
    if (!base || !Array.isArray(base.cells)) throw new Error("The base file is not a notebook.");
    if (!submissions.length) throw new Error("Choose at least one student submission.");
    submissions.forEach(function (submission) {
      if (!submission.notebook || !Array.isArray(submission.notebook.cells)) {
        throw new Error(submission.name + " is not a notebook.");
      }
    });
    state.base = base;
    state.baseName = baseName;
    state.submissions = submissions;
    state.tasks = MultiNotebookCore.splitTasksByCellIds(base, taskDefinitions || MultiNotebookTaskConfig);
    if (!state.tasks.length) throw new Error("The task configuration is empty.");
    state.activeIndex = 0;
    state.currentTask = 0;
    loadGrades();
    state.columns = submissions.map(buildColumnModel);
    setStatus("Rendering notebook diffs…", false);
    return renderColumns().then(function () {
      loader.hidden = true;
      app.hidden = false;
      state.columns.forEach(function (column) { column.shell.classList.toggle("active", column.index === 0); });
      alignColumnsToSelected();
      applyGradeDecoration();
      setTask(0, true);
      synchronizeFromSelected();
      updateDashboard();
    });
  }

  document.getElementById("open-selected").addEventListener("click", function () {
    var baseFile = baseInput.files && baseInput.files[0];
    var studentFiles = Array.from(studentInput.files || []);
    var taskFile = taskInput.files && taskInput.files[0];
    var notesFiles = Array.from(notesInput.files || []);
    if (!baseFile || !studentFiles.length) {
      setStatus("Choose one base notebook and at least one student submission.", true);
      return;
    }
    if (notesFiles.length && notesFiles.length !== studentFiles.length) {
      setStatus("Choose exactly one notes file per student submission, in the same order.", true);
      return;
    }
    setStatus("Reading notebooks…", false);
    Promise.all([readFile(baseFile), Promise.all(studentFiles.map(function (file) {
      return readFile(file).then(function (notebook) { return { name: file.name, notebook: notebook }; });
    })), taskFile ? readFile(taskFile) : Promise.resolve(null), Promise.all(notesFiles.map(function (file) {
      return readFile(file).then(function (data) {
        return notesFromLoadedFile(data, file.name);
      });
    }))]).then(function (values) {
      if (values[2] != null && !Array.isArray(values[2])) {
        throw new Error("The task ranges JSON must contain an array.");
      }
      values[1].forEach(function (submission, index) {
        if (values[3].length) submission.notes = values[3][index];
      });
      return openNotebooks(values[0], baseFile.name, values[1], values[2]);
    }).catch(function (error) { setStatus(error.message, true); });
  });

  document.addEventListener("keydown", handleNavigationKey, true);
  columnsViewport.addEventListener("wheel", handleHorizontalNotebookWheel, { passive: false });
  window.addEventListener("resize", function () {
    alignColumnsToSelected();
    scheduleSync();
  });

  gradeForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var taskIndex = state.gradingTask;
    var studentIndex = state.gradingStudent;
    if (!(taskIndex >= 0) || !(studentIndex >= 0)) return;
    var grade = Number(gradeValue.value);
    var maximum = Number(state.tasks[taskIndex].points);
    gradeValue.setCustomValidity("");
    if (!Number.isFinite(grade) || grade < 0 || grade > maximum) {
      gradeValue.setCustomValidity("Enter a grade from 0 to " + maximum + ".");
      gradeValue.reportValidity();
      return;
    }
    state.grades[gradeKey(taskIndex, studentIndex)] = {
      taskId: state.tasks[taskIndex].id,
      taskNumber: state.tasks[taskIndex].number,
      taskTitle: state.tasks[taskIndex].title,
      points: state.tasks[taskIndex].points,
      student: state.submissions[studentIndex].name,
      grade: grade,
      comment: gradeComment.value.trim(),
      gradedAt: new Date().toISOString(),
    };
    persistGrades();
    gradeDialog.close();
    state.gradingTask = null;
    state.gradingStudent = null;
    applyGradeDecoration();
    updateDashboard();
    showToast("Grade saved for " + state.tasks[taskIndex].title + ".");
    var destination = gradeDestination ? gradeDestination.value : "next-student";
    if (destination === "next-student" && studentIndex + 1 < state.columns.length) {
      selectColumn(studentIndex + 1, true);
      setTask(taskIndex, true);
    } else if (destination === "next-task" && taskIndex + 1 < state.tasks.length) {
      if (state.activeIndex !== studentIndex) selectColumn(studentIndex, true);
      setTask(taskIndex + 1, true);
    }
  });
  gradeValue.addEventListener("input", function () { gradeValue.setCustomValidity(""); });
  document.getElementById("grade-cancel").addEventListener("click", function () {
    gradeDialog.close();
    state.gradingTask = null;
    state.gradingStudent = null;
  });
  document.getElementById("export-grades").addEventListener("click", function () {
    download("notebook-grades.json", {
      baseNotebook: state.baseName,
      submissions: state.submissions.map(function (item) { return item.name; }),
      tasks: state.tasks,
      grades: Object.values(state.grades),
    });
  });
  document.getElementById("change-files").addEventListener("click", function () {
    app.hidden = true;
    loader.hidden = false;
    setStatus("Choose one base notebook and one or more student submissions.", false);
  });

})();
