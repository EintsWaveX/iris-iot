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

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
