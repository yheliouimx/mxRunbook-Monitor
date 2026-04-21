# Client Folder GUI — Plan & TODO

This document holds the actionable todo list and high-level plan for a
non-technical GUI that helps users convert runbook Excel/CSV files into
the `runbook.json` format consumed by the dashboard. The GUI will guide
users through file selection, mapping creation, validation, preview and
export, and should follow the dashboard's visual language.

## Goals / Success Criteria

- Non-technical users can produce a valid `runbook.json` from Excel/CSV.
- Mapping and config files can be saved, edited, and reused.
- UI matches the dashboard look-and-feel (colors, typography, spacing).
- Integrates with `adapter/convert.py` for conversions and validation.

## TODO

- [ ] Define scope and success criteria
- [ ] Identify user personas and workflows
- [ ] Select tech stack and packaging (Electron/Tauri/web app)
- [ ] Design UI wireframes and flows
- [ ] Design visual theme matching the dashboard
- [ ] Specify mapping-wizard question flow
- [ ] Define input validation and preview behavior
- [ ] Integrate with `adapter/convert.py`
- [ ] Implement file picker and parsing
- [ ] Implement mapping assistant UI (field mapping, category mapping)
- [ ] Add preview, save, and export features (mapping + runbook.json)
- [ ] Write tests and validation suites
- [ ] Create user documentation and in-app help (quick tutorial)
- [ ] Conduct usability testing with non-technical users and iterate
- [ ] Package, distribute, and release installers

## Notes

- Prefer to reuse existing `mapping.yml` and `config.json` patterns.
- Keep the mapping flow short: detect headers → ask 3–6 confirmatory questions → show preview.
- Provide an "Auto-detect mapping" option using `adapter/autodetect.py` output.
- Offer a one-click preview that runs `convert.py --validate` on the sample.

---

Created from the interactive todo list generated in-session.
