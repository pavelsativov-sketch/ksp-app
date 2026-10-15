Executor service for running whitelisted OS commands in a controlled environment.

How it works
- The Next.js app (or agent orchestrator) calls the executor at EXECUTOR_URL/run
- Requests must be signed using EXECUTOR_AUTH_SECRET in the same way browser-rpc-worker uses x-mekty-timestamp and x-mekty-signature
- The executor only allows commands listed in the ALLOWED_COMMANDS env var (comma-separated)
- The executor runs the command without shell (spawn) and enforces a timeout

Run locally with Docker

1. Build image:

   docker build -t ksp-executor ./executor

2. Run:

   docker run -e EXECUTOR_AUTH_SECRET=change-me -e ALLOWED_COMMANDS="echo,ls,cat,git" -p 4000:4000 ksp-executor

3. In your Next.js app set:

   EXECUTOR_URL=http://localhost:4000
   EXECUTOR_AUTH_SECRET=change-me

Security note
- This executor is intentionally minimal. For production you MUST run it in an isolated host or VM, restrict network egress, run under an unprivileged user, and fine-tune ALLOWED_COMMANDS. Consider container runtime limits (cgroups), filesystem read-only mounts, and ephemeral workdirs.
