# Astro Starter Kit: Minimal

```sh
npm create astro@latest -- --template minimal
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
├── src/
│   └── pages/
│       └── index.astro
└── package.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## Deploying

Pushing to `main` deploys production. Vercel's GitHub integration builds
this folder (the project's Root Directory is `apps/web`); any other branch
gets a preview URL. Nothing else is needed.

A manual CLI deploy (for example a preview to test before pushing) must run
from the **repository root**, not from here. With Root Directory set to
`apps/web`, running the CLI inside `apps/web` makes it look for
`apps/web/apps/web` and deploy an empty site:

```
cd <repo root>
vercel link --project iris-praktikum-jurnal   # once; delete the .env.local it writes
vercel build            # add --prod for production
vercel deploy --prebuilt   # add --prod for production
```

`npm run check` also typechecks `api/` under the module rules Vercel's
function build enforces (`tsconfig.api.json`), so an import that only
`vercel build` would reject fails locally and in CI first.

## Production checks and backups

- **Smoke test.** `node scripts/rehearse.mjs` checks the live site read-only
  (pages, headers, API, the relay's live updates). It runs on its own after
  every production deploy (`.github/workflows/smoke.yml`).
- **TOT rehearsal.** `IRIS_NIM=... IRIS_PW=... node scripts/rehearse.mjs --tot`
  switches Mode TOT on, starts a TOT session, signs dummies in with the
  session code, ends it, switches TOT off and clears the TOT history. Add
  `--load 30 --menit 3` for 30 dummy Praktikan at once. Refused during class
  hours (06:00 to 21:00 WIB, Monday to Saturday) or while a session runs,
  unless `--force`. Credentials come from the environment only.
- **Backups.** `.github/workflows/backup.yml` dumps production every night at
  02:00 WIB, encrypted with age, kept 30 days as the `iris-backup` artifact.
  The private key is `~/.iris-backup/age-key.txt` on the maintainer's PC
  (keep a copy in a password manager: without it the backups can't be read).
  Restore into an empty database:

  ```sh
  gh run download <run-id> -R EintsWaveX/iris-iot -n iris-backup
  age -d -i ~/.iris-backup/age-key.txt iris-*.dump.age > iris.dump
  pg_restore --no-owner --no-acl -d "<empty database url>" iris.dump
  ```

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
