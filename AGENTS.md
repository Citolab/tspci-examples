# Agent instructions for tspci-examples

## Porting open-source PCIs: credit the authors and keep their licence

When an example is a port of an existing open-source PCI, or takes ideas from one (its interaction, scenario, model,
response format or scoring), we credit the original authors and take over the original licence. **This applies even
when we rewrote it entirely and use no code or images of the original.** "Written from scratch, so it can stay MIT" is
not a reason to drop the original licence. We do this because it is the fair thing to do towards the people whose work
we build on, not only because the law may require it.

For such an example:

- **`LICENSE`**: the full text of the original licence in the example's folder (copy one from an existing port, e.g.
  `tspci-bee-colony/LICENSE` for GPL-2.0 or `tspci-paint/LICENSE` for GPL-3.0). Use the exact SPDX id, e.g.
  `GPL-2.0-only`, not `GPL-2.0-or-later`, unless the original says "or later".
- **`package.json`**: `"license"` set to that SPDX id, the original authors in `"contributors"` (who, and which original
  PCI), and `"LICENSE"` in `"files"` so it is published.
- **`package-lock.json`**: the root package's `"license"` updated to match.
- **Source files**: no licence header needed in each file; `package.json` and `LICENSE` are enough. (Some older ports
  have SPDX headers in their source files; those can stay.)
- **Example README**: a "Source and licence" section with a link to the original, its authors, its licence and where
  that licence is stated, and what we changed or added.
- **Root `readme.md`**: a row in the table under "Ports of open-source PCIs" (example, original with link, licence), and
  the count of ports in the introduction.

Before porting, check the original's licence (its `LICENSE`, `composer.json`/`package.json` and file headers; when they
disagree, follow the strictest). If it has no licence, or one we cannot take over (e.g. AGPL for a bundled application),
ask before porting. The rest of this repository is MIT (the root `LICENSE`); a licence that differs from it must be
stated in the example's README.
