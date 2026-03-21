# TODOs

[ ] Add `ek update` to update the CLI
[ ] Move all CRUD secrets to `ek secret` command
[ ] Add cache to `ek run` command (in keyring)
[ ] Rework entire logging system -> better errors (with clear next steps + links to docs)
[ ] Auto reminder to update the CLI
[ ] Better ways to debug CLI
[x] Rework CI/CD pipelines
    - Make it faster (cache + blacksmith)
    - Add extra security checks (betterleaks, safechain, audit, ...)
[x] Remove setApiUrl command
[] Fix bug in install script
[x] Change license to MIT
[] Add PostHog logging for analytics
[x] Add script to run to debug CLI (creates binary and sets it as `ek-dev` in /usr/local/bin)
    - With parameters to set API and APP urls