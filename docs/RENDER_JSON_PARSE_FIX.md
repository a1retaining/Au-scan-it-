# Render JSON parse fix

If Render shows:

```text
npm error JSON.parse Unexpected token "#"
note: package.json must be actual JSON, not just JavaScript
```

then a comment line was accidentally uploaded into `package.json`, for example:

```text
# V17 Frontend Rebuild
```

JSON files cannot contain comments. This package fixes that by using clean, valid JSON in both:

- `package.json`
- `frontend/package.json`

This upload-friendly version also removes `package-lock.json` files so Render can regenerate them cleanly with `npm install`.

Use Render frontend settings:

```text
Build Command: npm run build
Start Command: npm start
Health Check Path: /health
Root Directory: leave blank
```

After deployment, `/health` should show:

```text
AU-ASX-INSTITUTIONAL-DESK-V26
```
