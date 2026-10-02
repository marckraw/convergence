# Provider logo assets

Bundled locally; no CDN requests at runtime.

- `anthropic.svg`, `openai.svg`, `cursor.svg`, `google.svg`, `openrouter.svg`: unchanged SVGs from [Lobe Icons](https://github.com/lobehub/lobe-icons), `@lobehub/icons-static-svg` **1.95.0**, distributed under the adjacent MIT license. Download: https://registry.npmjs.org/@lobehub/icons-static-svg/-/icons-static-svg-1.95.0.tgz
- `pi.svg`: unchanged primary logo from the [Pi press kit](https://pi.dev/press-kit), downloaded from https://pi.dev/logo.svg on 2026-09-12. Pi is the coding agent, not Inflection's chatbot.

Brand names and marks belong to their respective owners. These marks identify integrations, not endorsement.

`ProviderIcon` uses the SVGs as masks so their monochrome shapes follow the app's foreground color in both themes. Pi's square source includes extra clear space, compensated optically by mask sizing. Known provider IDs take precedence over display names and model vendors: Pi running an Anthropic model still carries the Pi mark. Unknown providers keep initials and their original label.
