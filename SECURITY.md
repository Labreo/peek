# Security and privacy

- **Never commit an API key.** Peek reads `PRESAGE_API_KEY` from a local `.env` file, which is gitignored. `.env.example` holds only the variable name.
- The Presage SDK opens the sensing camera natively in the main process. Peek never requests video output from the SDK. The window may open a second camera only for the optional presenter view, video only, no microphone, displayed on screen and never stored. Peek blocks navigation and new windows.
- Peek stores no video. Readings stay in memory unless the player saves a run file, which goes to `~/Documents/Peek/runs/` on their own machine. Run files hold lid angles and Presage readings, so treat them as personal data before sharing them.
- Presage SDK telemetry is turned off in code (`enableTelemetry: false`).

To report a problem, open a GitHub issue without including keys or run files, or contact the maintainer through GitHub.
