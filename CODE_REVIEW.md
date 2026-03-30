# Code Review Findings

## 1) Invalid HTML structure on home page (high)
- `index.html` contains `<body class="home-page">` **before** the opening `<html>` tag, and then opens a second `<body>` later.
- This is invalid markup and can cause inconsistent browser parsing and SEO/accessibility tooling issues.

## 2) Unsanitized HTML injection in policy rendering (high)
- `app.js` uses `innerHTML` to render `displayName`, `description`, category path, and registry values pulled from JSON data.
- If any upstream policy data includes HTML/script payloads, this could become a stored XSS vector.
- Prefer `textContent` and explicit element creation for untrusted content.

## 3) Deep-link URLs likely break on refresh in static hosting (medium)
- Clicking a policy updates URL to `./<policyId>.html` (`history.pushState`), but the repository only includes static files for app entry pages under `apps/*.html`.
- On refresh/direct navigation, many hosts will return 404 for `/apps/<policyId>.html` unless rewrite rules are configured.
- Consider query/hash routing (e.g., `?policy=<id>` / `#<id>`) or explicit rewrite config.

## 4) Dead/partial UI hooks in search area (low)
- JS references `#clearSearch` and `#resultCount`, but these elements are not present in app page templates.
- This creates partially implemented behavior and makes code harder to maintain.

## 5) Unused product filter appears on non-office pages (low)
- `apps/mozilla.html` and `apps/citrix.html` include `<select id="productFilter">` while comments indicate this control is intended only for Office.
- `app.js` currently has no logic to populate/use this filter, so the control appears non-functional.
