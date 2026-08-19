// A minimal but structurally real Decorator two-column page, shared by
// test/chrome-contract.test.mjs and test/chrome-styling.test.mjs. Shaped from
// skills/ucsd-decorator/references/protected-regions.md and
// contracts/ucsd-decorator-5.json — not an approximation invented for the
// test, the same markup those documents transcribe from the vendor template.
//
// `logoHref` and `footerBroken` exist to exercise the tier-3 rules added to
// close the "only the header was checked" gap: `logoHref` swaps a.title-logo's
// href without touching its count, and `footerBroken` drops the footer-links
// list and the wordmark image entirely. Both defaults match the real markup
// pinned into vendor/decorator-5/templates/two-column.html on 2026-08-19.

export function decoratorPage(title, { searchAsLink = false, logoHref = "https://www.ucsd.edu", footerBroken = false } = {}) {
  const footerContent = footerBroken
    ? `<p>&copy; 2026 UC San Diego</p>`
    : `<ul class="footer-links"><li><a href="https://www.ucsd.edu/_about/legal/index.html">Terms &amp; Conditions</a></li></ul>
       <img src="https://cdn.ucsd.edu/developer/decorator/5.0.2/img/ucsd-footer-logo-white.png" alt="" class="img-responsive footer-logo" />`;
  const searchContent = searchAsLink
    ? `<a href="/search/">Search</a>`
    : `<form action="https://act.ucsd.edu/cwp/tools/search-redir" method="get">
        <select class="search-scope" name="search-scope">
          <option value="default_collection">All UCSD Sites</option>
        </select>
        <div class="input-group">
          <input placeholder="Search..." type="search" class="form-control search-term" id="q" name="search-term">
        </div>
      </form>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title></head>
<body>
<header class="layout-header">
  <a class="skip-to-main" href="#main-content">Skip to main content</a>
  <div id="uc-emergency"></div>
  <section class="layout-title">
    <a href="index.html" class="title-header title-header-large">Site Name</a>
    <a href="index.html" class="title-header title-header-short">Short</a>
    <a href="${logoHref}" class="title-logo">UC San Diego</a>
  </section>
</header>
<nav class="navbar navbar-default navbar-static-top">
  <div class="container-fluid">
    <button type="button" class="navbar-toggle" data-toggle="offcanvas" data-target=".navmenu" data-canvas="body" aria-expanded="false" aria-controls="navbar">
      <span class="sr-only">Toggle navigation</span>
      <div class="col-sm-1 mobile-nav-bars">
        <span class="icon-bar"></span>
        <span class="icon-bar"></span>
        <span class="icon-bar"></span>
      </div>
      <div class="col-sm-1 mobile-nav-icon">MENU</div>
    </button>
    <div id="navbar" class="navbar-collapse collapse">
      <ul class="nav navbar-nav">
        <li class="${title === "Home" ? "active" : ""}"><a href="index.html">Home</a></li>
        <li><a href="about.html">About</a></li>
      </ul>
      <ul class="nav navbar-nav navbar-right">
        <li>
          <div class="search">
            <button class="search-toggle btn-default"><span class="glyphicon glyphicon-search"></span></button>
            <div class="search-content" id="search">${searchContent}</div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</nav>
<div class="navmenu navmenu-default navmenu-fixed-left offcanvas" style="">
  <ul class="nav navbar-nav navbar-right">
    <li>
      <div class="search">
        <button class="search-toggle btn-default"><span class="glyphicon glyphicon-search"></span></button>
        <div class="search-content" id="search">${searchContent}</div>
      </div>
    </li>
  </ul>
  <ul class="nav navmenu-nav">
    <li class="${title === "Home" ? "active" : ""}"><a href="index.html">Home</a></li>
    <li><a href="about.html">About</a></li>
  </ul>
</div>
<main id="main-content">
  <h1>${title}</h1>
  <p>Canvas content for ${title}.</p>
</main>
<footer class="footer">
  <div class="container">
    ${footerContent}
  </div>
</footer>
</body>
</html>
`;
}
