(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MultiNotebookCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function sourceText(cell) {
    if (!cell) return "";
    return Array.isArray(cell.source)
      ? cell.source.join("")
      : String(cell.source == null ? "" : cell.source);
  }

  function taskHeading(cell) {
    if (!cell || cell.cell_type !== "markdown") return null;
    var firstLine = sourceText(cell).split(/\r?\n/, 1)[0];
    var match = /^\s*(?:#{1,6}\s*)?(\d+(?:\.\d+)*)(?:\s*[.)])?\s+(.+?)\s*$/.exec(firstLine);
    if (!match) return null;
    return {
      number: match[1],
      title: match[1] + " " + match[2].replace(/[_*`]+/g, "").trim(),
    };
  }

  function splitTasks(baseNotebook) {
    var cells = (baseNotebook && baseNotebook.cells) || [];
    var starts = [];
    cells.forEach(function (cell, index) {
      var heading = taskHeading(cell);
      if (!heading) return;
      starts.push({
        id: "task-" + heading.number.replace(/\./g, "-") + "-" + index,
        number: heading.number,
        title: heading.title,
        startCell: index,
        headingCellId: cell.id == null ? null : String(cell.id),
      });
    });
    return starts.map(function (task, index) {
      return Object.assign({}, task, {
        index: index,
        endCell: index + 1 < starts.length ? starts[index + 1].startCell - 1 : cells.length - 1,
      });
    });
  }

  // Explicit rubric boundaries take precedence over heading-based demo splitting.
  function splitTasksByCellIds(baseNotebook, definitions) {
    var cells = (baseNotebook && baseNotebook.cells) || [];
    var indexById = Object.create(null);
    cells.forEach(function (cell, index) {
      if (cell && cell.id != null) indexById[String(cell.id)] = index;
    });
    var starts = (definitions || []).map(function (definition, index) {
      var cellId = String(definition.start_cell_id || definition.cell_id || "");
      var startCell = indexById[cellId];
      if (startCell == null) throw new Error("Task start cell was not found: " + cellId);
      var endBeforeCellId = definition.end_before_cell_id;
      var inclusiveEndCellId = definition.end_cell_id;
      var endBoundaryCell = null;
      if (endBeforeCellId != null) {
        endBoundaryCell = indexById[String(endBeforeCellId)];
        if (endBoundaryCell == null) {
          throw new Error("Task end boundary cell was not found: " + endBeforeCellId);
        }
      } else if (inclusiveEndCellId != null) {
        var inclusiveEndCell = indexById[String(inclusiveEndCellId)];
        if (inclusiveEndCell == null) {
          throw new Error("Task end cell was not found: " + inclusiveEndCellId);
        }
        endBoundaryCell = inclusiveEndCell + 1;
      }
      var heading = taskHeading(cells[startCell]);
      var rawTitle = sourceText(cells[startCell]).split(/\r?\n/, 1)[0]
        .replace(/^\s*#{1,6}\s*/, "")
        .replace(/[_*`]+/g, "")
        .trim();
      return {
        id: "task-cell-" + cellId,
        number: heading ? heading.number : String(index + 1),
        title: heading ? heading.title : (rawTitle || "Task " + (index + 1)),
        points: Number(definition.points),
        startCell: startCell,
        explicitEndBoundaryCell: endBoundaryCell,
        headingCellId: cellId,
      };
    });
    for (var i = 1; i < starts.length; i++) {
      if (starts[i].startCell <= starts[i - 1].startCell) {
        throw new Error("Task start cells must follow notebook order");
      }
    }
    return starts.map(function (task, index) {
      var nextStart = index + 1 < starts.length ? starts[index + 1].startCell : cells.length;
      var endBoundary = task.explicitEndBoundaryCell == null
        ? nextStart
        : task.explicitEndBoundaryCell;
      if (endBoundary <= task.startCell) {
        throw new Error("Task end boundary must follow its start: " + task.headingCellId);
      }
      if (endBoundary > nextStart) {
        throw new Error("Task ranges must not overlap: " + task.headingCellId);
      }
      var result = Object.assign({}, task, {
        index: index,
        endCell: endBoundary - 1,
        endBoundaryCell: endBoundary,
        endBoundaryCellId: endBoundary < cells.length && cells[endBoundary].id != null
          ? String(cells[endBoundary].id)
          : null,
      });
      delete result.explicitEndBoundaryCell;
      return result;
    });
  }

  function taskIndexByBaseCell(baseNotebook, tasks) {
    var count = ((baseNotebook && baseNotebook.cells) || []).length;
    var result = new Array(count).fill(-1);
    (tasks || []).forEach(function (task, taskIndex) {
      for (var i = task.startCell; i <= task.endCell && i < count; i++) result[i] = taskIndex;
    });
    return result;
  }

  function orderedIdAnchors(baseCells, submissionCells) {
    var baseById = Object.create(null);
    baseCells.forEach(function (cell, index) {
      if (cell && cell.id != null) baseById[String(cell.id)] = index;
    });
    var anchors = [];
    var lastBaseIndex = -1;
    submissionCells.forEach(function (cell, submissionIndex) {
      if (!cell || cell.id == null) return;
      var baseIndex = baseById[String(cell.id)];
      if (baseIndex == null || baseIndex <= lastBaseIndex) return;
      anchors.push({ baseIndex: baseIndex, submissionIndex: submissionIndex });
      lastBaseIndex = baseIndex;
    });
    return anchors;
  }

  function mapSubmission(baseNotebook, submissionNotebook) {
    var baseCells = (baseNotebook && baseNotebook.cells) || [];
    var submissionCells = (submissionNotebook && submissionNotebook.cells) || [];
    var baseToSubmission = baseCells.map(function () { return []; });
    var submissionToBase = new Array(submissionCells.length).fill(-1);
    var anchors = orderedIdAnchors(baseCells, submissionCells);
    var withEnd = anchors.concat([{ baseIndex: baseCells.length, submissionIndex: submissionCells.length }]);
    var previousBase = -1;
    var previousSubmission = -1;

    function assign(submissionIndex, baseIndex) {
      if (!(baseIndex >= 0 && baseIndex < baseCells.length)) return;
      submissionToBase[submissionIndex] = baseIndex;
      baseToSubmission[baseIndex].push(submissionIndex);
    }

    withEnd.forEach(function (anchor) {
      var baseStart = previousBase + 1;
      var submissionStart = previousSubmission + 1;
      var baseCount = anchor.baseIndex - baseStart;
      var submissionCount = anchor.submissionIndex - submissionStart;

      if (submissionCount > 0 && baseCount === 0) {
        var neighbor = previousBase >= 0 ? previousBase : anchor.baseIndex;
        for (var extra = 0; extra < submissionCount; extra++) {
          assign(submissionStart + extra, neighbor);
        }
      } else if (submissionCount > 0 && baseCount > 0) {
        for (var offset = 0; offset < submissionCount; offset++) {
          var relativeBase = Math.min(
            baseCount - 1,
            Math.floor((offset * baseCount) / submissionCount)
          );
          assign(submissionStart + offset, baseStart + relativeBase);
        }
      }

      if (anchor.baseIndex < baseCells.length && anchor.submissionIndex < submissionCells.length) {
        assign(anchor.submissionIndex, anchor.baseIndex);
      }
      previousBase = anchor.baseIndex;
      previousSubmission = anchor.submissionIndex;
    });

    var studentCellIdToBase = Object.create(null);
    submissionCells.forEach(function (cell, index) {
      if (cell && cell.id != null && submissionToBase[index] >= 0) {
        studentCellIdToBase[String(cell.id)] = submissionToBase[index];
      }
    });
    var baseCellIdToIndex = Object.create(null);
    baseCells.forEach(function (cell, index) {
      if (cell && cell.id != null) baseCellIdToIndex[String(cell.id)] = index;
    });

    return {
      anchors: anchors,
      baseToSubmission: baseToSubmission,
      submissionToBase: submissionToBase,
      studentCellIdToBase: studentCellIdToBase,
      baseCellIdToIndex: baseCellIdToIndex,
    };
  }

  function originalCellId(mergedCellId) {
    var id = String(mergedCellId == null ? "" : mergedCellId);
    if (id.indexOf("diff:del:") === 0) return id.slice("diff:del:".length);
    if (id.indexOf("diff:out:") === 0) {
      var rest = id.slice("diff:out:".length);
      var marker = rest.lastIndexOf(":");
      if (marker >= 0) rest = rest.slice(0, marker);
      marker = rest.lastIndexOf(":");
      if (marker >= 0) rest = rest.slice(0, marker);
      return rest;
    }
    return id;
  }

  function logicalMapForMergedNotebook(baseNotebook, submissionNotebook, mergedNotebook, tasks) {
    var mapping = mapSubmission(baseNotebook, submissionNotebook);
    var taskByBase = taskIndexByBaseCell(baseNotebook, tasks);
    var byMergedCellId = Object.create(null);
    var lastBaseIndex = 0;
    ((mergedNotebook && mergedNotebook.cells) || []).forEach(function (cell) {
      if (!cell || cell.id == null) return;
      var mergedId = String(cell.id);
      var sourceId = originalCellId(mergedId);
      var baseIndex = mapping.baseCellIdToIndex[sourceId];
      if (baseIndex == null) baseIndex = mapping.studentCellIdToBase[sourceId];
      if (baseIndex == null) baseIndex = lastBaseIndex;
      if (!(baseIndex >= 0)) baseIndex = 0;
      lastBaseIndex = baseIndex;
      byMergedCellId[mergedId] = {
        baseIndex: baseIndex,
        taskIndex: taskByBase[baseIndex] == null ? -1 : taskByBase[baseIndex],
      };
    });
    return {
      mapping: mapping,
      taskByBase: taskByBase,
      byMergedCellId: byMergedCellId,
    };
  }

  return {
    sourceText: sourceText,
    taskHeading: taskHeading,
    splitTasks: splitTasks,
    splitTasksByCellIds: splitTasksByCellIds,
    taskIndexByBaseCell: taskIndexByBaseCell,
    orderedIdAnchors: orderedIdAnchors,
    mapSubmission: mapSubmission,
    originalCellId: originalCellId,
    logicalMapForMergedNotebook: logicalMapForMergedNotebook,
  };
});
