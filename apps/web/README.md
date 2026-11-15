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

The site runs on the PC Server (a Node process, `npm run server`, behind a
Cloudflare tunnel). Merging to `main` does not change it: the Upgrade button
on the Server page, or `deploy/deploy.sh` on the PC, builds and restarts it
(see `deploy/DEPLOY.md`).

`npm run check` also typechecks `api/` under the stricter module rules in
`tsconfig.api.json`, so an import the server would reject fails locally and in
CI first.

## Production checks and backups

- **Smoke test.** `node scripts/rehearse.mjs` checks the live site read-only
  (pages, headers, API, the relay's live updates). It runs on its own every
  morning at 05:30 WIB (`.github/workflows/smoke.yml`) and can be run by hand.
- **TOT rehearsal.** `IRIS_NIM=... IRIS_PW=... node scripts/rehearse.mjs --tot`
  switches Mode TOT on, starts a TOT session, signs dummies in with the
  session code, ends it, switches TOT off and clears the TOT history. Add
  `--load 30 --menit 3` for 30 dummy Praktikan at once. Refused during class
  hours (06:00 to 21:00 WIB, Monday to Saturday) or while a session runs,
  unless `--force`. Credentials come from the environment only.
- **Backups.** The PC runs a nightly `pg_dump`, encrypted with age and
  uploaded to the R2 bucket `iris-backups` (30 days kept); see
  `deploy/DEPLOY.md` section 2c. The private key is
  `~/.iris-backup/age-key.txt` on the maintainer's PC (keep a copy in a
  password manager: without it the backups can't be read).
  `deploy/restore-drill.sh` proves a backup restores into a scratch database.

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
