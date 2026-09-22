/*
 * Working example: IT service status board (Decorator Kit Developer Guide, App Patterns).
 *
 * Progressive enhancement over markup that already lists every service, so
 * the board is readable with JavaScript off. The script adds filtering (All /
 * Needs attention), search by name, a live result count for screen readers,
 * and an empty state. It reads and writes only elements inside #its-board,
 * which lives in the canvas.
 *
 * jQuery is used for the change listener because Bootstrap's button.js
 * (data-toggle="buttons") announces radio changes with jQuery's trigger(),
 * which native addEventListener handlers never see.
 */
(function ($) {
  "use strict";

  var board = document.getElementById("its-board");
  if (!board || !$) return;

  var items = Array.prototype.slice.call(board.querySelectorAll("[data-service]"));
  var search = board.querySelector("#its-q");
  var count = board.querySelector(".app-live-count");
  var empty = board.querySelector(".app-empty");
  var form = board.querySelector("form.app-toolbar-search");

  function currentFilter() {
    var checked = board.querySelector('input[name="its-show"]:checked');
    return checked ? checked.value : "all";
  }

  function apply() {
    var filter = currentFilter();
    var term = (search.value || "").trim().toLowerCase();
    var shown = 0;

    items.forEach(function (item) {
      var name = item.getAttribute("data-service").toLowerCase();
      var status = item.getAttribute("data-status");
      var visible = (filter === "all" || status !== "ok") && (!term || name.indexOf(term) !== -1);
      item.classList.toggle("hidden", !visible);
      if (visible) shown += 1;
    });

    count.textContent = shown + (shown === 1 ? " service" : " services") + " shown";
    empty.classList.toggle("hidden", shown > 0);
  }

  $(board).on("change", 'input[name="its-show"]', apply);
  search.addEventListener("input", apply);
  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      apply();
    });
  }

  apply();
})(window.jQuery);
