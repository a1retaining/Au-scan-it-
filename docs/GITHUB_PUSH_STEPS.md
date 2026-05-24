# GitHub push steps

From the unzipped repo folder:

```bash
git status
git add .
git commit -m "Deploy ASX Trade Finder v19 render fix"
git branch -M main
git remote -v
git push origin main
```

If the remote is missing:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

After pushing, Render must be pointed at this same repo and branch.
