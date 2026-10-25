(function () {
  var harness = false;
  try {
    harness = new URLSearchParams(window.location.search).get("harness") === "1";
  } catch (error) {
    harness = false;
  }
  if (harness) document.documentElement.dataset.harness = "1";
  try {
    if (localStorage.getItem("datasniper.readyTipDismissed") === "1") {
      document.documentElement.dataset.readyTip = "dismissed";
    }
  } catch (error) {
    /* The tip stays visible when storage is blocked. */
  }
  var src = harness
    ? "js/office-mock.js?v=9"
    : "https://appsforoffice.microsoft.com/lib/1/hosted/office.js";
  document.write('<script src="' + src + '"><\/script>');
})();
