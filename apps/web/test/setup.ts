import "@testing-library/jest-dom/jest-globals";

// jsdom has no native modal implementation; actual focus/inert behaviour is tested in Chromium.
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};
