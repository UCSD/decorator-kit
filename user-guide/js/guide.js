/*
 * Decorator Kit Developer Guide — copy-to-clipboard for prompt blocks.
 *
 * Touches only elements inside the canvas (main#main-content). Each
 * button.guide-copy names the <pre> it copies with data-copy-target.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("main-content");
  if (!canvas) return;

  var status = canvas.querySelector(".guide-status");

  function announce(message) {
    if (!status) return;
    status.textContent = "";
    window.setTimeout(function () {
      status.textContent = message;
    }, 50);
  }

  function fallbackCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.className = "sr-only";
    canvas.appendChild(area);
    area.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (e) {
      ok = false;
    }
    canvas.removeChild(area);
    return ok;
  }

  function flash(button, ok) {
    var label = button.querySelector(".guide-copy-label");
    var icon = button.querySelector(".glyphicon");
    if (!label) return;
    window.clearTimeout(button._guideTimer);
    label.textContent = ok ? "Copied" : "Press Ctrl+C";
    if (icon) icon.className = "glyphicon " + (ok ? "glyphicon-ok" : "glyphicon-copy");
    button.classList.toggle("is-copied", ok);
    button._guideTimer = window.setTimeout(function () {
      label.textContent = "Copy";
      if (icon) icon.className = "glyphicon glyphicon-copy";
      button.classList.remove("is-copied");
    }, 2000);
  }

  canvas.addEventListener("click", function (event) {
    var button = event.target.closest("button.guide-copy");
    if (!button || !canvas.contains(button)) return;

    var target = document.getElementById(button.getAttribute("data-copy-target"));
    if (!target) return;
    var text = target.textContent.trim();

    function done(ok) {
      flash(button, ok);
      announce(ok ? "Prompt copied to clipboard." : "Copy failed. Select the prompt text and copy it manually.");
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(
        function () { done(true); },
        function () { done(fallbackCopy(text)); }
      );
    } else {
      done(fallbackCopy(text));
    }
  });
})();
